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

import YAML from 'js-yaml';

export type YamlValidationResult =
  | { valid: true }
  | { valid: false; message: string; line?: number };

function lineFromYamlError(message: string): number | undefined {
  const match = message.match(/at line (\d+)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/** Basic YAML syntax check for in-portal edit (non-blocking). */
export function validateYamlContent(content: string): YamlValidationResult {
  const trimmed = content.trim();
  if (!trimmed) {
    return { valid: true };
  }
  try {
    YAML.load(trimmed, { json: true });
    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      message,
      line: lineFromYamlError(message),
    };
  }
}
