/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type {
  RemediationClass,
  Rule,
  Severity,
} from '@ansible/backstage-apme-common/types';

/** Raw rule row from the APME gateway ``/rules`` API. */
export interface GatewayRuleRow {
  rule_id?: string;
  id?: string;
  name?: string;
  description?: string;
  category?: string;
  default_severity_label?: string;
  resolved_severity_label?: string;
  default_severity?: number;
  resolved_severity?: number;
  enabled?: boolean;
  resolved_enabled?: boolean;
  remediation_class?: number;
  remediationClass?: number;
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

/** Maps gateway category values to portal violation category keys. */
export function normalizeApmeCategory(category: string): string {
  if (category === 'aap') return 'modernize';
  return category;
}

export function normalizeGatewayRule(row: GatewayRuleRow): Rule {
  const id = row.rule_id ?? row.id ?? '';
  return {
    id,
    name: row.name ?? id,
    description: row.description ?? '',
    severity: severityFromRow(row),
    category: normalizeApmeCategory(row.category ?? 'lint'),
    remediationClass: (row.remediation_class ??
      row.remediationClass ??
      3) as RemediationClass,
    enabled: row.resolved_enabled ?? row.enabled ?? true,
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
