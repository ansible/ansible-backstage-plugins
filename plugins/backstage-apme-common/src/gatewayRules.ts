/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { RemediationClass, Rule, Severity } from './types';
import { severityProtoToLabel } from './severity';

/** Raw rule row from the APME gateway ``/rules`` API. */
export interface GatewayRuleRow {
  rule_id?: string;
  id?: string;
  name?: string;
  description?: string;
  category?: string;
  source?: string;
  default_severity_label?: string;
  resolved_severity_label?: string;
  default_severity?: number;
  resolved_severity?: number;
  enabled?: boolean;
  resolved_enabled?: boolean;
  remediation_class?: number;
  remediationClass?: number;
  override?: {
    severity_override?: number | null;
    enabled_override?: boolean | null;
    enforced?: boolean;
  };
}

const SEVERITY_BY_INDEX: Severity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
];

function severityFromRow(row: GatewayRuleRow): Severity {
  const label = row.resolved_severity_label ?? row.default_severity_label;
  if (label) {
    const normalized = label.toLowerCase();
    if (
      normalized === 'critical' ||
      normalized === 'high' ||
      normalized === 'medium' ||
      normalized === 'low' ||
      normalized === 'info'
    ) {
      return normalized;
    }
  }
  const index = (row.resolved_severity ?? row.default_severity ?? 3) - 1;
  return SEVERITY_BY_INDEX[Math.min(Math.max(index, 0), 4)] ?? 'medium';
}

function defaultSeverityFromRow(row: GatewayRuleRow): Severity | undefined {
  if (row.default_severity_label) {
    return severityFromRow({
      default_severity_label: row.default_severity_label,
      default_severity: row.default_severity,
    });
  }
  if (row.default_severity !== undefined && row.default_severity !== null) {
    return severityProtoToLabel(row.default_severity);
  }
  return undefined;
}

/** Maps gateway category values to portal violation category keys. */
export function normalizeApmeCategory(category: string): string {
  if (category === 'aap') return 'modernize';
  return category;
}

export function normalizeGatewayRule(row: GatewayRuleRow): Rule {
  const id = row.rule_id ?? row.id ?? '';
  const override = row.override;
  const hasOverride =
    !!override &&
    ((override.severity_override !== undefined &&
      override.severity_override !== null) ||
      (override.enabled_override !== undefined &&
        override.enabled_override !== null) ||
      override.enforced === true);
  const defaultSeverity = defaultSeverityFromRow(row);
  return {
    id,
    name: row.name ?? id,
    description: row.description ?? '',
    severity: severityFromRow(row),
    defaultSeverity,
    category: normalizeApmeCategory(row.category ?? 'lint'),
    remediationClass: (row.remediation_class ??
      row.remediationClass ??
      3) as RemediationClass,
    enabled: row.resolved_enabled ?? row.enabled ?? true,
    source: row.source,
    enforced: override?.enforced ?? false,
    hasOverride,
  };
}

export function normalizeGatewayRules(rows: GatewayRuleRow[]): Rule[] {
  return rows.map(normalizeGatewayRule).filter(rule => rule.id.length > 0);
}

export function buildRulesById(rules: Rule[]): Map<string, Rule> {
  const map = new Map<string, Rule>();
  for (const rule of rules) {
    map.set(rule.id, rule);
  }
  return map;
}
