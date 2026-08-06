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

import { Entity } from '@backstage/catalog-model';
import {
  buildLearnedCollectionEntity,
  buildLearnedCollectionEntityName,
  CONSUMED_BY_REPOSITORY_ANNOTATION,
  findCanonicalCollectionEntity,
  indexCatalogCollectionsByFqcn,
  parseCollectionFqcn,
  sanitizeLearnedEntityName,
} from './learnedCollectionEntity';

describe('learnedCollectionEntity', () => {
  const repoEntity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'terrible-playbook-github-github-com',
      annotations: {
        'ansible.io/scm-provider': 'github',
        'ansible.io/scm-host': 'github.com',
        'ansible.io/scm-organization': 'acme',
        'ansible.io/scm-repository': 'terrible-playbook',
      },
    },
    spec: { type: 'git-repository' },
  };

  it('sanitizes entity names to backstage limits', () => {
    expect(sanitizeLearnedEntityName('Foo.Bar__Baz!!!')).toBe('foo-bar-baz');
  });

  it('parses FQCN', () => {
    expect(parseCollectionFqcn('ansible.posix')).toEqual({
      namespace: 'ansible',
      name: 'posix',
    });
    expect(parseCollectionFqcn('bad')).toBeNull();
  });

  it('builds stable learned entity names', () => {
    expect(
      buildLearnedCollectionEntityName(
        'terrible-playbook-github-github-com',
        'ansible.posix',
        '1.5.4',
      ),
    ).toMatch(/^apme-learned-/);
  });

  it('builds a learned collection entity', () => {
    const entity = buildLearnedCollectionEntity({
      repoEntity,
      projectId: 'proj-1',
      collection: {
        fqcn: 'ansible.posix',
        version: '1.5.4',
        source: 'learned',
      },
      canonicalEntityName: 'pah-published-ansible.posix-1.5.4',
    });

    expect(entity).not.toBeNull();
    expect(entity!.spec?.type).toBe('ansible-collection');
    expect(
      entity!.metadata.annotations?.[CONSUMED_BY_REPOSITORY_ANNOTATION],
    ).toBe('terrible-playbook-github-github-com');
    expect(
      entity!.metadata.annotations?.['backstage.io/managed-by-location'],
    ).toMatch(/^apme-learned-deps:/);
    expect(entity!.metadata.annotations?.['ansible.io/collection-source']).toBe(
      'learned',
    );
    expect(
      entity!.metadata.annotations?.['ansible.io/canonical-collection'],
    ).toBe('component:default/pah-published-ansible.posix-1.5.4');
    expect(entity!.spec).toMatchObject({
      collection_namespace: 'ansible',
      collection_name: 'posix',
      collection_version: '1.5.4',
      collection_full_name: 'ansible.posix',
    });
  });

  it('indexes and finds canonical catalog collections', () => {
    const pah: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'pah-published-ansible.posix-1.5.4',
        annotations: { 'ansible.io/collection-source': 'pah' },
      },
      spec: {
        type: 'ansible-collection',
        collection_full_name: 'ansible.posix',
        collection_version: '1.5.4',
      },
    };
    const index = indexCatalogCollectionsByFqcn([pah]);
    expect(
      findCanonicalCollectionEntity(index, 'ansible.posix', '1.5.4')?.metadata
        .name,
    ).toBe('pah-published-ansible.posix-1.5.4');
  });
});
