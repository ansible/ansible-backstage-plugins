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
  isFixableViolation,
  normalizeRemediationClass,
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

describe('effectiveFixType with strings', () => {
  it('normalizes string remediation classes via normalizeRemediationClass', () => {
    expect(
      effectiveFixType(normalizeRemediationClass('auto-fixable'), true),
    ).toBe('auto');
    expect(
      effectiveFixType(normalizeRemediationClass('manual-review'), true),
    ).toBe('manual');
  });
});
