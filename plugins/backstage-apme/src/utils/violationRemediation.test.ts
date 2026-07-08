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
  formatViolationMessage,
  yamlSnippetAroundLine,
} from './violationRemediation';

describe('formatViolationMessage', () => {
  it('splits semicolon-separated lint messages', () => {
    expect(
      formatViolationMessage(
        "duplicate key 'a' at indent 6; duplicate key 'b' at indent 8",
      ),
    ).toEqual([
      "duplicate key 'a' at indent 6",
      "duplicate key 'b' at indent 8",
    ]);
  });

  it('returns a single bullet for one message', () => {
    expect(formatViolationMessage('Missing required key: name')).toEqual([
      'Missing required key: name',
    ]);
  });

  it('trims whitespace around segments', () => {
    expect(formatViolationMessage(' first ;  second  ')).toEqual([
      'first',
      'second',
    ]);
  });

  it('returns empty array for blank input', () => {
    expect(formatViolationMessage('   ')).toEqual([]);
  });
});

describe('yamlSnippetAroundLine', () => {
  it('returns full yaml when under the line limit', () => {
    const yaml = ['a', 'b', 'c'].join('\n');
    expect(yamlSnippetAroundLine(yaml, 2)).toEqual({
      snippet: yaml,
      startLine: 1,
      truncatedAbove: false,
      truncatedBelow: false,
    });
  });

  it('returns a window around the violation line for long yaml', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line-${i + 1}`);
    const yaml = lines.join('\n');
    const result = yamlSnippetAroundLine(yaml, 20, 3, 10);

    expect(result.snippet.split('\n')).toHaveLength(10);
    expect(result.snippet).toContain('line-20');
    expect(result.startLine).toBeGreaterThanOrEqual(11);
    expect(result.startLine).toBeLessThanOrEqual(20);
    expect(result.truncatedAbove).toBe(true);
    expect(result.truncatedBelow).toBe(true);
  });
});
