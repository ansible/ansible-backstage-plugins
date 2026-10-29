/*
 * Copyright 2026 The Ansible plugin Authors
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

/**
 * Phase 0 — contract freeze.
 *
 * Locks down the public contract of this monolithic module *before* it is
 * split into `scaffolder-backend-module-aap` and
 * `portal-scaffolder-backend-module`
 * (see `.sdlc/research/scaffolder-implementation-guide.md`).
 *
 * These assertions must keep passing, unchanged in intent, through every
 * stage of the split. A failure here during the split means a behaviour
 * change slipped in, not just a file move — action ids, filter names, the
 * autocomplete provider id, and the picker<->createEEDefinition source
 * string format are all contracts that template authors and frontend
 * pickers depend on (see guide §2.5 and §6).
 *
 * Every assertion in this file calls real production code (never a local
 * string literal standing in for it). Two contracts that are easier to
 * verify by exercising a *consumer* module than by duplicating logic here
 * are covered in those modules instead, with a pointer left below:
 *   - the `aap-api-cloud` provider id + full 8-action registration ->
 *     `./module.test.ts`
 *   - per-resource autocomplete dispatch (verbosity/aaphostname/collections
 *     never touch the AAP Controller) -> `./autocomplete/autocomplete.test.ts`
 *   - the PAH/SCM source string round-tripping through the real
 *     createEEDefinition action -> `./actions/createEEDefinition.test.ts`
 */

import { createAnsibleContentAction } from './actions/ansible';
import { createProjectAction } from './actions/aapCreateProject';
import { createExecutionEnvironment } from './actions/aapCreateEEEnv';
import { createJobTemplate } from './actions/aapCreateJobTemplate';
import { launchJobTemplate } from './actions/aapLaunchJobTemplate';
import { cleanUp } from './actions/aapCleanUp';
import { createEEDefinitionAction } from './actions/createEEDefinition';
import { prepareForPublishAction } from './actions/prepareForPublish';
import * as filters from './filters';
import { buildCollectionsFromCatalogEntities } from './autocomplete/utils';

// These action/filter constructors only touch their injected services inside
// their `handler`/request functions, never at construction time (verified by
// reading each source file), so empty fakes are enough to read off `.id`.
const fakeConfig: any = {
  getOptionalString: () => undefined,
  getString: () => '',
};
const fakeAnsibleService: any = {};
const fakeAuth: any = {};
const fakeDiscovery: any = {};

describe('Phase 0 contract freeze: action IDs', () => {
  it('keeps the rhaap:* action IDs stable (target ownership: scaffolder-backend-module-aap)', () => {
    const ids = [
      createProjectAction(fakeAnsibleService).id,
      createExecutionEnvironment(fakeAnsibleService).id,
      createJobTemplate(fakeAnsibleService).id,
      launchJobTemplate(fakeAnsibleService, fakeConfig).id,
      cleanUp(fakeAnsibleService).id,
    ];

    expect(ids).toEqual([
      'rhaap:create-project',
      'rhaap:create-execution-environment',
      'rhaap:create-job-template',
      'rhaap:launch-job-template',
      'rhaap:clean-up',
    ]);
  });

  it('keeps the ansible:* action IDs stable (target ownership: portal-scaffolder-backend-module)', () => {
    const ids = [
      createAnsibleContentAction(fakeConfig).id,
      createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth: fakeAuth,
        discovery: fakeDiscovery,
        config: fakeConfig,
      }).id,
      prepareForPublishAction({ rootConfig: fakeConfig }).id,
    ];

    expect(ids).toEqual([
      'ansible:content:create',
      'ansible:create:ee-definition',
      'ansible:prepare:publish',
    ]);
  });
});

describe('Phase 0 contract freeze: template filters (target: scaffolder-backend-module-aap)', () => {
  it('exports exactly the four template filters', () => {
    expect(Object.keys(filters).sort()).toEqual([
      'multiResourceFilter',
      'resourceFilter',
      'useCaseNameFilter',
      'uuidFilter',
    ]);
    expect(
      Object.values(filters).every(filter => typeof filter === 'function'),
    ).toBe(true);
  });
});

// The 'aap-api-cloud' provider id (consumed by CollectionsPicker /
// AAPResourcePicker, see guide §6) and the full 8-action registration are
// asserted against the real `scaffolderModuleAnsible.init()` output in
// `./module.test.ts` — asserting them again here as local string literals
// would be a self-comparison that can't catch drift in the real module.

// Per-resource autocomplete dispatch (verbosity/aaphostname/collections each
// skip the AAP Controller call) is asserted against the real
// `handleAutocompleteRequest` in `./autocomplete/autocomplete.test.ts` —
// see the 'should return verbosity', 'should return aap hostname', and
// 'should return collections with search query' tests there.

describe('Phase 0 contract freeze: picker <-> createEEDefinition source-string format (guide §2.5)', () => {
  it('formats a PAH-backed collection source as "Private Automation Hub / <repo>"', () => {
    const [entry] = buildCollectionsFromCatalogEntities([
      {
        spec: { collection_full_name: 'ns.coll', collection_version: '1.0.0' },
        metadata: {
          annotations: {
            'ansible.io/collection-source': 'pah',
            'ansible.io/collection-source-repository': 'validated',
          },
        },
      },
    ]);

    expect(entry.sources).toEqual(['Private Automation Hub / validated']);
  });

  it('formats an SCM-backed collection source as "<Provider> / <canonical name> / <org> / <repo>"', () => {
    const [entry] = buildCollectionsFromCatalogEntities([
      {
        spec: { collection_full_name: 'ns.coll', collection_version: '2.0.0' },
        metadata: {
          annotations: {
            'ansible.io/scm-provider': 'github',
            'ansible.io/scm-host': 'github.com',
            'ansible.io/scm-host-name': 'github-public',
            'ansible.io/scm-organization': 'org1',
            'ansible.io/scm-repository': 'repo1',
          },
        },
      },
    ]);

    expect(entry.sources).toEqual(['Github / github-public / org1 / repo1']);
  });

  // The consumer side of this contract — createEEDefinition.ts actually
  // parsing a producer-generated source string back into a `private_hub_*`
  // id (PAH) or a git URL + scmServers entry (SCM) — is asserted end-to-end
  // against the real action in `./actions/createEEDefinition.test.ts`
  // ("accepts a PAH/SCM source emitted by the collections picker" tests).
  // Re-deriving the parse here with hand-written split()/startsWith() logic
  // would duplicate createEEDefinition.ts's own logic in the test rather
  // than exercising it, so it is intentionally not repeated in this file.
});
