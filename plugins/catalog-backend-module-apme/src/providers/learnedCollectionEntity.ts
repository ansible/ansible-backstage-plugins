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
import type { CollectionRef } from '@ansible/backstage-apme-common';

/** Annotation linking a learned (or usage) collection entity to a git-repo. */
export const CONSUMED_BY_REPOSITORY_ANNOTATION =
  'ansible.io/consumed-by-repository';

/** Optional ref to an existing catalog collection (PAH/SCM). */
export const CANONICAL_COLLECTION_ANNOTATION =
  'ansible.io/canonical-collection';

export const LEARNED_COLLECTION_SOURCE = 'learned';

export function sanitizeLearnedEntityName(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/(^-)|(-$)/g, '')
    .substring(0, 63);
}

export function parseCollectionFqcn(fqcn: string): {
  namespace: string;
  name: string;
} | null {
  const parts = fqcn.trim().split('.');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { namespace: parts[0], name: parts.slice(1).join('.') };
}

export function collectionFqcnKey(fullName: string, version?: string): string {
  const v = (version ?? '').trim();
  return v ? `${fullName}@${v}` : fullName;
}

export function buildLearnedCollectionEntityName(
  repoEntityName: string,
  fqcn: string,
  version: string,
): string {
  const parsed = parseCollectionFqcn(fqcn);
  const ns = parsed?.namespace ?? 'unknown';
  const name = parsed?.name ?? fqcn;
  const ver = version?.trim() || 'unknown';
  return sanitizeLearnedEntityName(
    `apme-learned-${repoEntityName}-${ns}.${name}-${ver}`,
  );
}

export interface BuildLearnedCollectionEntityOptions {
  repoEntity: Entity;
  projectId: string;
  collection: CollectionRef;
  /** Existing catalog entity name for the same FQCN+version, if any. */
  canonicalEntityName?: string;
}

/** Builds a synthetic ansible-collection Component for an APME learned dep. */
export function buildLearnedCollectionEntity(
  options: BuildLearnedCollectionEntityOptions,
): Entity | null {
  const { repoEntity, projectId, collection, canonicalEntityName } = options;
  const repoName = repoEntity.metadata?.name;
  if (!repoName) {
    return null;
  }

  const parsed = parseCollectionFqcn(collection.fqcn);
  if (!parsed) {
    return null;
  }

  const version = collection.version?.trim() || 'unknown';
  const entityName = buildLearnedCollectionEntityName(
    repoName,
    collection.fqcn,
    version,
  );
  const fullName = `${parsed.namespace}.${parsed.name}`;
  const title =
    version && version !== 'unknown' ? `${fullName} v${version}` : fullName;

  const annotations: Record<string, string> = {
    [CONSUMED_BY_REPOSITORY_ANNOTATION]: repoName,
    'ansible.io/collection-source': LEARNED_COLLECTION_SOURCE,
    'ansible.io/apme-project-id': projectId,
    'ansible.io/apme-dependency-source': collection.source || 'learned',
    'backstage.io/managed-by-location': `apme-learned-deps:${repoName}`,
    'backstage.io/managed-by-origin-location': `apme-learned-deps:${repoName}`,
  };

  if (canonicalEntityName) {
    annotations[CANONICAL_COLLECTION_ANNOTATION] =
      `component:default/${canonicalEntityName}`;
  }

  const repoAnnotations = repoEntity.metadata?.annotations ?? {};
  for (const key of [
    'ansible.io/scm-provider',
    'ansible.io/scm-host',
    'ansible.io/scm-organization',
    'ansible.io/scm-repository',
  ] as const) {
    const value = repoAnnotations[key];
    if (typeof value === 'string' && value) {
      annotations[key] = value;
    }
  }

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: entityName,
      namespace: 'default',
      title,
      description: `Learned dependency of ${repoName}: ${fullName}`,
      annotations,
      tags: ['ansible-collection', 'learned-dependency'],
    },
    spec: {
      type: 'ansible-collection',
      lifecycle: 'production',
      owner: parsed.namespace,
      system: `${parsed.namespace}-collections`,
      collection_namespace: parsed.namespace,
      collection_name: parsed.name,
      collection_version: version === 'unknown' ? '' : version,
      collection_full_name: fullName,
    },
  };
}

/** Index catalog collections by FQCN[@version] for canonical matching. */
export function indexCatalogCollectionsByFqcn(
  collections: Entity[],
): Map<string, Entity> {
  const index = new Map<string, Entity>();
  for (const entity of collections) {
    const annotations = entity.metadata?.annotations ?? {};
    if (
      annotations['ansible.io/collection-source'] === LEARNED_COLLECTION_SOURCE
    ) {
      continue;
    }
    const spec = (entity.spec ?? {}) as {
      collection_full_name?: string;
      collection_version?: string;
    };
    const fullName = spec.collection_full_name;
    if (typeof fullName !== 'string' || !fullName) {
      continue;
    }
    const version =
      typeof spec.collection_version === 'string'
        ? spec.collection_version
        : '';
    index.set(collectionFqcnKey(fullName, version), entity);
    // Also index by FQCN alone for version-less lookups (first wins).
    if (!index.has(fullName)) {
      index.set(fullName, entity);
    }
  }
  return index;
}

export function findCanonicalCollectionEntity(
  index: Map<string, Entity>,
  fqcn: string,
  version: string,
): Entity | undefined {
  const withVersion = collectionFqcnKey(fqcn, version);
  return index.get(withVersion) ?? index.get(fqcn);
}
