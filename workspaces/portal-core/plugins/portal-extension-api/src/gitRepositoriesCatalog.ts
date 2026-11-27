import { createApiRef } from '@backstage/core-plugin-api';

/** Shared cache invalidation contract for Git repository catalog consumers. */
export interface GitRepositoriesCatalogApi {
  invalidateCatalogCache(): void;
}

export const gitRepositoriesCatalogApiRef =
  createApiRef<GitRepositoriesCatalogApi>({
    id: 'plugin.rhaap.git-repositories.catalog',
  });
