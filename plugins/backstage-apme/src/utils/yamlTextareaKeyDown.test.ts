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

import { applyYamlTextareaKeyDown } from './yamlTextareaKeyDown';

describe('applyYamlTextareaKeyDown', () => {
  it('inserts two spaces on Tab', () => {
    const result = applyYamlTextareaKeyDown(
      'hello',
      { start: 5, end: 5 },
      'Tab',
      false,
    );
    expect(result?.value).toBe('hello  ');
    expect(result?.selectionStart).toBe(7);
  });

  it('outdents on Shift+Tab', () => {
    const value = '  line';
    const result = applyYamlTextareaKeyDown(
      value,
      { start: 6, end: 6 },
      'Tab',
      true,
    );
    expect(result?.value).toBe('line');
  });
});
