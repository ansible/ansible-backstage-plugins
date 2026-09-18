/*
 * Copyright 2024 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 *
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
 * Canonical AAP name to Backstage entity name/namespace sanitization.
 *
 * Entity name patterns (source = aap | ao | scm):
 * - Organization: o-{source}-{slug}-{id} (fallback o-{source}-{id})
 * - Team: t-{source}-{slug}-{id} (fallback t-{source}-{id})
 * - Job / workflow template: {source}-jt-{slug}-{id} / {source}-wf-{slug}-{id}
 *   (fallback {source}-jt-{id} / {source}-wf-{id})
 * - Namespace: {source}-{slug} (fallback {source})
 *
 * @see AAP-91915 - Three incompatible sanitizers consolidated into one
 */

const BACKSTAGE_NAME_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MAX_NAME_LENGTH = 63;

export type CatalogEntitySource = 'aap' | 'ao' | 'scm';

export const DEFAULT_CATALOG_ENTITY_SOURCE: CatalogEntitySource = 'aap';

function trimTrailingHyphen(value: string): string {
  return value.replace(/-$/, '');
}

function assertValidEntityName(name: string, rawName: string): void {
  if (!BACKSTAGE_NAME_REGEX.test(name)) {
    throw new Error(
      `AAP name "${rawName}" produced invalid Backstage identifier "${name}". ` +
        `Names must match ${BACKSTAGE_NAME_REGEX} (lowercase alphanumeric with hyphens, ` +
        `must start and end with alphanumeric).`,
    );
  }
}

function buildIdOnlyEntityName(namePrefix: string, resourceId: number): string {
  return `${namePrefix}-${resourceId}`;
}

/**
 * Sanitizes an AAP name without applying the 63-character truncation used for
 * standalone namespaces. Used as the slug portion of entity names that also
 * embed an AAP resource ID.
 */
export function sanitizeAapNameBase(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error(
      `AAP name must be a non-empty string, received: ${JSON.stringify(name)}`,
    );
  }

  const sanitized = trimTrailingHyphen(
    name
      .toLowerCase()
      .replaceAll(/[_\s/&@]+/g, '-')
      .replaceAll(/[^a-z0-9-]/g, '')
      .replaceAll(/-+/g, '-')
      .replaceAll(/^-|-$/g, ''),
  );

  if (!sanitized) {
    throw new Error(
      `AAP name "${name}" contains no valid characters for Backstage entity conversion. ` +
        `Names must contain at least one alphanumeric character.`,
    );
  }

  assertValidEntityName(sanitized, name);
  return sanitized;
}

function buildEntityNameWithSourceId(options: {
  rawName: string;
  resourceId: number;
  namePrefix: string;
}): string {
  const { rawName, resourceId, namePrefix } = options;
  const idStr = String(resourceId);

  let slug = '';
  try {
    slug = sanitizeAapNameBase(rawName);
  } catch {
    slug = '';
  }

  if (!slug) {
    return buildIdOnlyEntityName(namePrefix, resourceId);
  }

  const prefixPart = `${namePrefix}-`;
  const reservedWithoutSlug = prefixPart.length + 1 + idStr.length;
  const maxSlugLen = MAX_NAME_LENGTH - reservedWithoutSlug;

  if (maxSlugLen <= 0) {
    return buildIdOnlyEntityName(namePrefix, resourceId);
  }

  const truncatedSlug = trimTrailingHyphen(slug.slice(0, maxSlugLen));
  if (!truncatedSlug) {
    return buildIdOnlyEntityName(namePrefix, resourceId);
  }

  const name = `${prefixPart}${truncatedSlug}-${idStr}`;
  assertValidEntityName(name, rawName);
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(
      `AAP name "${rawName}" produced identifier "${name}" exceeding ${MAX_NAME_LENGTH} characters.`,
    );
  }
  return name;
}

export function toSourceNamespace(
  orgName: string,
  source: CatalogEntitySource = DEFAULT_CATALOG_ENTITY_SOURCE,
): string {
  let slug = '';
  try {
    slug = sanitizeAapNameBase(orgName);
  } catch {
    slug = '';
  }

  if (!slug) {
    return source;
  }

  const prefixPart = `${source}-`;
  const maxSlugLen = MAX_NAME_LENGTH - prefixPart.length;
  if (maxSlugLen <= 0) {
    return source;
  }

  const truncatedSlug = trimTrailingHyphen(slug.slice(0, maxSlugLen));
  if (!truncatedSlug) {
    return source;
  }

  const namespace = `${source}-${truncatedSlug}`;
  assertValidEntityName(namespace, orgName);
  return namespace;
}

