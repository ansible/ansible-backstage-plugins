/*
 * Copyright 2025 The Ansible plugin Authors
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

import { normalizeTags, normalizeBaseUrl } from './helpers';

describe('providers/helpers', () => {
  describe('normalizeTags', () => {
    it('should lowercase tags', () => {
      expect(normalizeTags(['Linux', 'POSIX'])).toEqual(['linux', 'posix']);
    });

    it('should replace invalid characters with hyphens', () => {
      expect(normalizeTags(['tag_with_underscore'])).toEqual([
        'tag-with-underscore',
      ]);
      expect(normalizeTags(['tag.with.dots'])).toEqual(['tag-with-dots']);
      // # and + are allowed by the regex [^a-z0-9+#-]
      expect(normalizeTags(['tag#hash'])).toEqual(['tag#hash']);
    });

    it('should collapse multiple hyphens', () => {
      expect(normalizeTags(['tag---value'])).toEqual(['tag-value']);
    });

    it('should strip leading and trailing hyphens', () => {
      expect(normalizeTags(['--tag--'])).toEqual(['tag']);
      expect(normalizeTags(['-leading'])).toEqual(['leading']);
      expect(normalizeTags(['trailing-'])).toEqual(['trailing']);
    });

    it('should allow alphanumeric, +, #, -', () => {
      // Trailing hyphen is stripped by replace(/^-|-$/g, '')
      expect(normalizeTags(['a-z0-9+#-'])).toEqual(['a-z0-9+#']);
    });
  });

  describe('normalizeBaseUrl', () => {
    it('should remove trailing slash', () => {
      expect(normalizeBaseUrl('https://example.com/')).toBe(
        'https://example.com',
      );
    });

    it('should leave URL without trailing slash unchanged', () => {
      expect(normalizeBaseUrl('https://example.com')).toBe(
        'https://example.com',
      );
    });
  });
});
