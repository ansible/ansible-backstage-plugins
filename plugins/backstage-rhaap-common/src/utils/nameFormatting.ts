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
 * - Flag off: existing slug
 * - Flag on: {source}-{type}-{id}
 * - Flag off namespace: default
 * - Flag on namespace: {source}-{org-id}
 *
 * @see AAP-91915 - Three incompatible sanitizers consolidated into one
 */

const BACKSTAGE_NAME_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MAX_NAME_LENGTH = 63;

export type CatalogEntitySource = 'aap' | 'ao' | 'scm';

export const DEFAULT_CATALOG_ENTITY_SOURCE: CatalogEntitySource = 'aap';

export interface CatalogEntityIdentityOptions {
  multiOrgEnabled?: boolean;
  source?: CatalogEntitySource;
  orgId?: number;
}

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

  // Character tokens (not English synonyms) so Test@Org ≠ Test-Org,
  // R&D ≠ R-and-D, Dev/Ops ≠ Dev-Ops. Same idea as sanitizeAapUsername.
  const sanitized = trimTrailingHyphen(
    name
      .toLowerCase()
      .replaceAll('@', '-at-')
      .replaceAll('&', '-amp-')
      .replaceAll('/', '-sls-')
      .replaceAll(/[_\s]+/g, '-')
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

function buildEntityName(options: {
  rawName: string;
  resourceId: number;
  namePrefix: string;
  identity?: CatalogEntityIdentityOptions;
}): string {
  const { rawName, resourceId, namePrefix, identity } = options;
  if (!identity?.multiOrgEnabled) {
    return sanitizeAapName(rawName);
  }

  return buildIdOnlyEntityName(namePrefix, resourceId);
}

export function toSourceNamespace(
  orgName: string,
  source: CatalogEntitySource = DEFAULT_CATALOG_ENTITY_SOURCE,
  identity: CatalogEntityIdentityOptions = {},
): string {
  if (!identity.multiOrgEnabled) {
    return 'default';
  }
  if (!Number.isInteger(identity.orgId) || (identity.orgId as number) < 0) {
    throw new Error(
      `AAP organization "${orgName}" requires a stable numeric id for multi-org namespace assignment.`,
    );
  }
  return `${source}-${identity.orgId}`;
}

export function toOrgEntityName(
  orgName: string,
  orgId: number,
  identity: CatalogEntityIdentityOptions = {},
): string {
  const source = identity.source ?? DEFAULT_CATALOG_ENTITY_SOURCE;
  return buildEntityName({
    rawName: orgName,
    resourceId: orgId,
    namePrefix: `${source}-org`,
    identity,
  });
}

export function toTeamEntityName(
  teamName: string,
  teamId: number,
  identity: CatalogEntityIdentityOptions = {},
): string {
  const source = identity.source ?? DEFAULT_CATALOG_ENTITY_SOURCE;
  return buildEntityName({
    rawName: teamName,
    resourceId: teamId,
    namePrefix: `${source}-team`,
    identity,
  });
}

export function toTemplateEntityName(
  jobName: string,
  jobTemplateId: number,
  identity: CatalogEntityIdentityOptions = {},
): string {
  const source = identity.source ?? DEFAULT_CATALOG_ENTITY_SOURCE;
  return buildEntityName({
    rawName: jobName,
    resourceId: jobTemplateId,
    namePrefix: `${source}-jt`,
    identity,
  });
}

export function toWorkflowEntityName(
  workflowName: string,
  workflowId: number,
  identity: CatalogEntityIdentityOptions = {},
): string {
  const source = identity.source ?? DEFAULT_CATALOG_ENTITY_SOURCE;
  return buildEntityName({
    rawName: workflowName,
    resourceId: workflowId,
    namePrefix: `${source}-wft`,
    identity,
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
      `AAP username must be a non-empty string, received: ${JSON.stringify(
        username,
      )}`,
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

/** Stable user identity for multi-org mode; legacy username identity otherwise. */
export function toUserEntityName(
  username: string,
  userId: number | undefined,
  identity: CatalogEntityIdentityOptions = {},
): string {
  if (!identity.multiOrgEnabled || userId === undefined) {
    return username;
  }
  const source = identity.source ?? DEFAULT_CATALOG_ENTITY_SOURCE;
  return `${source}-user-${userId}`;
}

export function toUserEntityRef(
  username: string,
  userId?: number,
  identity: CatalogEntityIdentityOptions = {},
): string {
  return `user:default/${toUserEntityName(username, userId, identity)}`;
}

export function toOrgGroupRef(
  namespace: string,
  orgName: string,
  orgId: number,
  source: CatalogEntitySource = DEFAULT_CATALOG_ENTITY_SOURCE,
  identity: CatalogEntityIdentityOptions = {},
): string {
  return `group:${namespace}/${toOrgEntityName(orgName, orgId, {
    ...identity,
    source,
  })}`;
}

export function toTeamGroupRef(
  namespace: string,
  teamName: string,
  teamId: number,
  source: CatalogEntitySource = DEFAULT_CATALOG_ENTITY_SOURCE,
  identity: CatalogEntityIdentityOptions = {},
): string {
  return `group:${namespace}/${toTeamEntityName(teamName, teamId, {
    ...identity,
    source,
  })}`;
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
