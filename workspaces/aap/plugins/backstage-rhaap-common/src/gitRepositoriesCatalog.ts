/*
 * Copyright Red Hat
 *
 * Host/guest contract for Git Repositories catalog cache control.
 * self-service owns gitReposCache; guest plugins (e.g. APME) invalidate
 * after mutations so the catalog table refetches immediately.
 */

import {
  createApiFactory,
  type AnyApiFactory,
} from '@backstage/core-plugin-api';
import {
  gitRepositoriesCatalogApiRef,
  type GitRepositoriesCatalogApi,
} from '@ansible/portal-extension-api';

export { gitRepositoriesCatalogApiRef };
export type { GitRepositoriesCatalogApi };

/** No-op when self-service host is not loaded. */
export class DefaultGitRepositoriesCatalogApi
  implements GitRepositoriesCatalogApi
{
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
