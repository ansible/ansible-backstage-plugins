/**
 * FindingsParser — extracts, maps, groups, and aggregates compliance findings.
 *
 * Extracted from ComplianceService to isolate finding-related logic.
 * The DB rule_metadata table is the sole source of enrichment metadata;
 * YAML fallback has been removed (see refactoring notes).
 */
import { LoggerService } from '@backstage/backend-plugin-api';

import type {
  MultiHostFinding,
  StoredFinding,
  JobEvent,
  IngestFinding,
  RuleMetadataRecord,
  FindingState,
} from '@ansible/backstage-compliance-common';

import { ComplianceDatabase } from '../database/ComplianceDatabase';

function safeParseEvidence(raw: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// ─── Severity mapping (Track A uses lowercase, stored as CAT_*) ──────

const SEVERITY_MAP: Record<string, string> = {
  high: 'CAT_I',
  medium: 'CAT_II',
  low: 'CAT_III',
};

/**
 * Shape of a single finding from the normalize_xccdf module output (Track B)
 * or the legacy compliance_evaluate module (deprecated, replaced by OpenSCAP
 * scanning -- see ADR-004). Findings are delivered via Direct POST to
 * /findings/ingest (ADR-007); event parsing is the fallback.
 */
interface RawControllerFinding {
  rule_id: string;
  stig_id?: string;
  title?: string;
  severity?: string;
  status: string;
  host?: string;
  evidence?: string | Record<string, unknown>;
  actual_value?: string;
  expected_value?: string;
  category?: string;
  check_type?: string;
  fix_text?: string;
  check_text?: string;
  disruption?: string;
  parameters?: unknown[];
}

export function buildRuleMetadataRecords(
  rawFindings: Array<Record<string, unknown>>,
): RuleMetadataRecord[] {
  const ruleMap = new Map<string, Record<string, unknown>>();
  for (const raw of rawFindings) {
    const ruleId = raw.rule_id as string;
    if (ruleId && !ruleMap.has(ruleId)) {
      ruleMap.set(ruleId, raw);
    }
  }
  return Array.from(ruleMap.values()).map(raw => ({
    ruleId: raw.rule_id as string,
    stigId: (raw.stig_id as string) || '',
    title: (raw.title as string) || (raw.rule_id as string),
    description: (raw.description as string) || '',
    checkText: (raw.check_text as string) || '',
    fixText: (raw.fix_text as string) || '',
    category: (raw.category as string) || '',
    disruption: ((raw.disruption as string) || 'medium') as
      | 'low'
      | 'medium'
      | 'high',
    aapImpact: ((raw.aap_impact as string) || 'safe') as
      | 'safe'
      | 'caution'
      | 'breaks-connectivity',
    aapImpactReason: (raw.aap_impact_reason as string) || '',
    scanner: (raw.scanner as string) || 'openscap',
    updatedAt: new Date().toISOString(),
  }));
}

export class FindingsParser {
  private readonly database: ComplianceDatabase | null;

  constructor(_logger: LoggerService, database: ComplianceDatabase | null) {
    this.database = database;
  }

  // ─── Grouping ──────────────────────────────────────────────────────

  groupFindingsByRule(stored: StoredFinding[]) {
    const byRule = new Map<
      string,
      {
        finding: StoredFinding;
        hosts: Array<{
          host: string;
          status: 'pass' | 'fail' | 'error' | 'not_applicable';
          actualValue: string;
          expectedValue: string;
          findingState?: FindingState | null;
        }>;
        seenHosts: Set<string>;
      }
    >();
    for (const f of stored) {
      let entry = byRule.get(f.ruleId);
      if (!entry) {
        entry = { finding: f, hosts: [], seenHosts: new Set() };
        byRule.set(f.ruleId, entry);
      }
      if (entry.seenHosts.has(f.host)) continue;
      entry.seenHosts.add(f.host);
      const status = (
        ['pass', 'fail', 'error', 'not_applicable'].includes(f.status)
          ? f.status
          : 'error'
      ) as 'pass' | 'fail' | 'error' | 'not_applicable';
      entry.hosts.push({
        host: f.host,
        status,
        actualValue: f.actualValue,
        expectedValue: f.expectedValue,
        findingState: f.findingState,
      });
    }
    return byRule;
  }

  // ─── Multi-host building (DB metadata only) ───────────────────────

  buildMultiHostFindings(
    byRule: ReturnType<FindingsParser['groupFindingsByRule']>,
    dbMeta: Map<string, RuleMetadataRecord>,
  ): MultiHostFinding[] {
    const results: MultiHostFinding[] = [];
    for (const [ruleId, entry] of byRule) {
      const passCount = entry.hosts.filter(h => h.status === 'pass').length;
      const failCount = entry.hosts.filter(h => h.status === 'fail').length;
      const naCount = entry.hosts.filter(
        h => h.status === 'not_applicable',
      ).length;
      const dm = dbMeta.get(ruleId);

      const stateSummary = { new: 0, active: 0, fixed: 0, resurfaced: 0 };
      for (const h of entry.hosts) {
        if (h.findingState === 'new') stateSummary.new++;
        else if (h.findingState === 'active') stateSummary.active++;
        else if (h.findingState === 'fixed') stateSummary.fixed++;
        else if (h.findingState === 'resurfaced') stateSummary.resurfaced++;
      }

      // totalCount excludes N/A so pass rate = passCount / totalCount is accurate
      const applicableHosts = entry.hosts.filter(
        h => h.status !== 'not_applicable',
      ).length;

      results.push({
        ruleId,
        stigId: dm?.stigId || entry.finding.stigId,
        title: dm?.title || ruleId,
        description: dm?.description || '',
        fixText: dm?.fixText || '',
        checkText: dm?.checkText || '',
        severity:
          (entry.finding.severity as 'CAT_I' | 'CAT_II' | 'CAT_III') ||
          'CAT_II',
        category: dm?.category || '',
        disruption: (dm?.disruption || 'medium') as 'low' | 'medium' | 'high',
        aapImpact: ((dm?.aapImpact && dm.aapImpact !== 'safe'
          ? dm.aapImpact
          : null) || 'safe') as 'safe' | 'caution' | 'breaks-connectivity',
        aapImpactReason: dm?.aapImpactReason || '',
        automationAvailable: !!(dm?.fixText && /^\s*- name:/m.test(dm.fixText)),
        evidence: entry.finding.evidence
          ? safeParseEvidence(entry.finding.evidence)
          : undefined,
        parameters: [],
        hosts: entry.hosts,
        passCount,
        failCount,
        naCount,
        totalCount: applicableHosts,
        stateSummary,
      });
    }
    return results;
  }

  // ─── StoredFinding → MultiHostFinding converters ───────────────────

  storedFindingsToMultiHost(stored: StoredFinding[]): MultiHostFinding[] {
    // Filter out localhost findings — these are artifacts from the normalize
    // play (Play 2) which runs on localhost inside the EE container.
    const filtered = stored.filter(f => f.host !== 'localhost');
    const byRule = this.groupFindingsByRule(filtered);
    return this.buildMultiHostFindings(byRule, new Map());
  }

  async storedFindingsToMultiHostAsync(
    stored: StoredFinding[],
  ): Promise<MultiHostFinding[]> {
    const filtered = stored.filter(f => f.host !== 'localhost');
    const byRule = this.groupFindingsByRule(filtered);
    const ruleIds = Array.from(byRule.keys());
    let dbMeta = new Map<string, RuleMetadataRecord>();
    if (this.database) {
      try {
        dbMeta = await this.database.getRuleMetadataBulk(ruleIds);
      } catch {
        // DB metadata not available (table may not exist yet)
      }
    }
    return this.buildMultiHostFindings(byRule, dbMeta);
  }

  // ─── Public aggregation API ────────────────────────────────────────

  aggregateFindings(
    stored: Array<Omit<StoredFinding, 'id'>>,
  ): MultiHostFinding[] {
    return this.storedFindingsToMultiHost(stored as StoredFinding[]);
  }

  async aggregateFindingsWithMetadata(
    stored: Array<Omit<StoredFinding, 'id'>>,
  ): Promise<MultiHostFinding[]> {
    return this.storedFindingsToMultiHostAsync(stored as StoredFinding[]);
  }

  // ─── Event parsing ─────────────────────────────────────────────────

  /**
   * Parse job events from the normalize job into StoredFinding rows.
   *
   * This is the fallback path -- findings are normally delivered via
   * Direct POST (ADR-007). Supports two tracks:
   *   - Track B: normalize_xccdf output surfaced through ansible_facts
   *   - Track A (legacy): compliance_evaluate module output (deprecated,
   *     replaced by OpenSCAP scanning -- see ADR-004)
   *
   * In both cases, the per-host findings appear in event_data.res.findings
   * or event_data.res.ansible_facts.findings.
   */
  parseJobEvents(
    events: JobEvent[],
    scanId: string,
  ): Array<Omit<StoredFinding, 'id'>> {
    const findings: Array<Omit<StoredFinding, 'id'>> = [];

    for (const event of events) {
      const eventData = event.event_data as Record<string, unknown>;
      const res = eventData?.res as Record<string, unknown> | undefined;
      if (!res) continue;

      // Determine the host — from event_data.host, event.host_name, or
      // the module's own 'host' return value
      const host =
        (eventData.host as string) ||
        event.host_name ||
        (res.host as string) ||
        'unknown';

      // Look for findings in multiple locations:
      // 1. res.findings (direct module output -- legacy compliance_evaluate, deprecated)
      // 2. res.ansible_facts.findings (facts-based output)
      // 3. res.ansible_facts.compliance_results.findings (nested facts)
      // 4. res.ansible_facts.compliance_report.findings (consolidated report)
      const factsSource = (res.ansible_facts as Record<string, unknown>) ?? {};

      const rawFindings: RawControllerFinding[] | undefined =
        (res.findings as RawControllerFinding[]) ??
        (factsSource.findings as RawControllerFinding[]) ??
        ((factsSource.compliance_results as Record<string, unknown>)
          ?.findings as RawControllerFinding[] | undefined) ??
        ((factsSource.compliance_report as Record<string, unknown>)
          ?.findings as RawControllerFinding[] | undefined);

      if (rawFindings && Array.isArray(rawFindings)) {
        for (const raw of rawFindings) {
          // Track A findings carry a host field; Track B may have per-host
          const findingHost = raw.host || host;
          findings.push(this.mapRawFinding(raw, findingHost, scanId));
        }
      }
    }

    return findings;
  }

  // ─── Raw finding mapping ───────────────────────────────────────────

  /**
   * Map a single raw finding from the Ansible module output to our
   * StoredFinding format. Public wrapper for the ingest endpoint.
   */
  mapRawFindingPublic(
    raw: IngestFinding,
    host: string,
    scanId: string,
  ): Omit<StoredFinding, 'id'> {
    return this.mapRawFinding(raw as RawControllerFinding, host, scanId);
  }

  mapRawFinding(
    raw: RawControllerFinding,
    host: string,
    scanId: string,
  ): Omit<StoredFinding, 'id'> {
    // Map severity: the module uses lowercase (high/medium/low),
    // but the XCCDF normalizer already maps to CAT_I/II/III.
    // Handle both cases.
    let severity = raw.severity ?? 'medium';
    if (!severity.startsWith('CAT_')) {
      severity = SEVERITY_MAP[severity.toLowerCase()] ?? 'CAT_II';
    }

    // Evidence can be a string or a structured object
    let evidence: string | null = null;
    if (typeof raw.evidence === 'string') {
      evidence = raw.evidence;
    } else if (raw.evidence && typeof raw.evidence === 'object') {
      evidence = JSON.stringify(raw.evidence);
    }

    // Extract actual/expected values from explicit fields or parse from evidence string.
    // Evidence format: "sshd_config clientaliveinterval: <actual> (expected: <expected>)"
    let actualValue = raw.actual_value ?? '';
    let expectedValue = raw.expected_value ?? '';

    if (
      !actualValue &&
      !expectedValue &&
      raw.evidence &&
      typeof raw.evidence === 'object'
    ) {
      const ev = raw.evidence as Record<string, unknown>;
      actualValue = String(ev.actual ?? ev.actual_value ?? '');
      expectedValue = String(ev.expected ?? ev.expected_value ?? '');
    }

    if (!actualValue && !expectedValue && typeof raw.evidence === 'string') {
      const evidenceStr = raw.evidence;
      const expMatch = evidenceStr.match(/\(expected:\s*(.+?)\)\s*$/);
      if (expMatch) {
        expectedValue = expMatch[1].trim();
        const beforeParen = evidenceStr.slice(0, evidenceStr.lastIndexOf('('));
        const colonIdx = beforeParen.lastIndexOf(':');
        if (colonIdx >= 0) {
          actualValue = beforeParen.slice(colonIdx + 1).trim() || '(not set)';
        }
      }
    }

    return {
      scanId,
      ruleId: raw.rule_id,
      stigId: raw.stig_id ?? '',
      host,
      status: raw.status,
      severity,
      actualValue,
      expectedValue,
      evidence,
      findingState: null,
    };
  }
}
