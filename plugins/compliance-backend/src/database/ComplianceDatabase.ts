/**
 * Knex-based data access layer for compliance plugin persistence.
 */
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

import type {
  ComplianceScan,
  StoredFinding,
  FindingState,
  PostureSnapshot,
  RemediationProfile,
  RemediationSelection,
  ComplianceProfile,
  SaveProfileRequest,
  RuleMetadataRecord,
  RemediationExecution,
  RemediationExecutionStatus,
  RemediationProfileStatus,
  BaselineTarget,
} from '@ansible/backstage-compliance-common';

export type CreateScanInput = Omit<ComplianceScan, 'id' | 'errorDetails'> & {
  errorDetails?: string | null;
};
export type FindingInput = Omit<
  StoredFinding,
  'id' | 'scanId' | 'findingState'
> & { scanId?: string; findingState?: FindingState | null };
export type RuleMetadataInput = Omit<
  RuleMetadataRecord,
  'aapImpact' | 'aapImpactReason'
> & { aapImpact?: string; aapImpactReason?: string };

function toISOString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return '';
}

function toISOStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toISOString(value);
}

function safeJsonParse<T>(value: unknown): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value as string);
  } catch {
    return null;
  }
}

export class ComplianceDatabase {
  constructor(private readonly db: Knex) {}

  // ─── Scans ──────────────────────────────────────────────────────────

  async createScan(scan: CreateScanInput): Promise<ComplianceScan> {
    const id = randomUUID();
    const row = { id, ...scan };
    await this.db('compliance_scans').insert({
      id: row.id,
      profile_id: row.profileId,
      inventory_id: row.inventoryId,
      scanner: row.scanner,
      scan_type: row.scanType || 'assessment',
      workflow_job_id: row.workflowJobId,
      profile_version: row.profileVersion ?? null,
      status: row.status,
      started_at: row.startedAt,
      completed_at: row.completedAt,
      ...(row.scanMetadata
        ? { scan_metadata: JSON.stringify(row.scanMetadata) }
        : {}),
    });
    return { ...row, id, errorDetails: row.errorDetails ?? null };
  }

  async updateScanWorkflowJobId(
    scanId: string,
    workflowJobId: number,
  ): Promise<void> {
    await this.db('compliance_scans')
      .where('id', scanId)
      .update({ workflow_job_id: workflowJobId });
  }

