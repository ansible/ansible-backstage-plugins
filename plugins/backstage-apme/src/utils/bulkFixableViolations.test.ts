/*
 * Copyright Red Hat
 */

import type { Violation } from '@ansible/backstage-apme-common/types';
import { collectBulkFixableViolationIds } from './bulkFixableViolations';

function violation(
  id: number,
  remediationClass: number,
  overrides: Partial<Violation> = {},
): Violation {
  return {
    id,
    rule_id: `rule-${id}`,
    file: `file-${id}.yml`,
    line: 1,
    level: 'medium',
    remediation_class: remediationClass,
    ...overrides,
  } as Violation;
}

describe('collectBulkFixableViolationIds', () => {
  const violations = [
    violation(1, 1),
    violation(2, 2),
    violation(3, 3),
  ];

  it('includes autofixes only when AI is not included', () => {
    expect(
      collectBulkFixableViolationIds(violations, true, false).has(1),
    ).toBe(true);
    expect(
      collectBulkFixableViolationIds(violations, true, false).has(2),
    ).toBe(false);
    expect(
      collectBulkFixableViolationIds(violations, true, false).has(3),
    ).toBe(false);
  });

  it('includes AI-assisted fixable violations when includeAiInBulk is true', () => {
    const ids = collectBulkFixableViolationIds(violations, true, true);
    expect(ids.has(1)).toBe(true);
    expect(ids.has(2)).toBe(true);
    expect(ids.has(3)).toBe(false);
  });

  it('excludes AI violations when AI is disabled in portal config', () => {
    const ids = collectBulkFixableViolationIds(violations, false, true);
    expect(ids.has(1)).toBe(true);
    expect(ids.has(2)).toBe(false);
  });
});
