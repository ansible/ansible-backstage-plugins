/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type {
  CollectionRef,
  Rule,
  Violation,
} from '@ansible/backstage-apme-common/types';
import { normalizeApmeCategory } from './gatewayRules';
import {
  normalizeSeverity,
  effectiveFixType,
  type SeverityLevel,
} from '@ansible/backstage-apme-common/severity';

export const VIOLATION_CATEGORIES = [
  'lint',
  'modernize',
  'risk',
  'secrets',
  'policy',
  'dependencies',
] as const;

export type ViolationCategory = (typeof VIOLATION_CATEGORIES)[number];

export type RulesById = ReadonlyMap<string, Pick<Rule, 'category'>>;

export function normalizeRuleId(ruleId: string): string {
  return ruleId.replace(/^native:/, '');
}

export function inferCategoryFromRuleId(ruleId: string): string | undefined {
  const id = normalizeRuleId(ruleId).toUpperCase();
  if (/^M\d/.test(id)) return 'modernize';
  if (/^L\d/.test(id)) return 'lint';
  if (/^R\d/.test(id)) return 'risk';
  if (/^SEC|^SECRET/.test(id)) return 'secrets';
  if (/^CVE|^DEP/.test(id) || id.startsWith('CVE-')) return 'dependencies';
  if (/^POL/.test(id)) return 'policy';
  const lower = normalizeRuleId(ruleId).toLowerCase();
  if (lower.includes('secret') || lower.includes('gitleaks')) return 'secrets';
  if (lower.includes('risk') || lower.includes('permission')) return 'risk';
  if (lower.includes('deprecated') || lower.includes('fqcn'))
    return 'modernize';
  return undefined;
}

export function getViolationCategory(
  v: Violation,
  rulesById?: RulesById,
): string {
  if (v.category) return normalizeApmeCategory(v.category);
  const ruleId = normalizeRuleId(v.rule_id);
  const fromRule = rulesById?.get(ruleId) ?? rulesById?.get(v.rule_id);
  if (fromRule?.category) return normalizeApmeCategory(fromRule.category);
  const inferred = inferCategoryFromRuleId(v.rule_id);
  if (inferred) return inferred;
  if (v.validator_source === 'gitleaks') return 'secrets';
  if (
    v.validator_source === 'dep_audit' ||
    v.validator_source === 'collection_health'
  ) {
    return 'dependencies';
  }
  if (v.validator_source === 'opa') return 'policy';
  return 'lint';
}

export function severityBreakdown(
  violations: Violation[],
): Record<SeverityLevel, number> {
  const counts: Record<SeverityLevel, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const v of violations) {
    const sev = normalizeSeverity(v.level);
    counts[sev] += 1;
  }
  return counts;
}

export function categoryBreakdown(
  violations: Violation[],
  rulesById?: RulesById,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of violations) {
    const cat = getViolationCategory(v, rulesById);
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  return counts;
}

export function categorySeverityBreakdown(
  violations: Violation[],
  category: string,
  rulesById?: RulesById,
): Record<SeverityLevel, number> {
  return severityBreakdown(
    violations.filter(v => getViolationCategory(v, rulesById) === category),
  );
}

export function fixableViolationCount(
  violations: Violation[],
  enableAi: boolean,
): number {
  return violations.filter(
    v => effectiveFixType(v.remediation_class, enableAi) !== 'manual',
  ).length;
}

export function dependencyViolations(
  violations: Violation[],
  rulesById?: RulesById,
): Violation[] {
  return violations.filter(
    v => getViolationCategory(v, rulesById) === 'dependencies',
  );
}

export function violationsForCollection(
  violations: Violation[],
  fqcn: string,
  rulesById?: RulesById,
): Violation[] {
  const dep = dependencyViolations(violations, rulesById);
  return dep.filter(
    v =>
      v.message.includes(fqcn) ||
      v.file.includes(fqcn) ||
      (v.path?.includes(fqcn) ?? false),
  );
}

export function violationsForPythonPackage(
  violations: Violation[],
  packageName: string,
  rulesById?: RulesById,
): Violation[] {
  const dep = dependencyViolations(violations, rulesById);
  const needle = packageName.toLowerCase();
  return dep.filter(
    v =>
      v.validator_source === 'dep_audit' &&
      (v.message.toLowerCase().includes(needle) ||
        v.file.toLowerCase().includes(needle)),
  );
}

export function collectionViolationCount(
  violations: Violation[],
  collection: CollectionRef,
  rulesById?: RulesById,
): number {
  return violationsForCollection(violations, collection.fqcn, rulesById).length;
}

export function pythonPackageViolationCount(
  violations: Violation[],
  packageName: string,
  rulesById?: RulesById,
): number {
  return violationsForPythonPackage(violations, packageName, rulesById).length;
}