  async updateScanStatus(
    scanId: string,
    status: string,
    completedAt?: string,
  ): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (completedAt) {
      update.completed_at = completedAt;
    }
    await this.db('compliance_scans').where('id', scanId).update(update);
  }

  async updateScanMetadata(
    scanId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db('compliance_scans')
      .where('id', scanId)
      .update({
        scan_metadata: JSON.stringify(metadata),
      });
  }

  async mergeScanMetadata(
    scanId: string,
    hostname: string,
    hostMeta: {
      totalScannedPackages?: number;
      totalVulnerablePackages?: number;
      totalVulnerabilities?: number;
    },
  ): Promise<void> {
    await this.db.transaction(async trx => {
      const row = await trx('compliance_scans')
        .where('id', scanId)
        .select('scan_metadata')
        .first();
      const existing = row?.scan_metadata
        ? safeJsonParse<Record<string, unknown>>(row.scan_metadata as string) ??
          {}
        : {};
      const hosts = (existing.hosts ?? {}) as Record<
        string,
        Record<string, number>
      >;
      hosts[hostname] = {
        ...(hostMeta.totalScannedPackages !== undefined
          ? { totalScannedPackages: hostMeta.totalScannedPackages }
          : {}),
        ...(hostMeta.totalVulnerablePackages !== undefined
          ? { totalVulnerablePackages: hostMeta.totalVulnerablePackages }
          : {}),
        ...(hostMeta.totalVulnerabilities !== undefined
          ? { totalVulnerabilities: hostMeta.totalVulnerabilities }
          : {}),
      };
      let totalScannedPackages = 0;
      let totalVulnerablePackages = 0;
      let totalVulnerabilities = 0;
      for (const h of Object.values(hosts)) {
        totalScannedPackages += h.totalScannedPackages ?? 0;
        totalVulnerablePackages += h.totalVulnerablePackages ?? 0;
        totalVulnerabilities += h.totalVulnerabilities ?? 0;
      }
      await trx('compliance_scans')
        .where('id', scanId)
        .update({
          scan_metadata: JSON.stringify({
            hosts,
            totalScannedPackages,
            totalVulnerablePackages,
            totalVulnerabilities,
          }),
        });
    });
  }

  async getScanById(id: string): Promise<ComplianceScan | null> {
    const row = await this.db('compliance_scans').where('id', id).first();
    if (!row) return null;
    return this.mapScanRow(row);
  }

  async getScanByWorkflowJobId(
    workflowJobId: number,
  ): Promise<ComplianceScan | null> {
    const row = await this.db('compliance_scans')
      .where('workflow_job_id', workflowJobId)
      .first();
    if (!row) return null;
    return this.mapScanRow(row);
  }

  /**
   * Persist findings for an existing scan record.
   * Unlike saveScanResults (which creates the scan too), this method
   * attaches findings to an already-created scan row.
   */
  async saveFindingsForScan(
    scanId: string,
    findings: Array<FindingInput>,
  ): Promise<number> {
    if (findings.length === 0) return 0;

    const mapped = findings.map(f => ({
      id: randomUUID(),
      scan_id: scanId,
      rule_id: f.ruleId,
      stig_id: f.stigId,
      host: f.host,
      status: f.status,
      severity: f.severity,
      actual_value: f.actualValue,
      expected_value: f.expectedValue,
      evidence: f.evidence,
      finding_state: f.findingState ?? null,
    }));

    // Deduplicate by (scan_id, rule_id, host) within the batch to avoid
    // PostgreSQL "ON CONFLICT DO UPDATE cannot affect row a second time"
    // error. Supply chain scans may produce duplicate CVE matches for the
    // same package (different match contexts in Grype output). Keep last.
    const deduped = new Map<string, (typeof mapped)[0]>();
    for (const row of mapped) {
      deduped.set(`${row.scan_id}\0${row.rule_id}\0${row.host}`, row);
    }
    const rows = Array.from(deduped.values());

    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      await this.db('compliance_findings')
        .insert(rows.slice(i, i + batchSize))
        .onConflict(['scan_id', 'rule_id', 'host'])
        .merge([
          'status',
          'severity',
          'actual_value',
          'expected_value',
          'evidence',
          'finding_state',
        ]);
    }

    return findings.length;
  }

  /**
   * Find the most recent completed scan (assessment or verification) for the
   * same profile that was completed before the given scan. Used to provide
   * before/after comparison.
   */
  async getPreviousScan(
    currentScan: ComplianceScan,
  ): Promise<ComplianceScan | null> {
    const row = await this.db('compliance_scans')
      .where('profile_id', currentScan.profileId)
      .whereIn('scan_type', ['assessment', 'verification'])
      .where('status', 'completed')
      .where('scanner', 'oscap')
      .where('started_at', '<', currentScan.startedAt)
      .orderBy('started_at', 'desc')
      .first();
    if (!row) return null;
    return this.mapScanRow(row);
  }

  async getPreviousScanForInventory(
    profileId: string,
    inventoryId: number,
    beforeTimestamp: string,
  ): Promise<ComplianceScan | null> {
    // Include both assessment and verification scans — our architecture runs
    // the full XCCDF evaluation for both types, so verification scans produce
    // the same complete finding data and are valid for state comparison.
    const row = await this.db('compliance_scans')
      .where('profile_id', profileId)
      .where('inventory_id', inventoryId)
      .where('status', 'completed')
      .where('scanner', 'oscap')
      .where('started_at', '<', beforeTimestamp)
      .orderBy('started_at', 'desc')
      .first();
    if (!row) return null;
    return this.mapScanRow(row);
  }

  /**
   * Compute finding-level states for a scan by comparing against the
   * previous scan for the same (profile, inventory). Updates finding_state
   * in-place via batch UPDATE.
   */
  async computeFindingStates(
    scanId: string,
    profileId: string,
    inventoryId: number,
  ): Promise<void> {
    const scan = await this.getScanById(scanId);
    if (!scan) return;

    const prevScan = await this.getPreviousScanForInventory(
      profileId,
      inventoryId,
      scan.startedAt,
    );

    const currentFindings = await this.db('compliance_findings')
      .where('scan_id', scanId)
      .select('id', 'rule_id', 'host', 'status');

    if (currentFindings.length === 0) return;

    // Build lookup from previous scan
    const prevMap = new Map<
      string,
      { status: string; findingState: string | null }
    >();
    if (prevScan) {
      const prevFindings = await this.db('compliance_findings')
        .where('scan_id', prevScan.id)
        .select('rule_id', 'host', 'status', 'finding_state');
      for (const pf of prevFindings) {
        prevMap.set(`${pf.rule_id}|${pf.host}`, {
          status: pf.status as string,
          findingState: pf.finding_state as string | null,
        });
      }
    }

    // Compute states and batch update
    const updates: Array<{ id: string; state: FindingState | null }> = [];
    for (const cf of currentFindings) {
      const key = `${cf.rule_id}|${cf.host}`;
      const prev = prevMap.get(key);
      let state: FindingState | null = null;

      if (cf.status === 'fail') {
        if (!prev) {
          state = 'new';
        } else if (prev.status === 'fail') {
          state = 'active';
        } else if (prev.status === 'pass' && prev.findingState === 'fixed') {
          state = 'resurfaced';
        } else {
          state = 'new';
        }
      } else if (cf.status === 'pass') {
        if (prev && prev.status === 'fail') {
          state = 'fixed';
        }
      }

      updates.push({ id: cf.id as string, state });
    }

    // Group by state and do bulk UPDATEs (4 statements max, regardless of finding count)
    const byState = new Map<string | null, string[]>();
    for (const u of updates) {
      const key = u.state ?? '__null__';
      let ids = byState.get(key);
      if (!ids) {
        ids = [];
        byState.set(key, ids);
      }
      ids.push(u.id);
    }
    for (const [key, ids] of byState) {
      if (key === '__null__') continue;
      const batchSize = 500;
      for (let i = 0; i < ids.length; i += batchSize) {
        await this.db('compliance_findings')
          .whereIn('id', ids.slice(i, i + batchSize))
          .update({ finding_state: key });
      }
    }
  }

  async getRecentScans(limit: number = 10): Promise<ComplianceScan[]> {
    const rows = await this.db('compliance_scans')
      .orderBy('started_at', 'desc')
      .limit(limit);
    return rows.map(this.mapScanRow);
  }

  async getLatestScanPerProfileInventory(): Promise<ComplianceScan[]> {
    const rows = await this.db('compliance_scans as s')
      .join(
        this.db('compliance_scans')
          .select('profile_id', 'inventory_id')
          .max('completed_at as max_completed')
          .where('status', 'completed')
          .whereNot('scanner', 'remediation')
          .groupBy('profile_id', 'inventory_id')
          .as('latest'),
        function () {
          this.on('s.profile_id', 'latest.profile_id')
            .andOn('s.inventory_id', 'latest.inventory_id')
            .andOn('s.completed_at', 'latest.max_completed');
        },
      )
      .where('s.status', 'completed')
      .whereNot('s.scanner', 'remediation')
      .orderBy('s.completed_at', 'desc');
    return rows.map(this.mapScanRow);
  }

  async getAuthoritativeScan(
    profileId: string,
    inventoryId: number,
  ): Promise<ComplianceScan | null> {
    const row = await this.db('compliance_scans')
      .where('profile_id', profileId)
      .where('inventory_id', inventoryId)
      .where('scanner', 'oscap')
      .whereIn('scan_type', ['assessment', 'verification'])
      .where('status', 'completed')
      .orderBy('completed_at', 'desc')
      .first();
    if (!row) return null;
    return this.mapScanRow(row);
  }

  private mapScanRow(row: Record<string, unknown>): ComplianceScan {
    return {
      id: row.id as string,
      profileId: row.profile_id as string,
      profileVersion: (row.profile_version as string) ?? undefined,
      inventoryId: row.inventory_id as number,
      scanner: row.scanner as string,
      scanType: (row.scan_type as ComplianceScan['scanType']) || 'assessment',
      workflowJobId: row.workflow_job_id as number | null,
      status: row.status as ComplianceScan['status'],
      startedAt: toISOString(row.started_at),
      completedAt: toISOStringOrNull(row.completed_at),
      errorDetails: (row.error_details as string) ?? null,
      scanMetadata: row.scan_metadata
        ? safeJsonParse(row.scan_metadata as string)
        : null,
    };
  }

  // ─── Scan error details ────────────────────────────────────────────

  async updateScanErrorDetails(
    scanId: string,
    errorDetails: string,
  ): Promise<void> {
    await this.db('compliance_scans')
      .where('id', scanId)
      .update({ error_details: errorDetails });
  }

  // ─── Ingest tokens ─────────────────────────────────────────────────

  async storeIngestToken(scanId: string, token: string): Promise<void> {
    await this.db('compliance_scans')
      .where('id', scanId)
      .update({ ingest_token: token });
  }

  async getIngestToken(scanId: string): Promise<string | null> {
    const row = await this.db('compliance_scans')
      .where('id', scanId)
      .select('ingest_token')
      .first();
    if (!row) return null;
    return (row.ingest_token as string) || null;
  }

  // ─── Data retention ─────────────────────────────────────────────────

  /**
   * Delete findings from scans older than the specified number of days.
   *
   * Keeps the scan records (for history) but removes the findings data
   * to prevent unbounded table growth. Returns the number of findings
   * deleted.
   */
  async cleanupOldFindings(retentionDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffISO = cutoff.toISOString();

    // Find scans older than the retention cutoff
    const oldScanIds = await this.db('compliance_scans')
      .where('started_at', '<', cutoffISO)
      .select('id');

    if (oldScanIds.length === 0) return 0;

    const ids = oldScanIds.map(row => row.id as string);

    // Delete findings belonging to those scans
    const deleted = await this.db('compliance_findings')
      .whereIn('scan_id', ids)
      .delete();

    return deleted;
  }

  // ─── Findings ───────────────────────────────────────────────────────

  async saveScanResults(
    scan: CreateScanInput,
    findings: Array<FindingInput>,
  ): Promise<{ scanId: string; findingCount: number }> {
    const savedScan = await this.createScan(scan);

    if (findings.length > 0) {
      const rows = findings.map(f => ({
        id: randomUUID(),
        scan_id: savedScan.id,
        rule_id: f.ruleId,
        stig_id: f.stigId,
        host: f.host,
        status: f.status,
        severity: f.severity,
        actual_value: f.actualValue,
        expected_value: f.expectedValue,
        evidence: f.evidence,
        finding_state: f.findingState ?? null,
      }));

      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        await this.db('compliance_findings')
          .insert(rows.slice(i, i + batchSize))
          .onConflict(['scan_id', 'rule_id', 'host'])
          .merge([
            'status',
            'severity',
            'actual_value',
            'expected_value',
            'evidence',
            'finding_state',
          ]);
      }
    }

    return { scanId: savedScan.id, findingCount: findings.length };
  }

  async getLatestFindings(
    profileId?: string,
    inventoryId?: number,
  ): Promise<StoredFinding[]> {
    let scanQuery = this.db('compliance_scans')
      .whereExists(
        this.db('compliance_findings')
          .whereRaw('compliance_findings.scan_id = compliance_scans.id')
          .select(this.db.raw('1')),
      )
      .orderBy('started_at', 'desc')
      .first();

    if (profileId) {
      scanQuery = scanQuery.where('profile_id', profileId);
    }
    if (inventoryId !== undefined) {
      scanQuery = scanQuery.where('inventory_id', inventoryId);
    }

    const scan = await scanQuery;
    if (!scan) return [];

    const rows = await this.db('compliance_findings')
      .where('scan_id', scan.id)
      .orderBy('severity', 'asc');

    return rows.map(this.mapFindingRow);
  }

  async getFindingsByScanId(scanId: string): Promise<StoredFinding[]> {
    const rows = await this.db('compliance_findings')
      .where('scan_id', scanId)
      .orderBy('severity', 'asc');
    return rows.map(this.mapFindingRow);
  }

  async getFindingsByScanIdPaginated(
    scanId: string,
    opts: { limit: number; offset: number; severity?: string; status?: string },
  ): Promise<{
    findings: StoredFinding[];
    total: number;
    totalFailing: number;
  }> {
    // Paginate at the RULE level (not raw findings) so aggregation into
    // MultiHostFinding objects gets complete host lists per rule.
    // Step 1: Get paginated distinct rule_ids matching filters
    let ruleQuery = this.db('compliance_findings')
      .where('scan_id', scanId)
      .distinct('rule_id', 'severity');
    if (opts.severity) {
      ruleQuery = ruleQuery.where('severity', opts.severity);
    }
    if (opts.status) {
      ruleQuery = ruleQuery.where('status', opts.status);
    }

    // Count total unique rules + failing rules (for pagination controls and summary)
    const [countResult, failingResult] = await Promise.all([
      this.db('compliance_findings')
        .where('scan_id', scanId)
        .modify(qb => {
          if (opts.severity) qb.where('severity', opts.severity);
          if (opts.status) qb.where('status', opts.status);
        })
        .countDistinct('rule_id as cnt')
        .first(),
      this.db('compliance_findings')
        .where('scan_id', scanId)
        .where('status', 'fail')
        .modify(qb => {
          if (opts.severity) qb.where('severity', opts.severity);
        })
        .countDistinct('rule_id as cnt')
        .first(),
    ]);
    const total = Number((countResult as any)?.cnt ?? 0);
    const totalFailing = Number((failingResult as any)?.cnt ?? 0);

    // Get the rule_ids for this page
    const ruleRows = await ruleQuery
      .orderBy('severity', 'asc')
      .orderBy('rule_id', 'asc')
      .limit(opts.limit)
      .offset(opts.offset);
    const ruleIds = ruleRows.map((r: any) => r.rule_id as string);

    if (ruleIds.length === 0) {
      return { findings: [], total, totalFailing };
    }

    // Step 2: Fetch ALL raw findings for those rules (all hosts)
    const rows = await this.db('compliance_findings')
      .where('scan_id', scanId)
      .whereIn('rule_id', ruleIds)
      .orderBy('severity', 'asc')
      .orderBy('rule_id', 'asc');

    return { findings: rows.map(this.mapFindingRow), total, totalFailing };
  }

  async getAggregatedStatsByScanIds(scanIds: string[]): Promise<
    Map<
      string,
      {
        pass: number;
        fail: number;
        catI: number;
        na: number;
        hosts: Set<string>;
        rules: Set<string>;
        totalPackages?: number;
        totalScannedPackages?: number;
        totalVulnerablePackages?: number;
      }
    >
  > {
    if (scanIds.length === 0) return new Map();
    const rows = await this.db('compliance_findings')
      .select('scan_id', 'status', 'severity', 'host', 'rule_id')
      .whereIn('scan_id', scanIds);
    const result = new Map<
      string,
      {
        pass: number;
        fail: number;
        catI: number;
        na: number;
        hosts: Set<string>;
        rules: Set<string>;
        totalPackages?: number;
        totalScannedPackages?: number;
        totalVulnerablePackages?: number;
      }
    >();
    for (const row of rows) {
      const sid = row.scan_id as string;
      let entry = result.get(sid);
      if (!entry) {
        entry = {
          pass: 0,
          fail: 0,
          catI: 0,
          na: 0,
          hosts: new Set(),
          rules: new Set(),
        };
        result.set(sid, entry);
      }
      if (row.status === 'not_applicable') {
        entry.na++;
      } else {
        entry.hosts.add(row.host as string);
        entry.rules.add(row.rule_id as string);
        if (row.status === 'pass') entry.pass++;
        if (row.status === 'fail') {
          entry.fail++;
          if (row.severity === 'CAT_I') entry.catI++;
        }
      }
    }

    const scanMetaRows = await this.db('compliance_scans')
      .select('id', 'scan_metadata')
      .whereIn('id', scanIds)
      .whereNotNull('scan_metadata');
    for (const sr of scanMetaRows as Array<Record<string, unknown>>) {
      const meta = safeJsonParse<Record<string, unknown>>(
        sr.scan_metadata as string,
      );
      const entry = result.get(sr.id as string);
      if (entry && meta) {
        if (meta.totalPackages !== undefined)
          entry.totalPackages = Number(meta.totalPackages);
        if (meta.totalScannedPackages !== undefined)
          entry.totalScannedPackages = Number(meta.totalScannedPackages);
        if (meta.totalVulnerablePackages !== undefined)
          entry.totalVulnerablePackages = Number(meta.totalVulnerablePackages);
      }
    }

    return result;
  }

  async getDeltaBetweenScans(
    assessScanId: string,
    verifyScanId: string,
  ): Promise<{ fixed: number; regressed: number; unchanged: number }> {
    const rows = await this.db.raw(
      `
      SELECT
        SUM(CASE WHEN a.status = 'fail' AND v.status = 'pass' THEN 1 ELSE 0 END) AS fixed,
        SUM(CASE WHEN a.status = 'pass' AND v.status = 'fail' THEN 1 ELSE 0 END) AS regressed,
        SUM(CASE WHEN a.status = v.status THEN 1 ELSE 0 END) AS unchanged
      FROM compliance_findings a
      INNER JOIN compliance_findings v
        ON a.rule_id = v.rule_id AND a.host = v.host
      WHERE a.scan_id = ? AND v.scan_id = ?
        AND a.status IN ('pass','fail') AND v.status IN ('pass','fail')
    `,
      [assessScanId, verifyScanId],
    );
    const row = Array.isArray(rows) ? rows[0] : rows?.rows?.[0] ?? {};
    return {
      fixed: Number(row.fixed) || 0,
      regressed: Number(row.regressed) || 0,
      unchanged: Number(row.unchanged) || 0,
    };
  }

  async getBatchScanStatsAggregated(scanIds: string[]): Promise<
    Record<
      string,
      {
        pass: number;
        fail: number;
        rules: number;
        hosts: number;
        naCount: number;
        stateNew: number;
        stateFixed: number;
        stateResurfaced: number;
        totalPackages?: number;
        totalVulnerabilities?: number;
        totalScannedPackages?: number;
        totalVulnerablePackages?: number;
      }
    >
  > {
    if (scanIds.length === 0) return {};
    const rows = await this.db('compliance_findings')
      .select('scan_id')
      .count({ total: '*' })
      .sum({
        pass_count: this.db.raw("CASE WHEN status = 'pass' THEN 1 ELSE 0 END"),
      })
      .sum({
        fail_count: this.db.raw("CASE WHEN status = 'fail' THEN 1 ELSE 0 END"),
      })
      .sum({
        na_count: this.db.raw(
          "CASE WHEN status = 'not_applicable' THEN 1 ELSE 0 END",
        ),
      })
      .sum({
        state_new: this.db.raw(
          "CASE WHEN finding_state = 'new' THEN 1 ELSE 0 END",
        ),
      })
      .sum({
        state_fixed: this.db.raw(
          "CASE WHEN finding_state = 'fixed' THEN 1 ELSE 0 END",
        ),
      })
      .sum({
        state_resurfaced: this.db.raw(
          "CASE WHEN finding_state = 'resurfaced' THEN 1 ELSE 0 END",
        ),
      })
      .countDistinct({
        rule_count: this.db.raw(
          "CASE WHEN status != 'not_applicable' THEN rule_id END",
        ),
      })
      .countDistinct({
        host_count: this.db.raw(
          "CASE WHEN status != 'not_applicable' THEN host END",
        ),
      })
      .whereIn('scan_id', scanIds)
      .groupBy('scan_id');

    const scanMetaRows = await this.db('compliance_scans')
      .select('id', 'scan_metadata')
      .whereIn('id', scanIds)
      .whereNotNull('scan_metadata');
    const metaMap = new Map<string, Record<string, unknown>>();
    for (const sr of scanMetaRows as Array<Record<string, unknown>>) {
      const parsed = safeJsonParse<Record<string, unknown>>(
        sr.scan_metadata as string,
      );
      if (parsed) metaMap.set(sr.id as string, parsed);
    }

    const result: Record<
      string,
      {
        pass: number;
        fail: number;
        rules: number;
        hosts: number;
        naCount: number;
        stateNew: number;
        stateFixed: number;
        stateResurfaced: number;
        totalPackages?: number;
        totalVulnerabilities?: number;
        totalScannedPackages?: number;
        totalVulnerablePackages?: number;
      }
    > = {};
    for (const row of rows as Array<Record<string, unknown>>) {
      const sid = row.scan_id as string;
      const meta = metaMap.get(sid);
      result[sid] = {
        pass: Number(row.pass_count) || 0,
        fail: Number(row.fail_count) || 0,
        rules: Number(row.rule_count) || 0,
        hosts: Number(row.host_count) || 0,
        naCount: Number(row.na_count) || 0,
        stateNew: Number(row.state_new) || 0,
        stateFixed: Number(row.state_fixed) || 0,
        stateResurfaced: Number(row.state_resurfaced) || 0,
        ...(meta?.totalPackages !== undefined
          ? { totalPackages: Number(meta.totalPackages) }
          : {}),
        ...(meta?.totalVulnerabilities !== undefined
          ? { totalVulnerabilities: Number(meta.totalVulnerabilities) }
          : {}),
        ...(meta?.totalScannedPackages !== undefined
          ? { totalScannedPackages: Number(meta.totalScannedPackages) }
          : {}),
        ...(meta?.totalVulnerablePackages !== undefined
          ? { totalVulnerablePackages: Number(meta.totalVulnerablePackages) }
          : {}),
      };
    }
    return result;
  }

  async getAggregatedFindingsForScans(
    scanIds: string[],
    limit: number = 100,
  ): Promise<
    Array<{
      ruleId: string;
      stigId: string;
      host: string;
      status: string;
      severity: string;
      evidence: string | null;
    }>
  > {
    if (scanIds.length === 0) return [];
    return this.db('compliance_findings')
      .select(
        'rule_id as ruleId',
        'stig_id as stigId',
        'host',
        'status',
        'severity',
        'evidence',
      )
      .whereIn('scan_id', scanIds)
      .where('status', '!=', 'not_applicable')
      .where('host', '!=', 'localhost')
      .orderBy('severity', 'asc')
      .orderBy('rule_id', 'asc')
      .limit(limit * 20);
  }

  async getSummaryCounts(scanIds: string[]): Promise<{
    criticalHigh: number;
    fixable: number;
    unfixable: number;
    hostsAffected: number;
  }> {
    if (scanIds.length === 0)
      return { criticalHigh: 0, fixable: 0, unfixable: 0, hostsAffected: 0 };
    const rows = await this.db('compliance_findings')
      .select('severity', 'evidence', 'host')
      .whereIn('scan_id', scanIds)
      .where('status', 'fail')
      .where('host', '!=', 'localhost');
    let criticalHigh = 0;
    let fixable = 0;
    let unfixable = 0;
    const hostsSet = new Set<string>();
    for (const row of rows) {
      hostsSet.add(row.host as string);
      if (row.severity === 'CAT_I') criticalHigh++;
      const ev = row.evidence
        ? safeJsonParse<Record<string, unknown>>(row.evidence as string)
        : null;
      const isFixable =
        ev?.fix_state === 'fixed' &&
        Array.isArray(ev?.fix_versions) &&
        (ev.fix_versions as unknown[]).length > 0;
      if (isFixable) fixable++;
      else unfixable++;
    }
    return { criticalHigh, fixable, unfixable, hostsAffected: hostsSet.size };
  }

  async getHostSeverityCounts(scanIds: string[]): Promise<
    Array<{
      host: string;
      critical: number;
      medium: number;
      low: number;
      total: number;
    }>
  > {
    if (scanIds.length === 0) return [];
    const rows: any[] = await this.db('compliance_findings')
      .select(
        'host',
        this.db.raw('COUNT(*) as total'),
        this.db.raw(
          "SUM(CASE WHEN severity = 'CAT_I' THEN 1 ELSE 0 END) as critical",
        ),
        this.db.raw(
          "SUM(CASE WHEN severity = 'CAT_II' THEN 1 ELSE 0 END) as medium",
        ),
        this.db.raw(
          "SUM(CASE WHEN severity = 'CAT_III' THEN 1 ELSE 0 END) as low",
        ),
      )
      .whereIn('scan_id', scanIds)
      .where('status', 'fail')
      .where('host', '!=', 'localhost')
      .groupBy('host');
    return rows.map(r => ({
      host: r.host as string,
      critical: Number(r.critical) || 0,
      medium: Number(r.medium) || 0,
      low: Number(r.low) || 0,
      total: Number(r.total) || 0,
    }));
  }

  async getNotApplicableRules(
    scanId: string,
  ): Promise<Array<{ ruleId: string; ruleTitle: string; severity: string }>> {
    const rows = await this.db('compliance_findings as f')
      .leftJoin('compliance_rule_metadata as m', 'f.rule_id', 'm.rule_id')
      .distinct(
        'f.rule_id',
        this.db.raw('COALESCE(m.title, f.rule_id) as rule_title'),
        'f.severity',
      )
      .where('f.scan_id', scanId)
      .where('f.status', 'not_applicable')
      .orderBy('f.severity')
      .orderBy('rule_title')
      .limit(500);
    return rows.map((row: Record<string, unknown>) => ({
      ruleId: row.rule_id as string,
      ruleTitle: row.rule_title as string,
      severity: row.severity as string,
    }));
  }

  private mapFindingRow(row: Record<string, unknown>): StoredFinding {
    return {
      id: row.id as string,
      scanId: row.scan_id as string,
      ruleId: row.rule_id as string,
      stigId: row.stig_id as string,
      host: row.host as string,
      status: row.status as string,
      severity: row.severity as string,
      actualValue: row.actual_value as string,
      expectedValue: row.expected_value as string,
      evidence: (row.evidence as string | null) ?? null,
      findingState: (row.finding_state as FindingState | null) ?? null,
    };
  }

  // ─── Posture snapshots ──────────────────────────────────────────────

  async savePostureSnapshot(
    snapshot: Omit<PostureSnapshot, 'id'>,
  ): Promise<PostureSnapshot> {
    const id = randomUUID();
    await this.db('compliance_posture_snapshots').insert({
      id,
      profile_id: snapshot.profileId,
      inventory_id: snapshot.inventoryId ?? null,
      scan_id: snapshot.scanId ?? null,
      timestamp: snapshot.timestamp,
      total_hosts: snapshot.totalHosts,
      total_rules: snapshot.totalRules,
      pass_count: snapshot.passCount,
      fail_count: snapshot.failCount,
      compliance_pct: snapshot.compliancePct,
    });
    return { ...snapshot, id };
  }

  async getPostureHistory(
    profileId?: string,
    days: number = 30,
    inventoryId?: number,
  ): Promise<PostureSnapshot[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    let query = this.db('compliance_posture_snapshots')
      .leftJoin(
        'compliance_scans',
        'compliance_posture_snapshots.scan_id',
        'compliance_scans.id',
      )
      .select(
        'compliance_posture_snapshots.*',
        'compliance_scans.workflow_job_id as scan_workflow_job_id',
      )
      .where(
        'compliance_posture_snapshots.timestamp',
        '>=',
        cutoff.toISOString(),
      )
      .orderBy('compliance_posture_snapshots.timestamp', 'asc');

    if (profileId) {
      query = query.where('compliance_posture_snapshots.profile_id', profileId);
    }
    if (inventoryId !== undefined) {
      query = query.where(
        'compliance_posture_snapshots.inventory_id',
        inventoryId,
      );
    }

    const rows = await query;

    return rows.map(this.mapPostureRow);
  }

  async getExecutionsInTimeRange(
    since: string,
    inventoryId?: number,
  ): Promise<
    import('@ansible/backstage-compliance-common').RemediationEvent[]
  > {
    let query = this.db('compliance_remediation_executions')
      .where('completed_at', '>=', since)
      .where('status', 'succeeded')
      .orderBy('completed_at', 'asc')
      .select('id', 'completed_at', 'inventory_id', 'rules_applied', 'status');

    if (inventoryId !== undefined) {
      query = query.where('inventory_id', inventoryId);
    }

    const rows = await query;
    return rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      completedAt: toISOString(row.completed_at),
      inventoryId: row.inventory_id as number,
      rulesApplied: (row.rules_applied as number) ?? null,
      status: row.status as string,
    }));
  }

  private mapPostureRow(row: Record<string, unknown>): PostureSnapshot {
    return {
      id: row.id as string,
      profileId: row.profile_id as string,
      inventoryId: (row.inventory_id as number) ?? undefined,
      scanId: (row.scan_id as string) ?? undefined,
      workflowJobId: (row.scan_workflow_job_id as number) ?? undefined,
      timestamp: toISOString(row.timestamp),
      totalHosts: row.total_hosts as number,
      totalRules: row.total_rules as number,
      passCount: row.pass_count as number,
      failCount: row.fail_count as number,
      compliancePct: row.compliance_pct as number,
    };
  }

  async getLatestCompletedScan(
    profileId: string,
    inventoryId: number,
  ): Promise<ComplianceScan | null> {
    const row = await this.db('compliance_scans')
      .where('profile_id', profileId)
      .where('inventory_id', inventoryId)
      .where('status', 'completed')
      .whereNot('scanner', 'remediation')
      .orderBy('completed_at', 'desc')
      .first();
    if (!row) return null;
    return this.mapScanRow(row);
  }

  // ─── Per-host posture (ADR-023) ─────────────────────────────────────

  async getHostPosture(
    scanId: string,
  ): Promise<import('@ansible/backstage-compliance-common').HostPosture[]> {
    const rows = await this.db('compliance_findings')
      .where('scan_id', scanId)
      .whereIn('status', ['pass', 'fail', 'not_applicable'])
      .groupBy('host')
      .select(
        'host',
        this.db.raw(
          "COUNT(CASE WHEN status = 'pass' THEN 1 END) as pass_count",
        ),
        this.db.raw(
          "COUNT(CASE WHEN status = 'fail' THEN 1 END) as fail_count",
        ),
        this.db.raw(
          "COUNT(CASE WHEN status = 'not_applicable' THEN 1 END) as na_count",
        ),
        this.db.raw(
          "COUNT(CASE WHEN severity = 'CAT_I' AND status = 'fail' THEN 1 END) as cat_i_fail",
        ),
        this.db.raw(
          "COUNT(CASE WHEN severity = 'CAT_II' AND status = 'fail' THEN 1 END) as cat_ii_fail",
        ),
        this.db.raw(
          "COUNT(CASE WHEN severity = 'CAT_III' AND status = 'fail' THEN 1 END) as cat_iii_fail",
        ),
      );

    return rows.map((row: Record<string, unknown>) => {
      const pass = Number(row.pass_count) || 0;
      const fail = Number(row.fail_count) || 0;
      const total = pass + fail;
      return {
        hostname: row.host as string,
        passCount: pass,
        failCount: fail,
        naCount: Number(row.na_count) || 0,
        catIFail: Number(row.cat_i_fail) || 0,
        catIIFail: Number(row.cat_ii_fail) || 0,
        catIIIFail: Number(row.cat_iii_fail) || 0,
        compliancePct: total > 0 ? Math.round((pass / total) * 1000) / 10 : 0,
      };
    });
  }

  async getHostPostureBaseline(
    scanId: string,
    baselineRuleIds: string[],
  ): Promise<import('@ansible/backstage-compliance-common').HostPosture[]> {
    if (baselineRuleIds.length === 0) return [];
    const rows = await this.db('compliance_findings')
      .where('scan_id', scanId)
      .whereIn('rule_id', baselineRuleIds)
      .whereIn('status', ['pass', 'fail', 'not_applicable'])
      .groupBy('host')
      .select(
        'host',
        this.db.raw(
          "COUNT(CASE WHEN status = 'pass' THEN 1 END) as pass_count",
        ),
        this.db.raw(
          "COUNT(CASE WHEN status = 'fail' THEN 1 END) as fail_count",
        ),
        this.db.raw(
          "COUNT(CASE WHEN status = 'not_applicable' THEN 1 END) as na_count",
        ),
        this.db.raw(
          "COUNT(CASE WHEN severity = 'CAT_I' AND status = 'fail' THEN 1 END) as cat_i_fail",
        ),
        this.db.raw(
          "COUNT(CASE WHEN severity = 'CAT_II' AND status = 'fail' THEN 1 END) as cat_ii_fail",
        ),
        this.db.raw(
          "COUNT(CASE WHEN severity = 'CAT_III' AND status = 'fail' THEN 1 END) as cat_iii_fail",
        ),
      );

    return rows.map((row: Record<string, unknown>) => {
      const pass = Number(row.pass_count) || 0;
      const fail = Number(row.fail_count) || 0;
      const total = pass + fail;
      return {
        hostname: row.host as string,
        passCount: pass,
        failCount: fail,
        naCount: Number(row.na_count) || 0,
        catIFail: Number(row.cat_i_fail) || 0,
        catIIFail: Number(row.cat_ii_fail) || 0,
        catIIIFail: Number(row.cat_iii_fail) || 0,
        compliancePct: total > 0 ? Math.round((pass / total) * 1000) / 10 : 0,
      };
    });
  }

  async getHostFindings(
    scanId: string,
    hostname: string,
    limit: number = 50,
  ): Promise<
    import('@ansible/backstage-compliance-common').HostFindingSummary[]
  > {
    const rows = await this.db('compliance_findings as f')
      .leftJoin('compliance_rule_metadata as m', 'f.rule_id', 'm.rule_id')
      .where('f.scan_id', scanId)
      .where('f.host', hostname)
      .select(
        'f.rule_id',
        'f.stig_id',
        this.db.raw('COALESCE(m.title, f.rule_id) as title'),
        'f.severity',
        'f.status',
        'f.finding_state',
      )
      .orderByRaw(
        "CASE f.severity WHEN 'CAT_I' THEN 0 WHEN 'CAT_II' THEN 1 ELSE 2 END",
      )
      .orderByRaw(
        "CASE f.status WHEN 'fail' THEN 0 WHEN 'error' THEN 1 WHEN 'pass' THEN 2 ELSE 3 END",
      )
      .limit(limit);

    return rows.map((row: Record<string, unknown>) => ({
      ruleId: row.rule_id as string,
      stigId: (row.stig_id as string) || '',
      title: row.title as string,
      severity: row.severity as 'CAT_I' | 'CAT_II' | 'CAT_III',
      status: row.status as 'pass' | 'fail' | 'not_applicable' | 'error',
      findingState:
        (row.finding_state as import('@ansible/backstage-compliance-common').FindingState) ||
        null,
    }));
  }

  // ─── Remediation profiles ──────────────────────────────────────────

  async saveRemediationProfile(profile: {
    id?: string;
    name: string;
    description: string;
    profileId: string;
    creationScanId?: string;
    /** @deprecated Use creationScanId */
    scanId?: string;
    selections: Array<
      Omit<RemediationSelection, 'parameters'> & {
        parameters?: Record<string, string | number | boolean>;
      }
    >;
    status?: RemediationProfileStatus;
    createdBy?: string;
  }): Promise<{ id: string }> {
    const now = new Date().toISOString();
    const scanId = profile.creationScanId ?? profile.scanId ?? null;
    const status = profile.status ?? 'saved';

    if (profile.id) {
      await this.db('compliance_remediation_profiles')
        .where('id', profile.id)
        .update({
          name: profile.name,
          description: profile.description,
          profile_id: profile.profileId,
          creation_scan_id: scanId,
          selections_json: JSON.stringify(profile.selections),
          status,
          updated_at: now,
        });
      return { id: profile.id };
    }

    const id = randomUUID();
    const insertRow = {
      id,
      name: profile.name,
      description: profile.description,
      profile_id: profile.profileId,
      creation_scan_id: scanId,
      selections_json: JSON.stringify(profile.selections),
      status,
      created_by: profile.createdBy ?? null,
      created_at: now,
      updated_at: now,
    };

    if (status === 'draft') {
      const updated = await this.db('compliance_remediation_profiles')
        .where({
          name: profile.name,
          profile_id: profile.profileId,
          status: 'draft',
        })
        .update({
          description: profile.description,
          creation_scan_id: scanId,
          selections_json: insertRow.selections_json,
          updated_at: now,
        });
      if (updated > 0) {
        const existing = await this.db('compliance_remediation_profiles')
          .where({
            name: profile.name,
            profile_id: profile.profileId,
            status: 'draft',
          })
          .first('id');
        return { id: existing.id };
      }
    }

    await this.db('compliance_remediation_profiles').insert(insertRow);
    return { id };
  }

  async listRemediationProfiles(
    statusFilter?: RemediationProfileStatus | 'all',
  ): Promise<RemediationProfile[]> {
    let query = this.db('compliance_remediation_profiles')
      .select('compliance_remediation_profiles.*')
      .select(
        this.db.raw(
          '(SELECT COUNT(*) FROM compliance_remediation_executions WHERE remediation_profile_id = compliance_remediation_profiles.id) as execution_count',
        ),
      )
      .select(
        this.db.raw(
          '(SELECT MAX(started_at) FROM compliance_remediation_executions WHERE remediation_profile_id = compliance_remediation_profiles.id) as last_executed_at',
        ),
      )
      .orderBy('created_at', 'desc');

    if (statusFilter && statusFilter !== 'all') {
      query = query.where(
        'compliance_remediation_profiles.status',
        statusFilter,
      );
    } else if (!statusFilter) {
      query = query.whereNot(
        'compliance_remediation_profiles.status',
        'archived',
      );
    }

    const rows = await query;
    const profiles = rows.map((row: Record<string, unknown>) =>
      this.mapRemediationProfileRow(row),
    );

    if (profiles.length === 0) return profiles;

    const profileIds = profiles.map(p => p.id);
    const latestExecs = await this.db('compliance_remediation_executions as e1')
      .whereIn('e1.remediation_profile_id', profileIds)
      .whereRaw(
        'e1.id = (SELECT e2.id FROM compliance_remediation_executions e2 WHERE e2.remediation_profile_id = e1.remediation_profile_id ORDER BY e2.started_at DESC, e2.id DESC LIMIT 1)',
      )
      .select('*');

    const execByProfile = new Map<string, RemediationExecution>();
    for (const row of latestExecs) {
      execByProfile.set(
        row.remediation_profile_id as string,
        this.mapExecutionRow(row),
      );
    }
    for (const profile of profiles) {
      profile.latestExecution = execByProfile.get(profile.id) ?? null;
    }

    return profiles;
  }

  async updateRemediationProfileStatus(
    id: string,
    status: RemediationProfileStatus,
  ): Promise<boolean> {
    const updated = await this.db('compliance_remediation_profiles')
      .where('id', id)
      .update({ status, updated_at: new Date().toISOString() });
    return updated > 0;
  }

  async getRemediationProfile(id: string): Promise<RemediationProfile | null> {
    const row = await this.db('compliance_remediation_profiles')
      .select('compliance_remediation_profiles.*')
      .select(
        this.db.raw(
          '(SELECT COUNT(*) FROM compliance_remediation_executions WHERE remediation_profile_id = compliance_remediation_profiles.id) as execution_count',
        ),
      )
      .select(
        this.db.raw(
          '(SELECT MAX(started_at) FROM compliance_remediation_executions WHERE remediation_profile_id = compliance_remediation_profiles.id) as last_executed_at',
        ),
      )
      .where('compliance_remediation_profiles.id', id)
      .first();
    if (!row) return null;
    const profile = this.mapRemediationProfileRow(row);
    const latestExec = await this.db('compliance_remediation_executions')
      .where('remediation_profile_id', id)
      .orderBy('started_at', 'desc')
      .orderBy('id', 'desc')
      .first();
    profile.latestExecution = latestExec
      ? this.mapExecutionRow(latestExec)
      : null;
    return profile;
  }

  /**
   * Delete a remediation profile. Profiles with no execution history and
   * not pinned as a baseline can be deleted regardless of status.
   * Returns false if not found, throws if blocked by executions or baseline pin.
   */
  async deleteRemediationProfile(id: string): Promise<boolean> {
    const profile = await this.getRemediationProfile(id);
    if (!profile) return false;
    const executions = await this.getExecutionsByProfileId(id, 1);
    if (executions.length > 0) {
      throw new Error(
        'Cannot delete a profile with execution history. Archive it instead.',
      );
    }
    const isPinned = await this.isProfilePinnedAsBaseline(id);
    if (isPinned) {
      throw new Error(
        'Cannot delete a profile pinned as a baseline. Unpin it first.',
      );
    }
    const deleted = await this.db('compliance_remediation_profiles')
      .where('id', id)
      .delete();
    return deleted > 0;
  }

  private mapRemediationProfileRow(
    row: Record<string, unknown>,
  ): RemediationProfile {
    let selections: RemediationSelection[] = [];
    try {
      selections = JSON.parse(row.selections_json as string);
    } catch {
      // corrupted data — return empty
    }
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) || '',
      complianceProfileId: row.profile_id as string,
      creationScanId: (row.creation_scan_id as string) || undefined,
      targetInventory: '',
      status: (row.status as RemediationProfileStatus) || 'saved',
      createdBy: (row.created_by as string) || undefined,
      selections,
      createdAt: toISOString(row.created_at),
      updatedAt: toISOString(row.updated_at),
      executionCount: (row.execution_count as number) ?? undefined,
      lastExecutedAt: toISOStringOrNull(row.last_executed_at),
      latestExecution: null,
    };
  }

  // ─── Remediation executions (ADR-014 §1) ───────────────────────────

  /**
   * Create an execution record and enforce the concurrent execution guard.
   * Uses the partial unique index on (inventory_id) WHERE status IN ('pending','running')
   * to prevent TOCTOU races. Returns null if the inventory is already locked.
   */
  async createExecution(execution: {
    remediationProfileId: string;
    inventoryId: number;
    informingScanId?: string;
    planSummary?: object;
    createdBy?: string;
  }): Promise<RemediationExecution | null> {
    const id = randomUUID();
    const now = new Date().toISOString();
    try {
      await this.db('compliance_remediation_executions').insert({
        id,
        remediation_profile_id: execution.remediationProfileId,
        inventory_id: execution.inventoryId,
        informing_scan_id: execution.informingScanId ?? null,
        primary_job_id: null,
        all_job_ids: null,
        status: 'pending',
        started_at: now,
        completed_at: null,
        elapsed_seconds: null,
        rules_applied: null,
        rules_failed: null,
        hosts_targeted: null,
        hosts_succeeded: null,
        hosts_failed: null,
        plan_summary: execution.planSummary
          ? JSON.stringify(execution.planSummary)
          : null,
        verification_scan_id: null,
        created_by: execution.createdBy ?? null,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const code = (err as Record<string, unknown>).code;
      if (
        msg.includes('UNIQUE constraint failed') || // SQLite
        msg.includes('duplicate key value violates unique constraint') || // PostgreSQL
        code === '23505' // PostgreSQL error code
      ) {
        return null; // concurrent execution guard triggered
      }
      throw err;
    }
    return this.getExecutionById(id);
  }

  async getExecutionById(id: string): Promise<RemediationExecution | null> {
    const row = await this.db('compliance_remediation_executions')
      .where('id', id)
      .first();
    if (!row) return null;
    return this.mapExecutionRow(row);
  }

  async getExecutionsByProfileId(
    profileId: string,
    limit: number = 20,
  ): Promise<RemediationExecution[]> {
    const rows = await this.db('compliance_remediation_executions')
      .where('remediation_profile_id', profileId)
      .orderBy('started_at', 'desc')
      .limit(limit);
    return rows.map((row: Record<string, unknown>) =>
      this.mapExecutionRow(row),
    );
  }

  async getRecentExecutions(
    limit: number = 50,
  ): Promise<RemediationExecution[]> {
    const rows = await this.db('compliance_remediation_executions')
      .orderBy('started_at', 'desc')
      .limit(limit);
    return rows.map((row: Record<string, unknown>) =>
      this.mapExecutionRow(row),
    );
  }

  /** Get the currently running/pending execution for an inventory (for UI display). */
  async getRunningExecutionForInventory(
    inventoryId: number,
  ): Promise<RemediationExecution | null> {
    const row = await this.db('compliance_remediation_executions')
      .where('inventory_id', inventoryId)
      .whereIn('status', ['pending', 'running'])
      .first();
    if (!row) return null;
    return this.mapExecutionRow(row);
  }

  async updateExecutionStatus(
    id: string,
    update: {
      status: RemediationExecutionStatus;
      completedAt?: string;
      elapsedSeconds?: number;
      primaryJobId?: number;
      allJobIds?: number[];
      rulesApplied?: number;
      rulesFailed?: number;
      hostsTargeted?: number;
      hostsSucceeded?: number;
      hostsFailed?: number;
      planSummary?: object;
    },
  ): Promise<void> {
    const row: Record<string, unknown> = { status: update.status };
    if (update.completedAt !== undefined) row.completed_at = update.completedAt;
    if (update.elapsedSeconds !== undefined)
      row.elapsed_seconds = update.elapsedSeconds;
    if (update.primaryJobId !== undefined)
      row.primary_job_id = update.primaryJobId;
    if (update.allJobIds !== undefined)
      row.all_job_ids = JSON.stringify(update.allJobIds);
    if (update.rulesApplied !== undefined)
      row.rules_applied = update.rulesApplied;
    if (update.rulesFailed !== undefined) row.rules_failed = update.rulesFailed;
    if (update.hostsTargeted !== undefined)
      row.hosts_targeted = update.hostsTargeted;
    if (update.hostsSucceeded !== undefined)
      row.hosts_succeeded = update.hostsSucceeded;
    if (update.hostsFailed !== undefined) row.hosts_failed = update.hostsFailed;
    if (update.planSummary !== undefined)
      row.plan_summary = JSON.stringify(update.planSummary);
    await this.db('compliance_remediation_executions')
      .where('id', id)
      .update(row);
  }

  async updateVerificationScanId(
    executionId: string,
    scanId: string,
  ): Promise<void> {
    await this.db('compliance_remediation_executions')
      .where('id', executionId)
      .update({ verification_scan_id: scanId });
  }

  /**
   * Get executions in running/pending state for Controller reconciliation.
   * maxAgeHours=0 returns ALL running/pending (used on every list load).
   * maxAgeHours>0 returns only those older than the cutoff (legacy fallback).
   */
  async getStaleRunningExecutions(
    maxAgeHours: number = 0,
  ): Promise<RemediationExecution[]> {
    let query = this.db('compliance_remediation_executions').whereIn('status', [
      'pending',
      'running',
    ]);
    if (maxAgeHours > 0) {
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - maxAgeHours);
      query = query.where('started_at', '<', cutoff.toISOString());
    }
    const rows = await query;
    return rows.map((row: Record<string, unknown>) =>
      this.mapExecutionRow(row),
    );
  }

  private mapExecutionRow(row: Record<string, unknown>): RemediationExecution {
    return {
      id: row.id as string,
      remediationProfileId: row.remediation_profile_id as string,
      inventoryId: row.inventory_id as number,
      informingScanId: (row.informing_scan_id as string) ?? null,
      primaryJobId: (row.primary_job_id as number) ?? null,
      allJobIds: safeJsonParse<number[]>(row.all_job_ids) ?? [],
      status: row.status as RemediationExecutionStatus,
      startedAt: toISOString(row.started_at),
      completedAt: toISOStringOrNull(row.completed_at),
      elapsedSeconds: (row.elapsed_seconds as number) ?? null,
      rulesApplied: (row.rules_applied as number) ?? null,
      rulesFailed: (row.rules_failed as number) ?? null,
      hostsTargeted: (row.hosts_targeted as number) ?? null,
      hostsSucceeded: (row.hosts_succeeded as number) ?? null,
      hostsFailed: (row.hosts_failed as number) ?? null,
      planSummary: safeJsonParse(row.plan_summary),
      verificationScanId: (row.verification_scan_id as string) ?? null,
      createdBy: (row.created_by as string) ?? null,
    };
  }

  // ─── Baseline targets (ADR-014 §7) ────────────────────────────────

  async pinBaselineTarget(target: {
    remediationProfileId: string;
    complianceProfileId: string;
    inventoryId: number;
    pinnedBy?: string;
  }): Promise<BaselineTarget> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.db('compliance_baseline_targets').insert({
      id,
      remediation_profile_id: target.remediationProfileId,
      compliance_profile_id: target.complianceProfileId,
      inventory_id: target.inventoryId,
      pinned_at: now,
      pinned_by: target.pinnedBy ?? null,
    });
    return {
      id,
      remediationProfileId: target.remediationProfileId,
      complianceProfileId: target.complianceProfileId,
      inventoryId: target.inventoryId,
      pinnedAt: now,
      pinnedBy: target.pinnedBy ?? null,
    };
  }

  async unpinBaselineTarget(id: string): Promise<boolean> {
    const deleted = await this.db('compliance_baseline_targets')
      .where('id', id)
      .delete();
    return deleted > 0;
  }

  async getBaselineTargetsForProfile(
    complianceProfileId: string,
  ): Promise<BaselineTarget[]> {
    const rows = await this.db('compliance_baseline_targets').where(
      'compliance_profile_id',
      complianceProfileId,
    );
    return rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      remediationProfileId: row.remediation_profile_id as string,
      complianceProfileId: row.compliance_profile_id as string,
      inventoryId: row.inventory_id as number,
      pinnedAt: toISOString(row.pinned_at),
      pinnedBy: (row.pinned_by as string) ?? null,
    }));
  }

  async isProfilePinnedAsBaseline(
    remediationProfileId: string,
  ): Promise<boolean> {
    const row = await this.db('compliance_baseline_targets')
      .where('remediation_profile_id', remediationProfileId)
      .first();
    return !!row;
  }

  async getAllBaselineTargets(): Promise<BaselineTarget[]> {
    const rows = await this.db('compliance_baseline_targets');
    return rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      remediationProfileId: row.remediation_profile_id as string,
      complianceProfileId: row.compliance_profile_id as string,
      inventoryId: row.inventory_id as number,
      pinnedAt: toISOString(row.pinned_at),
      pinnedBy: (row.pinned_by as string) ?? null,
    }));
  }

  async getBaselineScore(
    scanId: string,
    baselineRuleIds: string[],
  ): Promise<{ passCount: number; failCount: number }> {
    if (baselineRuleIds.length === 0) return { passCount: 0, failCount: 0 };

    const rows = await this.db('compliance_findings')
      .select('status')
      .count('* as cnt')
      .where('scan_id', scanId)
      .whereIn('rule_id', baselineRuleIds)
      .groupBy('status');

    let passCount = 0;
    let failCount = 0;
    for (const row of rows as Array<Record<string, unknown>>) {
      if (row.status === 'pass') passCount = Number(row.cnt);
      if (row.status === 'fail') failCount = Number(row.cnt);
    }
    return { passCount, failCount };
  }

  async getBaselineScoresBatch(
    configs: Array<{ key: string; scanId: string; ruleIds: string[] }>,
  ): Promise<Map<string, { passCount: number; failCount: number }>> {
    const result = new Map<string, { passCount: number; failCount: number }>();
    if (configs.length === 0) return result;

    // Build a single query with UNION ALL for each config
    const allPairs: Array<{
      scanId: string;
      ruleId: string;
      configKey: string;
    }> = [];
    for (const cfg of configs) {
      if (cfg.ruleIds.length === 0) {
        result.set(cfg.key, { passCount: 0, failCount: 0 });
        continue;
      }
      for (const ruleId of cfg.ruleIds) {
        allPairs.push({ scanId: cfg.scanId, ruleId, configKey: cfg.key });
      }
    }

    if (allPairs.length === 0) return result;

    // Group by scanId for efficient querying
    const byScanId = new Map<
      string,
      { keys: Set<string>; ruleIds: Set<string> }
    >();
    for (const pair of allPairs) {
      let group = byScanId.get(pair.scanId);
      if (!group) {
        group = { keys: new Set(), ruleIds: new Set() };
        byScanId.set(pair.scanId, group);
      }
      group.keys.add(pair.configKey);
      group.ruleIds.add(pair.ruleId);
    }

    // Build rule-to-config mapping for result attribution
    const ruleToConfig = new Map<string, string>();
    for (const pair of allPairs) {
      ruleToConfig.set(`${pair.scanId}::${pair.ruleId}`, pair.configKey);
    }

    // Single batch query for all scan IDs
    const scanIds = Array.from(byScanId.keys());
    const allRuleIds = new Set(allPairs.map(p => p.ruleId));
    const rows = await this.db('compliance_findings')
      .select('scan_id', 'rule_id', 'status')
      .whereIn('scan_id', scanIds)
      .whereIn('rule_id', Array.from(allRuleIds));

    // Aggregate per config key
    const counters = new Map<string, { pass: number; fail: number }>();
    for (const row of rows as Array<Record<string, unknown>>) {
      const key = ruleToConfig.get(`${row.scan_id}::${row.rule_id}`);
      if (!key) continue;
      if (!counters.has(key)) counters.set(key, { pass: 0, fail: 0 });
      const c = counters.get(key)!;
      if (row.status === 'pass') c.pass++;
      if (row.status === 'fail') c.fail++;
    }

    for (const cfg of configs) {
      const c = counters.get(cfg.key);
      result.set(cfg.key, { passCount: c?.pass ?? 0, failCount: c?.fail ?? 0 });
    }

    return result;
  }

  // ─── Rule metadata ─────────────────────────────────────────────────

  async upsertRuleMetadata(rules: RuleMetadataInput[]): Promise<number> {
    if (rules.length === 0) return 0;

    const now = new Date().toISOString();
    const batchSize = 100;

    for (let i = 0; i < rules.length; i += batchSize) {
      const batch = rules.slice(i, i + batchSize);
      const rows = batch.map(r => ({
        rule_id: r.ruleId,
        stig_id: r.stigId,
        title: r.title,
        description: r.description,
        check_text: r.checkText,
        fix_text: r.fixText,
        category: r.category,
        disruption: r.disruption,
        aap_impact: r.aapImpact ?? 'safe',
        aap_impact_reason: r.aapImpactReason ?? '',
        scanner: r.scanner,
        updated_at: now,
      }));
      await this.db('compliance_rule_metadata')
        .insert(rows)
        .onConflict('rule_id')
        .merge([
          'stig_id',
          'title',
          'description',
          'check_text',
          'fix_text',
          'category',
          'disruption',
          'aap_impact',
          'aap_impact_reason',
          'scanner',
          'updated_at',
        ]);
    }

    return rules.length;
  }

  async getRuleMetadataBulk(
    ruleIds: string[],
  ): Promise<Map<string, RuleMetadataRecord>> {
    if (ruleIds.length === 0) return new Map();

    const rows = await this.db('compliance_rule_metadata').whereIn(
      'rule_id',
      ruleIds,
    );

    const map = new Map<string, RuleMetadataRecord>();
    for (const row of rows) {
      map.set(row.rule_id as string, this.mapRuleMetadataRow(row));
    }
    return map;
  }

  async getAllRuleMetadata(): Promise<Map<string, RuleMetadataRecord>> {
    const rows = await this.db('compliance_rule_metadata');
    const map = new Map<string, RuleMetadataRecord>();
    for (const row of rows) {
      map.set(row.rule_id as string, this.mapRuleMetadataRow(row));
    }
    return map;
  }

  private mapRuleMetadataRow(row: Record<string, unknown>): RuleMetadataRecord {
    return {
      ruleId: row.rule_id as string,
      stigId: (row.stig_id as string) || '',
      title: (row.title as string) || '',
      description: (row.description as string) || '',
      checkText: (row.check_text as string) || '',
      fixText: (row.fix_text as string) || '',
      category: (row.category as string) || '',
      disruption: ((row.disruption as string) || 'medium') as
        | 'low'
        | 'medium'
        | 'high',
      aapImpact: ((row.aap_impact as string) || 'safe') as
        | 'safe'
        | 'caution'
        | 'breaks-connectivity',
      aapImpactReason: (row.aap_impact_reason as string) || '',
      scanner: (row.scanner as string) || '',
      updatedAt: toISOString(row.updated_at),
    };
  }

  async resolveProfileId(idOrTag: string): Promise<string | null> {
    if (idOrTag.includes('-') && idOrTag.length >= 36) return idOrTag;
    const row = await this.db('compliance_profile_registry')
      .where('scan_tags', idOrTag)
      .select('id')
      .first();
    return row ? (row.id as string) : null;
  }

  // ─── Profile registry ────────────────────────────────────────────

  async listProfiles(
    includeDisconnected = false,
  ): Promise<ComplianceProfile[]> {
    const query = this.db('compliance_profile_registry').orderBy(
      'created_at',
      'desc',
    );
    if (!includeDisconnected) {
      query.where(function () {
        this.where('connection_status', 'connected').orWhereNull(
          'connection_status',
        );
      });
    }
    const rows = await query;
    return rows.map(this.mapProfileRow);
  }

  async getProfile(id: string): Promise<ComplianceProfile | null> {
    const row = await this.db('compliance_profile_registry')
      .where('id', id)
      .first();
    if (!row) return null;
    return this.mapProfileRow(row);
  }

  async saveProfile(
    profile: SaveProfileRequest,
    ruleCount?: number,
  ): Promise<ComplianceProfile> {
    const now = new Date().toISOString();

    // Match by id, then by profile_slug for reconnect on disconnect→re-add cycles.
    let existing: Record<string, unknown> | undefined;
    if (profile.id) {
      existing = await this.db('compliance_profile_registry')
        .where('id', profile.id)
        .first();
    } else if (profile.profileSlug) {
      existing = await this.db('compliance_profile_registry')
        .where('profile_slug', profile.profileSlug)
        .first();
    }

    const id = existing ? (existing.id as string) : randomUUID();
    const slug = existing
      ? (existing.profile_slug as string)
      : profile.profileSlug || ComplianceDatabase.slugify(profile.displayName);

    const row: Record<string, unknown> = {
      id,
      profile_slug: slug,
      display_name: profile.displayName,
      description: profile.description || '',
      framework: profile.framework,
      version: profile.version || '',
      platform: profile.platform || '',
      platform_spec: profile.platformSpec
        ? JSON.stringify(profile.platformSpec)
        : null,
      certification: profile.certification
        ? JSON.stringify(profile.certification)
        : null,
      workflow_template_id: profile.workflowTemplateId,
      remediate_jt_id: profile.remediateJtId ?? null,
      ee_id: profile.eeId,
      remediation_playbook_path: profile.remediationPlaybookPath || '',
      scan_tags: profile.scanTags || '',
      display_config: profile.displayConfig
        ? JSON.stringify(profile.displayConfig)
        : null,
      updated_at: now,
    };
    if (ruleCount !== undefined) {
      row.rule_count = ruleCount;
    }

    if (existing) {
      // Reconnect if it was disconnected, and track version history on upgrade
      row.connection_status = 'connected';
      row.connected_at = now;
      row.disconnected_at = null;
      row.disconnected_by = null;

      const oldVersion = existing.profile_version as string | undefined;
      if (profile.version && oldVersion && profile.version !== oldVersion) {
        const history =
          safeJsonParse<Array<Record<string, unknown>>>(
            existing.version_history,
          ) ?? [];
        history.push({
          version: oldVersion,
          installedAt: toISOString(
            existing.connected_at ?? existing.updated_at,
          ),
        });
        row.profile_version = profile.version;
        row.version_history = JSON.stringify(
          history.slice(-ComplianceDatabase.MAX_VERSION_HISTORY),
        );
      } else if (profile.version) {
        row.profile_version = profile.version;
      }

      await this.db('compliance_profile_registry').where('id', id).update(row);
    } else {
      await this.db('compliance_profile_registry').insert({
        ...row,
        connection_status: 'connected',
        created_at: now,
      });
    }

    return this.mapProfileRow({
      ...row,
      created_at: existing ? existing.created_at : now,
    });
  }

  async deleteProfile(id: string): Promise<boolean> {
    const deleted = await this.db('compliance_profile_registry')
      .where('id', id)
      .delete();
    return deleted > 0;
  }

  async getDistinctRuleCountForScan(scanId: string): Promise<number> {
    const result = await this.db('compliance_findings')
      .where('scan_id', scanId)
      .countDistinct('rule_id as count');
    return Number((result[0] as Record<string, unknown>).count) || 0;
  }

  async updateProfileRuleCount(id: string, ruleCount: number): Promise<void> {
    await this.db('compliance_profile_registry')
      .where('id', id)
      .update({ rule_count: ruleCount });
  }

  private mapProfileRow(row: Record<string, unknown>): ComplianceProfile {
    const connectionStatus = (row.connection_status as string) || 'connected';
    const profileVersion = row.profile_version as string | null;
    return {
      id: row.id as string,
      profileSlug: (row.profile_slug as string) || '',
      displayName: row.display_name as string,
      description: (row.description as string) || '',
      framework: row.framework as string,
      version: (row.version as string) || '',
      platform: (row.platform as string) || '',
      platformSpec: safeJsonParse(row.platform_spec),
      workflowTemplateId: (row.workflow_template_id as number) ?? null,
      remediateJtId: (row.remediate_jt_id as number) ?? null,
      eeId: (row.ee_id as number) ?? null,
      remediationPlaybookPath: (row.remediation_playbook_path as string) || '',
      scanTags: (row.scan_tags as string) || '',
      certification: safeJsonParse(row.certification),
      ruleCount: (row.rule_count as number) ?? undefined,
      displayConfig: safeJsonParse(row.display_config) ?? undefined,
      connectionStatus: connectionStatus as 'connected' | 'disconnected',
      currentVersion: profileVersion
        ? {
            version: profileVersion,
            installedAt: toISOString(row.connected_at ?? row.updated_at),
          }
        : undefined,
      createdAt: toISOString(row.created_at),
      updatedAt: toISOString(row.updated_at),
    };
  }

  // ─── Profile lifecycle ──────────────────────────────────────────────

  private static readonly MAX_VERSION_HISTORY = 50;

  static slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 128);
  }

  /** Reconnect a previously-disconnected profile by slug (preferred) or framework+displayName fallback. */
  async connectProfile(
    framework: string,
    version: string,
    displayName?: string,
    slug?: string,
  ): Promise<ComplianceProfile | null> {
    const now = new Date().toISOString();
    let existing: Record<string, unknown> | undefined;
    if (slug) {
      existing = await this.db('compliance_profile_registry')
        .where('profile_slug', slug)
        .first();
    }
    if (!existing) {
      let query = this.db('compliance_profile_registry').where(
        'framework',
        framework,
      );
      if (displayName) query = query.where('display_name', displayName);
      existing = await query.first();
    }

    if (existing) {
      const update: Record<string, unknown> = {
        connection_status: 'connected',
        connected_at: now,
        disconnected_at: null,
        disconnected_by: null,
        updated_at: now,
      };
      if (version && version !== existing.profile_version) {
        const history =
          safeJsonParse<Array<Record<string, unknown>>>(
            existing.version_history,
          ) ?? [];
        if (existing.profile_version) {
          history.push({
            version: existing.profile_version,
            installedAt: toISOString(
              existing.connected_at ?? existing.updated_at,
            ),
          });
        }
        update.profile_version = version;
        update.version_history = JSON.stringify(
          history.slice(-ComplianceDatabase.MAX_VERSION_HISTORY),
        );
      }
      if (displayName) update.display_name = displayName;

      await this.db('compliance_profile_registry')
        .where('id', existing.id as string)
        .update(update);
      const updated = await this.db('compliance_profile_registry')
        .where('id', existing.id as string)
        .first();
      return updated ? this.mapProfileRow(updated) : null;
    }

    return null;
  }

  /** Mark a profile as disconnected. All historical data is preserved. */
  async disconnectProfile(id: string, by?: string): Promise<boolean> {
    const now = new Date().toISOString();
    const updated = await this.db('compliance_profile_registry')
      .where('id', id)
      .update({
        connection_status: 'disconnected',
        disconnected_at: now,
        disconnected_by: by ?? null,
        updated_at: now,
      });
    return updated > 0;
  }

  /** @deprecated Use disconnectProfileBySlug. Framework-only match is ambiguous for CIS L1/L2. */
  async disconnectProfileByFramework(
    framework: string,
    by?: string,
  ): Promise<boolean> {
    const profile = await this.db('compliance_profile_registry')
      .where('framework', framework)
      .first();
    if (!profile) return false;
    return this.disconnectProfile(profile.id, by);
  }

  async disconnectProfileBySlug(slug: string, by?: string): Promise<boolean> {
    const profile = await this.db('compliance_profile_registry')
      .where('profile_slug', slug)
      .first();
    if (!profile) return false;
    return this.disconnectProfile(profile.id, by);
  }

  // ─── Bundle storage ─────────────────────────────────────────────────

  /** Store a custom tab JS bundle for a profile. */
  async saveProfileBundle(
    id: string,
    bundleData: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db('compliance_profile_registry')
      .where('id', id)
      .update({
        bundle_data: bundleData,
        bundle_metadata: JSON.stringify(metadata),
        updated_at: new Date().toISOString(),
      });
  }

  /** Retrieve a stored bundle. Returns null if profile has no bundle. */
  async getProfileBundle(
    id: string,
  ): Promise<{ data: string; metadata: Record<string, unknown> } | null> {
    const row = await this.db('compliance_profile_registry')
      .where('id', id)
      .select('bundle_data', 'bundle_metadata')
      .first();
    if (!row?.bundle_data) return null;
    return {
      data: row.bundle_data as string,
      metadata: safeJsonParse(row.bundle_metadata) ?? {},
    };
  }

  /** Remove a stored bundle. Returns false if profile not found. */
  async deleteProfileBundle(id: string): Promise<boolean> {
    const updated = await this.db('compliance_profile_registry')
      .where('id', id)
      .update({
        bundle_data: null,
        bundle_metadata: null,
        updated_at: new Date().toISOString(),
      });
    return updated > 0;
  }

  // ─── Scan Artifacts (ADR-032) ────────────────────────────────────

  async storeArtifact(
    scanId: string,
    artifactKey: string,
    ociReference: string,
    artifactName: string,
    mimeType: string,
  ): Promise<void> {
    const id = crypto.randomUUID();
    await this.db('compliance_scan_artifacts')
      .insert({
        id,
        scan_id: scanId,
        artifact_key: artifactKey,
        oci_reference: ociReference,
        artifact_name: artifactName,
        mime_type: mimeType,
        created_at: new Date().toISOString(),
      })
      .onConflict(['scan_id', 'artifact_key'])
      .merge(['oci_reference', 'artifact_name', 'mime_type']);
  }

  async getArtifactsForScan(scanId: string): Promise<
    Array<{
      id: string;
      scanId: string;
      artifactKey: string;
      ociReference: string;
      artifactName: string;
      mimeType: string;
      createdAt: string;
    }>
  > {
    const rows = await this.db('compliance_scan_artifacts')
      .where('scan_id', scanId)
      .orderBy('artifact_key');
    return rows.map((r: any) => ({
      id: r.id,
      scanId: r.scan_id,
      artifactKey: r.artifact_key,
      ociReference: r.oci_reference,
      artifactName: r.artifact_name,
      mimeType: r.mime_type,
      createdAt: r.created_at,
    }));
  }

  async getArtifact(
    scanId: string,
    artifactKey: string,
  ): Promise<{
    id: string;
    scanId: string;
    artifactKey: string;
    ociReference: string;
    artifactName: string;
    mimeType: string;
    createdAt: string;
  } | null> {
    const row = await this.db('compliance_scan_artifacts')
      .where({ scan_id: scanId, artifact_key: artifactKey })
      .first();
    if (!row) return null;
    return {
      id: row.id,
      scanId: row.scan_id,
      artifactKey: row.artifact_key,
      ociReference: row.oci_reference,
      artifactName: row.artifact_name,
      mimeType: row.mime_type,
      createdAt: row.created_at,
    };
  }
}
