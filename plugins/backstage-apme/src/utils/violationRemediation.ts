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

export interface YamlSnippet {
  snippet: string;
  startLine: number;
  truncatedAbove: boolean;
  truncatedBelow: boolean;
}

/** Split semicolon-separated lint messages into display bullets. */
export function formatViolationMessage(message: string): string[] {
  const trimmed = message.trim();
  if (!trimmed) {
    return [];
  }
  const parts = trimmed
    .split(';')
    .map(part => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

/** Return a YAML window around the violation line for scannable expanded rows. */
export function yamlSnippetAroundLine(
  yaml: string,
  line: number,
  context = 3,
  maxTotalLines = 20,
): YamlSnippet {
  const lines = yaml.split('\n');
  if (lines.length <= maxTotalLines) {
    return {
      snippet: yaml,
      startLine: 1,
      truncatedAbove: false,
      truncatedBelow: false,
    };
  }

  const targetIndex = Math.max(0, Math.min(line - 1, lines.length - 1));
  let start = Math.max(0, targetIndex - context);
  let end = Math.min(lines.length, targetIndex + context + 1);

  while (end - start < maxTotalLines && (start > 0 || end < lines.length)) {
    if (start > 0) {
      start -= 1;
    }
    if (end < lines.length && end - start < maxTotalLines) {
      end += 1;
    }
    if (start === 0 && end === lines.length) {
      break;
    }
  }

  return {
    snippet: lines.slice(start, end).join('\n'),
    startLine: start + 1,
    truncatedAbove: start > 0,
    truncatedBelow: end < lines.length,
  };
}