export function toOrgEntityName(
  orgName: string,
  orgId: number,
  source: CatalogEntitySource = DEFAULT_CATALOG_ENTITY_SOURCE,
): string {
  return buildEntityNameWithSourceId({
    rawName: orgName,
    resourceId: orgId,
    namePrefix: `o-${source}`,
  });
}

export function toTeamEntityName(
  teamName: string,
  teamId: number,
  source: CatalogEntitySource = DEFAULT_CATALOG_ENTITY_SOURCE,
): string {
  return buildEntityNameWithSourceId({
    rawName: teamName,
    resourceId: teamId,
    namePrefix: `t-${source}`,
  });
}

export function toTemplateEntityName(
  jobName: string,
  jobTemplateId: number,
  source: CatalogEntitySource = DEFAULT_CATALOG_ENTITY_SOURCE,
): string {
  return buildEntityNameWithSourceId({
    rawName: jobName,
    resourceId: jobTemplateId,
    namePrefix: `${source}-jt`,
  });
}

export function toWorkflowEntityName(
  workflowName: string,
  workflowId: number,
  source: CatalogEntitySource = DEFAULT_CATALOG_ENTITY_SOURCE,
): string {
  return buildEntityNameWithSourceId({
    rawName: workflowName,
    resourceId: workflowId,
    namePrefix: `${source}-wf`,
  });
}

/**
 * Converts an AAP username to a valid Backstage User entity name.
 *
 * AAP allows letters, numbers, and @ . + - _ characters. Backstage requires
 * lowercase alphanumeric with internal hyphens, starting and ending alphanumeric.
 */
export function sanitizeAapUsername(username: string): string {
  if (!username || typeof username !== 'string') {
    throw new Error(
      `AAP username must be a non-empty string, received: ${JSON.stringify(username)}`,
    );
  }

  const sanitized = trimTrailingHyphen(
    username
      .toLowerCase()
      .replaceAll('@', '-at-')
      .replaceAll('.', '-')
      .replaceAll('+', '-plus-')
      .replaceAll('_', '-')
      .replaceAll(/[^a-z0-9-]/g, '')
      .replaceAll(/-+/g, '-')
      .replaceAll(/^-|-$/g, '')
      .slice(0, MAX_NAME_LENGTH),
  );

  if (!sanitized) {
    throw new Error(
      `AAP username "${username}" contains no valid characters for Backstage entity conversion.`,
    );
  }

  assertValidEntityName(sanitized, username);
  return sanitized;
}

export function toUserEntityRef(username: string): string {
  return `user:default/${sanitizeAapUsername(username)}`;
}

export function toOrgGroupRef(
  namespace: string,
  orgName: string,
  orgId: number,
  source: CatalogEntitySource = DEFAULT_CATALOG_ENTITY_SOURCE,
): string {
  return `group:${namespace}/${toOrgEntityName(orgName, orgId, source)}`;
}

export function toTeamGroupRef(
  namespace: string,
  teamName: string,
  teamId: number,
  source: CatalogEntitySource = DEFAULT_CATALOG_ENTITY_SOURCE,
): string {
  return `group:${namespace}/${toTeamEntityName(teamName, teamId, source)}`;
}

/**
 * Sanitizes an AAP name (organization or team) into a valid Backstage
 * entity name or namespace slug (without source prefix).
 *
 * @deprecated Prefer toSourceNamespace() for org-scoped namespaces.
 */
export function sanitizeAapName(name: string): string {
  const sanitized = trimTrailingHyphen(
    sanitizeAapNameBase(name).slice(0, MAX_NAME_LENGTH),
  );

  if (!sanitized) {
    throw new Error(
      `AAP name "${name}" contains no valid characters for Backstage entity conversion. ` +
        `Names must contain at least one alphanumeric character.`,
    );
  }

  assertValidEntityName(sanitized, name);
  return sanitized;
}
