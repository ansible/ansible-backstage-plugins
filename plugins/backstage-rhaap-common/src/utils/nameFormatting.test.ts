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

import { sanitizeAapName } from './nameFormatting';

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

    it('converts slashes to hyphens', () => {
      expect(sanitizeAapName('Dev/Ops')).toBe('dev-ops');
      expect(sanitizeAapName('Team/QA')).toBe('team-qa');
    });
  });

  describe('special character removal', () => {
    it('removes exclamation marks', () => {
      expect(sanitizeAapName('QA-Team!')).toBe('qa-team');
      expect(sanitizeAapName('Ops!')).toBe('ops');
    });

    it('removes at signs', () => {
      expect(sanitizeAapName('Team@Work')).toBe('teamwork');
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
      expect(sanitizeAapName('My___Org   /Team')).toBe('my-org-team');
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
});
