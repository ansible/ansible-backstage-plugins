/**
 * RemediationPlanBuilder — builds optimized remediation plans from user selections.
 *
 * Extracted from ComplianceService to isolate remediation plan logic.
 * Groups rules by their target host set so that rules targeting the same
 * set of hosts are batched into a single Ansible run.
 */
import { LoggerService } from '@backstage/backend-plugin-api';

import type {
  MultiHostFinding,
  RemediationSelection,
  RemediationPlan,
  RemediationPlanGroup,
} from '@ansible/backstage-compliance-common';

export class RemediationPlanBuilder {
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  /**
   * Build an optimized remediation plan from user selections.
   *
   * Groups rules by their target host set so that rules targeting the
   * same set of hosts are batched into a single Ansible run. This
   * avoids launching one workflow per rule, which does not scale.
   *
   * Each group produces:
   *   { tags: [rule_ids], limit: "host1,host2,...", extra_vars: {overrides}, hostCount, ruleCount }
   */
  buildRemediationPlan(
    selections: RemediationSelection[],
    findings: MultiHostFinding[],
  ): RemediationPlan {
    const enabledSelections = selections.filter(s => s.enabled);

    if (enabledSelections.length === 0) {
      return { groups: [], totalRules: 0, totalHosts: 0 };
    }

    const findingsMap = new Map(findings.map(f => [f.ruleId, f]));

    // For each enabled rule, compute its target host set based on scope
    const ruleHostSets: Array<{
      ruleId: string;
      hosts: string[];
      extraVars: Record<string, unknown>;
    }> = [];

    for (const sel of enabledSelections) {
      const finding = findingsMap.get(sel.ruleId);
      if (!finding) continue;

      // Determine target hosts based on scope (default: failed_only).
      // Check the selection-level scope field first, then fall back to
      // the legacy parameters.scope for backward compatibility.
      const scope =
        sel.scope ?? (sel.parameters?.scope as string) ?? 'failed_only';
      let targetHosts: string[];

      if (scope === 'standardize_all') {
        targetHosts = finding.hosts.map(h => h.host);
      } else {
        // failed_only: only remediate hosts that failed
        targetHosts = finding.hosts
          .filter(h => h.status === 'fail')
          .map(h => h.host);
      }

      if (targetHosts.length === 0) continue;

      // Collect parameter overrides (exclude internal scope parameter)
      const extraVars: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(sel.parameters ?? {})) {
        if (key !== 'scope') {
          extraVars[key] = value;
        }
      }

      ruleHostSets.push({
        ruleId: sel.ruleId,
        hosts: targetHosts.sort(),
        extraVars,
      });
    }

    // Group rules by their sorted host set (same hosts => same group)
    const groupMap = new Map<
      string,
      {
        ruleIds: string[];
        hosts: string[];
        mergedExtraVars: Record<string, unknown>;
      }
    >();

    for (const entry of ruleHostSets) {
      const hostKey = entry.hosts.join(',');
      const existing = groupMap.get(hostKey);

      if (existing) {
        existing.ruleIds.push(entry.ruleId);
        Object.assign(existing.mergedExtraVars, entry.extraVars);
      } else {
        groupMap.set(hostKey, {
          ruleIds: [entry.ruleId],
          hosts: entry.hosts,
          mergedExtraVars: { ...entry.extraVars },
        });
      }
    }

    // Build the final plan
    const allHosts = new Set<string>();
    const groups: RemediationPlanGroup[] = [];

    for (const group of groupMap.values()) {
      group.hosts.forEach(h => allHosts.add(h));
      groups.push({
        tags: group.ruleIds,
        limit: group.hosts.join(','),
        extraVars: group.mergedExtraVars,
        hostCount: group.hosts.length,
        ruleCount: group.ruleIds.length,
      });
    }

    // Sort groups: largest first for efficiency visibility
    groups.sort(
      (a, b) => b.ruleCount - a.ruleCount || b.hostCount - a.hostCount,
    );

    const plan: RemediationPlan = {
      groups,
      totalRules: enabledSelections.length,
      totalHosts: allHosts.size,
    };

    this.logger.info(
      `Built remediation plan: ${plan.groups.length} groups covering ${plan.totalRules} rules across ${plan.totalHosts} hosts`,
    );

    return plan;
  }
}
