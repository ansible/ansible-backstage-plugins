/*
 * Copyright Red Hat
 *
 * Host/guest contract for Git Repositories catalog cache control.
 * self-service owns gitReposCache; guest plugins (e.g. APME) invalidate
 * after mutations so the catalog table refetches immediately.
 */

import {
  createApiFactory,
  createApiRef,
  type AnyApiFactory,
} from '@backstage/core-plugin-api';

export interface GitRepositoriesCatalogApi {
  /** Drop in-memory catalog cache and refetch if subscribers are active. */
  invalidateCatalogCache(): void;
}

export const gitRepositoriesCatalogApiRef =
  createApiRef<GitRepositoriesCatalogApi>({
    id: 'plugin.rhaap.git-repositories.catalog',
  });

/** No-op when self-service host is not loaded. */
export class DefaultGitRepositoriesCatalogApi implements GitRepositoriesCatalogApi {
  invalidateCatalogCache(): void {
    // intentional no-op
  }
}

export const defaultGitRepositoriesCatalogApiFactory: AnyApiFactory =
  createApiFactory({
    api: gitRepositoriesCatalogApiRef,
    deps: {},
    factory: () => new DefaultGitRepositoriesCatalogApi(),
  });
