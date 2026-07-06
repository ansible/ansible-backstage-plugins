/*
 * Copyright Red Hat
 */

import {
  severityBreakdown,
  getViolationCategory,
  inferCategoryFromRuleId,
  categoryBreakdown,
} from './violationAnalytics';
import type { Violation } from '@ansible/backstage-apme-common/types';
import { buildRulesById } from './gatewayRules';

describe('violationAnalytics', () => {
  it('classifies dependency violations from validator source', () => {
    const v: Violation = {
      id: 1,
      rule_id: 'CVE-1',
      level: 'high',
      message: 'cryptography issue',
      file: 'requirements.txt',
      line: 1,
      remediation_class: 1,
      validator_source: 'dep_audit',
    };
    expect(getViolationCategory(v)).toBe('dependencies');
  });

  it('infers modernize category from M-prefixed rule ids', () => {
    const v: Violation = {
      id: 1,
      rule_id: 'M001',
      level: 'high',
      message: 'Use FQCN',
      file: 'playbook.yml',
      line: 1,
      remediation_class: 1,
      validator_source: 'native',
    };
    expect(getViolationCategory(v)).toBe('modernize');
    expect(inferCategoryFromRuleId('M001')).toBe('modernize');
    expect(inferCategoryFromRuleId('L020')).toBe('lint');
  });

  it('uses rule catalog category when available', () => {
    const rulesById = buildRulesById([
      {
        id: 'custom-rule',
        name: 'custom',
        description: '',
        severity: 'high',
        category: 'risk',
        remediationClass: 3,
        enabled: true,
      },
    ]);
    const v: Violation = {
      id: 1,
      rule_id: 'custom-rule',
      level: 'high',
      message: 'risky',
      file: 'playbook.yml',
      line: 1,
      remediation_class: 3,
      validator_source: 'native',
    };
    expect(getViolationCategory(v, rulesById)).toBe('risk');
  });

  it('builds severity and category breakdown', () => {
    const violations: Violation[] = [
      {
        id: 1,
        rule_id: 'r1',
        level: 'critical',
        message: 'a',
        file: 'f',
        line: 1,
        remediation_class: 1,
        validator_source: 'native',
      },
      {
        id: 2,
        rule_id: 'r2',
        level: 'high',
        message: 'b',
        file: 'f',
        line: 2,
        remediation_class: 1,
        validator_source: 'native',
      },
    ];
    expect(severityBreakdown(violations)).toEqual({
      critical: 1,
      high: 1,
      medium: 0,
      low: 0,
      info: 0,
    });
    expect(categoryBreakdown(violations)).toEqual({ lint: 2 });
  });
});
