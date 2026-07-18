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

import { validateYamlContent } from './validateYamlContent';

describe('validateYamlContent', () => {
  it('accepts valid YAML', () => {
    expect(validateYamlContent('name: test\nvalue: 1')).toEqual({ valid: true });
  });

  it('reports parse errors', () => {
    const result = validateYamlContent('name: [\n');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.message).toBeTruthy();
    }
  });

  it('treats empty content as valid', () => {
    expect(validateYamlContent('   ')).toEqual({ valid: true });
  });
});
