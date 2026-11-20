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
import { AsyncLocalStorage } from 'node:async_hooks';

import type { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';

import type { CatalogModuleSlice } from './sliceGuard';

export const CATALOG_PROVIDERS_RHAAP = 'catalog.providers.rhaap';
export const CATALOG_PROVIDERS_AAP = 'catalog.providers.aap';
export const CATALOG_PROVIDERS_CONTENT = 'catalog.providers.content';

const catalogProvidersRootStorage = new AsyncLocalStorage<string>();

export function catalogProvidersConfigRootForSlice(
  slice: CatalogModuleSlice,
): string {
  switch (slice) {
    case 'aap':
      return CATALOG_PROVIDERS_AAP;
    case 'content':
    case 'ee':
      return CATALOG_PROVIDERS_CONTENT;
    case 'all':
    default:
      return CATALOG_PROVIDERS_RHAAP;
  }
}

export function runWithCatalogProvidersConfigRoot<T>(
  providersRoot: string,
  fn: () => T,
): T {
  return catalogProvidersRootStorage.run(providersRoot, fn);
}

export function getCatalogProvidersConfigRoot(): string {
  return catalogProvidersRootStorage.getStore() ?? CATALOG_PROVIDERS_RHAAP;
}

export function envPublishesAapIdentity(env: Config): boolean {
  if (typeof env.has !== 'function' || !env.has('sync.orgsUsersTeams')) {
    return false;
  }
  return !(
    env.has('sync.orgsUsersTeams.enabled') &&
    env.getBoolean('sync.orgsUsersTeams.enabled') === false
  );
}

function identityEnvEntries(root: Config): Array<{ key: string; env: Config }> {
  return root
    .keys()
    .filter(key => envPublishesAapIdentity(root.getConfig(key)))
    .map(key => ({ key, env: root.getConfig(key) }));
}

function configuredOrgNames(env: Config): string[] {
  const raw = env.getOptional('orgs');
  let values: unknown[] = [];
  if (typeof raw === 'string') {
    values = raw.split(',');
  } else if (Array.isArray(raw)) {
    values = raw;
  }
  const names = values
    .filter((name): name is string => typeof name === 'string')
    .map(name => name.trim().toLowerCase())
    .filter(name => name.length > 0);
  const resolved = names.length > 0 ? names : ['default'];
  if (env.getOptionalBoolean('multiOrgEnabled') === true) {
    return resolved;
  }
  return [resolved[0]];
}

function organizationNames(envs: Config[]): string[] {
  const names = new Set<string>();
  for (const env of envs) {
    for (const name of configuredOrgNames(env)) {
      names.add(name);
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function sameOrganizationNames(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((name, index) => name === right[index])
  );
}

function identityPublishingRoot(config: Config): Config | undefined {
  const aap = config.getOptionalConfig(CATALOG_PROVIDERS_AAP);
  const rhaap = config.getOptionalConfig(CATALOG_PROVIDERS_RHAAP);
  if (aap && identityEnvEntries(aap).length > 0) {
    return aap;
  }
  if (rhaap && identityEnvEntries(rhaap).length > 0) {
    return rhaap;
  }
  return aap ?? rhaap;
}

function signInMultiOrgEnabled(config: Config): boolean {
  const aap = config.getOptionalConfig(CATALOG_PROVIDERS_AAP);
  const rhaap = config.getOptionalConfig(CATALOG_PROVIDERS_RHAAP);
  let identityEnvs: Array<{ key: string; env: Config }> = [];
  if (aap && identityEnvEntries(aap).length > 0) {
    identityEnvs = identityEnvEntries(aap);
  } else if (rhaap) {
    identityEnvs = identityEnvEntries(rhaap);
  }
  if (identityEnvs.length > 0) {
    return identityEnvs.some(
      entry => entry.env.getOptionalBoolean('multiOrgEnabled') === true,
    );
  }
  const providers = aap ?? rhaap;
  return (
    providers
      ?.keys()
      .some(
        key =>
          providers.getConfig(key).getOptionalBoolean('multiOrgEnabled') ===
          true,
      ) ?? false
  );
}

/**
 * True when legacy `catalog.providers.rhaap` publishes AAP users.
 * Git-only or job-template-only entries do not.
 */
export function legacyRootPublishesAapIdentity(config: Config): boolean {
  const rhaap = config.getOptionalConfig(CATALOG_PROVIDERS_RHAAP);
  if (!rhaap) {
    return false;
  }
  return identityEnvEntries(rhaap).length > 0;
}

/**
 * Sign-in, provisioning, membership, and catalog sync must share one identity
 * mode. Compare every identity-publishing environment, including different
 * keys. Content-only legacy entries are ignored. A single root is unchanged.
 */
export function assertNoConflictingAapIdentityMode(config: Config): void {
  const aap = config.getOptionalConfig(CATALOG_PROVIDERS_AAP);
  const rhaap = config.getOptionalConfig(CATALOG_PROVIDERS_RHAAP);
  if (!aap || !rhaap) {
    return;
  }
  const aapEnvs = identityEnvEntries(aap);
  const rhaapEnvs = identityEnvEntries(rhaap);
  const signInMode = signInMultiOrgEnabled(config);
  for (const [rootName, entries] of [
    ['aap', aapEnvs],
    ['rhaap', rhaapEnvs],
  ] as const) {
    for (const { key, env } of entries) {
      const envMode = env.getOptionalBoolean('multiOrgEnabled') === true;
      if (envMode !== signInMode) {
        throw new InputError(
          `catalog.providers.${rootName}.${key}.multiOrgEnabled (${envMode}) disagrees with the sign-in identity mode (${signInMode}). Catalog sync, sign-in, provisioning, and membership must use the same identity mode.`,
        );
      }
    }
  }
  if (aapEnvs.length === 0 || rhaapEnvs.length === 0) {
    return;
  }
  const aapOrganizations = organizationNames(aapEnvs.map(entry => entry.env));
  const rhaapOrganizations = organizationNames(
    rhaapEnvs.map(entry => entry.env),
  );
  if (!sameOrganizationNames(aapOrganizations, rhaapOrganizations)) {
    throw new InputError(
      `catalog.providers.aap organizations (${aapOrganizations.join(', ')}) disagree with catalog.providers.rhaap organizations (${rhaapOrganizations.join(', ')}). Provisioning and membership must use the same organization list.`,
    );
  }
}

export function resolveCatalogProvidersConfig(
  config: Config,
  primaryRoot: string,
  options?: { validateIdentity?: boolean },
): Config | undefined {
  if (options?.validateIdentity !== false) {
    assertNoConflictingAapIdentityMode(config);
  }
  const primaryConfig = config.getOptionalConfig(primaryRoot);
  if (primaryConfig) {
    return primaryConfig;
  }
  if (primaryRoot !== CATALOG_PROVIDERS_RHAAP) {
    return config.getOptionalConfig(CATALOG_PROVIDERS_RHAAP);
  }
  return undefined;
}

/**
 * Resolves catalog provider env config for the active module slice.
 * Split modules fall back to legacy `catalog.providers.rhaap` when their key is unset.
 */
export function getResolvedCatalogProvidersConfig(
  config: Config,
  options?: { validateIdentity?: boolean },
): Config | undefined {
  return resolveCatalogProvidersConfig(
    config,
    getCatalogProvidersConfigRoot(),
    options,
  );
}

/**
 * Organization scope for a provider running inside a catalog slice.
 * Outside a slice, identity clients keep the AAP-then-legacy root.
 */
export function getProviderScopedCatalogConfig(
  config: Config,
): Config | undefined {
  const storedRoot = catalogProvidersRootStorage.getStore();
  if (storedRoot) {
    return resolveCatalogProvidersConfig(config, storedRoot);
  }
  return getResolvedAapProvidersConfig(config);
}

/**
 * AAP identity/auth/membership config is not slice-ALS-scoped.
 * Prefer `catalog.providers.aap`, then legacy `catalog.providers.rhaap`.
 */
export function getResolvedAapProvidersConfig(
  config: Config,
): Config | undefined {
  assertNoConflictingAapIdentityMode(config);
  return identityPublishingRoot(config);
}

export function isAapMultiOrgEnabled(config?: Config): boolean {
  if (!config) {
    return false;
  }
  assertNoConflictingAapIdentityMode(config);
  return signInMultiOrgEnabled(config);
}
