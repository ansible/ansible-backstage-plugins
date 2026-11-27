import { createApiFactory } from '@backstage/core-plugin-api';
import { gitRepositoriesCatalogApiRef } from '@ansible/portal-extension-api';
import { gitReposCache } from './gitReposCache';

/** Implements the shared cache invalidation contract for Git repository consumers. */
export const gitRepositoriesCatalogApiFactory = createApiFactory({
  api: gitRepositoriesCatalogApiRef,
  deps: {},
  factory: () => ({
    invalidateCatalogCache: () => gitReposCache.invalidateFetchedData(),
  }),
});
