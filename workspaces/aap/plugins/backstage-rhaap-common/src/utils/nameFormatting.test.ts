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
  sanitizeAapNameBase,
  sanitizeAapUsername,
  toOrgEntityName,
  toTeamEntityName,
  toTemplateEntityName,
  toWorkflowEntityName,
  toUserEntityName,
  toUserEntityRef,
  toOrgGroupRef,
  toTeamGroupRef,
  toSourceNamespace,
  DEFAULT_CATALOG_ENTITY_SOURCE,
} from './nameFormatting';

describe('backstage-rhaap-common nameFormatting shim', () => {
  it('re-exports sanitizers from aap-common', () => {
    expect(sanitizeAapName('Engineering')).toBe('engineering');
    expect(sanitizeAapNameBase('Test@Org')).toBe('test-at-org');
    expect(sanitizeAapUsername('user@example.com')).toBe('user-at-example-com');
  });

  it('re-exports entity name helpers from aap-common', () => {
    const multi = { multiOrgEnabled: true };
    expect(toOrgEntityName('Engineering', 12, multi)).toBe('aap-org-12');
    expect(toTeamEntityName('QA', 99, multi)).toBe('aap-team-99');
    expect(toTemplateEntityName('Craig', 5238, multi)).toBe('aap-jt-5238');
    expect(toWorkflowEntityName('Deploy', 9001, multi)).toBe('aap-wft-9001');
    expect(toUserEntityName('ops_admin', 42, multi)).toBe('aap-user-42');
    expect(toUserEntityRef('ops_admin', 42, multi)).toBe(
      'user:default/aap-user-42',
    );
  });

  it('re-exports group refs, namespace helpers, and defaults', () => {
    expect(DEFAULT_CATALOG_ENTITY_SOURCE).toBe('aap');
    expect(toSourceNamespace('Engineering')).toBe('default');
    expect(toOrgGroupRef('default', 'Engineering', 12)).toBe(
      'group:default/engineering',
    );
    expect(toTeamGroupRef('default', 'QA', 101)).toBe('group:default/qa');
  });
});
