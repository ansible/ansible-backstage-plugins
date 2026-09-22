/*
 * Copyright 2024 The Backstage Authors
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
  sanitizeAapName,
  sanitizeAapUsername,
  toOrgEntityName,
  toOrgGroupRef,
  toSourceNamespace,
  toTeamEntityName,
  toTeamGroupRef,
  toTemplateEntityName,
  toUserEntityName,
  toUserEntityRef,
  toWorkflowEntityName,
} from './nameFormatting';

describe('sanitizeAapName', () => {
  describe('basic transformations', () => {
    it('converts to lowercase', () => {
      expect(sanitizeAapName('MyOrg')).toBe('myorg');
      expect(sanitizeAapName('ENGINEERING')).toBe('engineering');
    });

    it('converts spaces to hyphens', () => {
      expect(sanitizeAapName('My Team')).toBe('my-team');
      expect(sanitizeAapName('QA Team')).toBe('qa-team');
    });

    it('converts underscores to hyphens', () => {
      expect(sanitizeAapName('Dev_Ops')).toBe('dev-ops');
      expect(sanitizeAapName('Test_Org')).toBe('test-org');
    });

    it('converts slashes to -sls- tokens', () => {
      expect(sanitizeAapName('Dev/Ops')).toBe('dev-sls-ops');
      expect(sanitizeAapName('Team/QA')).toBe('team-sls-qa');
    });

    it('converts ampersands to -amp- tokens', () => {
      expect(sanitizeAapName('Dev&Ops')).toBe('dev-amp-ops');
      expect(sanitizeAapName('R&D Team')).toBe('r-amp-d-team');
    });

    it('converts at-signs to -at- tokens', () => {
      expect(sanitizeAapName('Test@Org')).toBe('test-at-org');
      expect(sanitizeAapName('user@domain')).toBe('user-at-domain');
    });
  });

  describe('special character removal', () => {
    it('removes exclamation marks', () => {
      expect(sanitizeAapName('QA-Team!')).toBe('qa-team');
      expect(sanitizeAapName('Ops!')).toBe('ops');
    });

    it('tokenizes at-signs in names (not bare hyphens)', () => {
      expect(sanitizeAapName('Team@Work')).toBe('team-at-work');
    });

    it('distinguishes @, &, and / from hyphenated names', () => {
      expect(sanitizeAapName('Test@Org')).toBe('test-at-org');
      expect(sanitizeAapName('Test-Org')).toBe('test-org');
      expect(sanitizeAapName('R&D')).toBe('r-amp-d');
      expect(sanitizeAapName('R-and-D')).toBe('r-and-d');
      expect(sanitizeAapName('Dev/Ops')).toBe('dev-sls-ops');
      expect(sanitizeAapName('Dev-Ops')).toBe('dev-ops');
    });

    it('removes dollar signs and other special chars', () => {
      expect(sanitizeAapName('$pecial#Chars%')).toBe('pecialchars');
    });

    it('removes parentheses and brackets', () => {
      expect(sanitizeAapName('Team(Old)')).toBe('teamold');
      expect(sanitizeAapName('Dev[Legacy]')).toBe('devlegacy');
    });
  });

  describe('hyphen normalization', () => {
    it('collapses multiple consecutive hyphens', () => {
      expect(sanitizeAapName('My---Team')).toBe('my-team');
      expect(sanitizeAapName('A--B--C')).toBe('a-b-c');
    });

    it('removes leading hyphens', () => {
      expect(sanitizeAapName('---Team')).toBe('team');
      expect(sanitizeAapName('-Org')).toBe('org');
    });

    it('removes trailing hyphens', () => {
      expect(sanitizeAapName('Team---')).toBe('team');
      expect(sanitizeAapName('Org-')).toBe('org');
    });

    it('removes both leading and trailing hyphens', () => {
      expect(sanitizeAapName('---My Team---')).toBe('my-team');
    });
  });

  describe('combined transformations', () => {
    it('handles underscores, spaces, and special chars together', () => {
      expect(sanitizeAapName('Dev_Ops Team!')).toBe('dev-ops-team');
      expect(sanitizeAapName('QA___Test   Team!!!')).toBe('qa-test-team');
    });

    it('handles multiple separators together', () => {
      expect(sanitizeAapName('My___Org   /Team')).toBe('my-org-sls-team');
    });
  });

  describe('length limits', () => {
    it('truncates names longer than 63 characters', () => {
      const longName = 'A'.repeat(100);
      expect(sanitizeAapName(longName)).toBe('a'.repeat(63));
    });

    it('removes trailing hyphen after truncation', () => {
      const longName = `${'A'.repeat(62)}-B`;
      const result = sanitizeAapName(longName);
      expect(result).toBe('a'.repeat(62));
      expect(result).not.toMatch(/-$/);
    });

    it('preserves names under 63 characters', () => {
      const name = 'a'.repeat(50);
      expect(sanitizeAapName(name)).toBe(name);
    });
  });

  describe('real-world AAP names (bug scenarios)', () => {
    it('handles Test_Org (AAP-91915 Bug 1)', () => {
      expect(sanitizeAapName('Test_Org')).toBe('test-org');
    });

    it('handles QA-Team! (AAP-91915 Bug 2)', () => {
      expect(sanitizeAapName('QA-Team!')).toBe('qa-team');
    });

    it('handles Special Team! (AAP-91915 Bug 3)', () => {
      expect(sanitizeAapName('Special Team!')).toBe('special-team');
    });

    it('handles CloudOps (normal case)', () => {
      expect(sanitizeAapName('CloudOps')).toBe('cloudops');
    });

    it('handles Engineering (normal case)', () => {
      expect(sanitizeAapName('Engineering')).toBe('engineering');
    });
  });

  describe('edge cases', () => {
    it('handles single character', () => {
      expect(sanitizeAapName('A')).toBe('a');
      expect(sanitizeAapName('1')).toBe('1');
    });

    it('handles numbers', () => {
      expect(sanitizeAapName('Team123')).toBe('team123');
      expect(sanitizeAapName('123')).toBe('123');
    });

    it('handles already valid names', () => {
      expect(sanitizeAapName('valid-name')).toBe('valid-name');
      expect(sanitizeAapName('team-qa')).toBe('team-qa');
    });
  });

  describe('error cases', () => {
    it('throws on empty string', () => {
      expect(() => sanitizeAapName('')).toThrow(
        /AAP name must be a non-empty string/,
      );
    });

    it('throws on null', () => {
      expect(() => sanitizeAapName(null as any)).toThrow(
        /AAP name must be a non-empty string/,
      );
    });

    it('throws on undefined', () => {
      expect(() => sanitizeAapName(undefined as any)).toThrow(
        /AAP name must be a non-empty string/,
      );
    });

    it('throws on non-string', () => {
      expect(() => sanitizeAapName(123 as any)).toThrow(
        /AAP name must be a non-empty string/,
      );
    });

    it('throws when name contains only special characters', () => {
      expect(() => sanitizeAapName('!!!')).toThrow(
        /contains no valid characters/,
      );
      expect(() => sanitizeAapName('___')).toThrow(
        /contains no valid characters/,
      );
      expect(() => sanitizeAapName('---')).toThrow(
        /contains no valid characters/,
      );
    });
  });

  describe('consistency with existing Function 1 (helpers.formatNameSpace)', () => {
    // These test cases ensure backward compatibility with existing org names
    it('matches Function 1 behavior for normal org names', () => {
      expect(sanitizeAapName('Default')).toBe('default');
      expect(sanitizeAapName('Engineering')).toBe('engineering');
    });

    it('matches Function 1 behavior for underscore conversion', () => {
      expect(sanitizeAapName('My_Org')).toBe('my-org');
    });

    it('matches Function 1 behavior for special char removal', () => {
      expect(sanitizeAapName('Org!')).toBe('org');
    });
  });

  describe('regex validation edge case (coverage)', () => {
    it('validates output against Backstage name regex', () => {
      // This test ensures line 82-87 (regex validation) is covered
      // The sanitization logic should always produce valid output,
      // but we test edge cases to ensure the validation works
      expect(sanitizeAapName('-a-')).toBe('a');
      expect(sanitizeAapName('---a---')).toBe('a');
      expect(sanitizeAapName('a-b-c')).toBe('a-b-c');
    });
  });
});

describe('catalog entity names with AAP IDs', () => {
  it('keeps slug names when multi-org is disabled', () => {
    expect(toOrgEntityName('Engineering', 12)).toBe('engineering');
    expect(toTeamEntityName('Engineering', 99)).toBe('engineering');
    expect(toTemplateEntityName('Craig', 5238)).toBe('craig');
    expect(toWorkflowEntityName('Deploy', 9001)).toBe('deploy');
  });

  it('uses source-type-id names when multi-org is enabled', () => {
    const options = { multiOrgEnabled: true };
    expect(toOrgEntityName('Engineering', 12, options)).toBe('aap-org-12');
    expect(toTeamEntityName('Engineering', 99, options)).toBe('aap-team-99');
    expect(toTemplateEntityName('Craig', 5238, options)).toBe('aap-jt-5238');
    expect(toWorkflowEntityName('Deploy', 9001, options)).toBe('aap-wft-9001');
    expect(toUserEntityName('ops_admin', 42, options)).toBe('aap-user-42');
    expect(toUserEntityRef('ops_admin', 42, options)).toBe(
      'user:default/aap-user-42',
    );
    expect(
      toUserEntityName('alice', 42, { multiOrgEnabled: true, source: 'ao' }),
    ).toBe('ao-user-42');
  });

  it('keeps raw user identity when multi-org is disabled', () => {
    expect(toUserEntityName('ops_admin', 42)).toBe('ops_admin');
    expect(toUserEntityRef('ops_admin', 42)).toBe('user:default/ops_admin');
  });

  it('builds group refs from org and team names', () => {
    expect(toOrgGroupRef('default', 'Engineering', 12)).toBe(
      'group:default/engineering',
    );
    expect(toTeamGroupRef('default', 'QA', 101)).toBe('group:default/qa');
  });

  it('uses source-type-id refs when multi-org is enabled', () => {
    const options = { multiOrgEnabled: true };
    expect(toOrgGroupRef('aap-12', 'Engineering', 12, undefined, options)).toBe(
      'group:aap-12/aap-org-12',
    );
    expect(toTeamGroupRef('aap-12', 'QA', 101, undefined, options)).toBe(
      'group:aap-12/aap-team-101',
    );
  });

  it('keeps assembled names within 63 characters', () => {
    const longName = `Org-${'a'.repeat(80)}`;
    const result = toOrgEntityName(longName, 5238394829);
    expect(result.length).toBeLessThanOrEqual(63);
    expect(result.length).toBeLessThanOrEqual(63);
    expect(result.startsWith('org-')).toBe(true);
  });

  it('rejects names with no valid slug when multi-org is disabled', () => {
    expect(() => toOrgEntityName('!!!', 12)).toThrow(
      /contains no valid characters/,
    );
  });
});

describe('toSourceNamespace', () => {
  it('uses default namespace when multi-org is disabled', () => {
    expect(toSourceNamespace('Default')).toBe('default');
    expect(toSourceNamespace('Engineering')).toBe('default');
  });

  it('uses source and stable org id when multi-org is enabled', () => {
    expect(
      toSourceNamespace('Engineering', undefined, {
        multiOrgEnabled: true,
        orgId: 42,
      }),
    ).toBe('aap-42');
  });
});

describe('sanitizeAapUsername', () => {
  it('preserves simple alphanumeric usernames', () => {
    expect(sanitizeAapUsername('johndoe')).toBe('johndoe');
    expect(toUserEntityRef('johndoe')).toBe('user:default/johndoe');
  });

  it('maps AAP-allowed special characters to Backstage-safe tokens', () => {
    expect(sanitizeAapUsername('user@example.com')).toBe('user-at-example-com');
    expect(sanitizeAapUsername('first.last')).toBe('first-last');
    expect(sanitizeAapUsername('user+alias')).toBe('user-plus-alias');
    expect(sanitizeAapUsername('dev_ops')).toBe('dev-ops');
  });

  it('keeps raw username refs until the id-based user migration', () => {
    expect(toUserEntityRef('ops_admin')).toBe('user:default/ops_admin');
  });

  it('throws when username has no valid characters', () => {
    expect(() => sanitizeAapUsername('!!!')).toThrow(
      /contains no valid characters/,
    );
  });
});
