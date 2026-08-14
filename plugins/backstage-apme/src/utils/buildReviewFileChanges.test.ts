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

import type { Proposal, Violation } from '@ansible/backstage-apme-common/types';
import { buildReviewFileChanges } from './buildReviewFileChanges';

const violation: Violation = {
  id: 1,
  rule_id: 'RULE-1',
  file: 'playbook.yml',
  line: 10,
  level: 'medium',
  message: 'test',
  remediation_class: 1,
  validator_source: 'native',
  original_yaml: 'old: true',
  fixed_yaml: 'old: false',
};

describe('buildReviewFileChanges', () => {
  it('includes proposals with visible diffs', () => {
    const proposals: Proposal[] = [
      {
        id: 'p1',
        violation_id: 1,
        rule_id: 'RULE-1',
        file: 'playbook.yml',
        line: 10,
        original_yaml: 'old: true',
        fixed_yaml: 'old: false',
        status: 'pending',
        diff_hunk: '--- a\n+++ b\n@@\n-old\n+new',
      },
    ];

    const result = buildReviewFileChanges(proposals, null, [violation]);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('playbook.yml');
    expect(result[0].after).toBe('old: false');
  });

  it('excludes declined proposals and empty files', () => {
    const proposals: Proposal[] = [
      {
        id: 'declined',
        violation_id: 2,
        rule_id: 'RULE-2',
        file: 'ignored.yml',
        line: 1,
        original_yaml: '',
        fixed_yaml: '',
        status: 'declined',
      },
      {
        id: 'empty',
        violation_id: 3,
        rule_id: 'RULE-3',
        file: 'empty.yml',
        line: 1,
        original_yaml: 'same',
        fixed_yaml: 'same',
        status: 'pending',
      },
    ];

    expect(buildReviewFileChanges(proposals, null, [])).toEqual([]);
  });

  it('includes diff-only proposals when diff_hunk is present', () => {
    const proposals: Proposal[] = [
      {
        id: 'diff-only',
        violation_id: 4,
        rule_id: 'RULE-4',
        file: 'Chart.yaml',
        line: 1,
        original_yaml: '',
        fixed_yaml: '',
        status: 'pending',
        diff_hunk:
          '--- a/Chart.yaml\n+++ b/Chart.yaml\n@@ -1 +1 @@\n-version: 0.1.0\n+version: 0.1.1',
      },
    ];

    const result = buildReviewFileChanges(proposals, null, []);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('Chart.yaml');
    expect(result[0].diff).toContain('version: 0.1.1');
  });

  it('merges multiple proposals on the same file', () => {
    const proposals: Proposal[] = [
      {
        id: 'p1',
        violation_id: 1,
        rule_id: 'RULE-1',
        file: 'playbook.yml',
        line: 1,
        original_yaml: '',
        fixed_yaml: '',
        status: 'pending',
        diff_hunk: '--- a\n+++ b\n@@\n-old\n+new',
      },
      {
        id: 'p2',
        violation_id: 2,
        rule_id: 'RULE-2',
        file: 'playbook.yml',
        line: 5,
        original_yaml: 'x: 1',
        fixed_yaml: 'x: 2',
        status: 'pending',
      },
    ];

    const result = buildReviewFileChanges(proposals, null, []);
    expect(result).toHaveLength(1);
    expect(result[0].after).toBe('x: 2');
    expect(result[0].diff).toContain('+new');
  });

  it('falls back to generated violation fixed_yaml when proposal is thin', () => {
    const proposals: Proposal[] = [];
    const extra: Violation = {
      ...violation,
      id: 99,
      file: 'roles/foo/tasks/main.yml',
      fixed_yaml: 'name: fixed task',
    };

    const result = buildReviewFileChanges(proposals, null, [violation, extra], new Set([99]));
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('roles/foo/tasks/main.yml');
    expect(result[0].after).toBe('name: fixed task');
  });
});
