/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  effectiveFixType,
  getWorstViolationLevel,
  isFixableViolation,
  normalizeRemediationClass,
  normalizeSeverity,
  normalizeSeverityBreakdown,
  proposalNeedsManualApproval,
  fixMethodLabel,
} from './severity';

describe('normalizeRemediationClass', () => {
  it('maps proto integers', () => {
    expect(normalizeRemediationClass(1)).toBe(1);
    expect(normalizeRemediationClass(2)).toBe(2);
    expect(normalizeRemediationClass(3)).toBe(3);
  });

  it('maps engine string values', () => {
    expect(normalizeRemediationClass('auto-fixable')).toBe(1);
    expect(normalizeRemediationClass('ai-candidate')).toBe(2);
    expect(normalizeRemediationClass('manual-review')).toBe(3);
  });

  it('defaults unknown values to manual', () => {
    expect(normalizeRemediationClass(undefined)).toBe(3);
    expect(normalizeRemediationClass('unknown')).toBe(3);
  });
});

describe('isFixableViolation', () => {
  it('treats auto as fixable', () => {
    expect(isFixableViolation(1, false)).toBe(true);
  });

  it('treats AI as fixable only when enableAi', () => {
    expect(isFixableViolation(2, true)).toBe(true);
    expect(isFixableViolation(2, false)).toBe(false);
  });

  it('treats manual as not fixable at scan', () => {
    expect(isFixableViolation(3, true)).toBe(false);
  });
});

describe('proposalNeedsManualApproval', () => {
  it('requires approval for AI tier when enabled', () => {
    expect(proposalNeedsManualApproval(2, true)).toBe(true);
  });

  it('does not require approval for auto or manual-at-scan', () => {
    expect(proposalNeedsManualApproval(1, true)).toBe(false);
    expect(proposalNeedsManualApproval(3, true)).toBe(false);
    expect(proposalNeedsManualApproval(2, false)).toBe(false);
  });
});

describe('fixMethodLabel', () => {
  it('uses scan-tier labels that do not imply fixes are already applied', () => {
    expect(fixMethodLabel('auto')).toBe('Auto-fix');
    expect(fixMethodLabel('ai')).toBe('AI candidate');
    expect(fixMethodLabel('manual')).toBe('Manual review');
    expect(fixMethodLabel(undefined)).toBe('Manual review');
  });
});

describe('normalizeSeverityBreakdown', () => {
  it('aggregates raw gateway levels into ADR-043 portal buckets', () => {
    expect(
      normalizeSeverityBreakdown({
        critical: 1,
        error: 2,
        warning: 3,
        low: 10,
        info: 1,
      }),
    ).toEqual({
      critical: 1,
      error: 2,
      high: 0,
      medium: 3,
      low: 10,
      info: 1,
    });
  });
});

describe('normalizeSeverity', () => {
  it('maps ADR-043 labels without collapsing error into high', () => {
    expect(normalizeSeverity('error')).toBe('error');
    expect(normalizeSeverity('high')).toBe('high');
    expect(normalizeSeverity('unknown-level')).toBe('medium');
  });
});

describe('getWorstViolationLevel', () => {
  it('returns the highest non-zero bucket', () => {
    expect(
      getWorstViolationLevel({
        critical: 0,
        error: 0,
        high: 0,
        medium: 2,
        low: 5,
        info: 1,
      }),
    ).toEqual({ level: 'medium', count: 2 });
  });

  it('prefers error over high', () => {
    expect(
      getWorstViolationLevel({
        critical: 0,
        error: 1,
        high: 4,
        medium: 0,
        low: 0,
        info: 0,
      }),
    ).toEqual({ level: 'error', count: 1 });
  });

  it('falls back to medium when all buckets are zero', () => {
    expect(
      getWorstViolationLevel({
        critical: 0,
        error: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
      }),
    ).toEqual({ level: 'medium', count: 0 });
  });

  it('normalizes string remediation classes via normalizeRemediationClass', () => {
    expect(
      effectiveFixType(normalizeRemediationClass('auto-fixable'), true),
    ).toBe('auto');
    expect(
      effectiveFixType(normalizeRemediationClass('manual-review'), true),
    ).toBe('manual');
  });
});
