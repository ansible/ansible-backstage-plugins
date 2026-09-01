import { createApiFactory } from '@backstage/core-plugin-api';
import { gitRepositoriesCatalogApiRef } from '@ansible/backstage-rhaap-common/gitRepositoriesCatalog';
import { gitReposCache } from '../components/GitRepositories/gitReposCache';

export const gitRepositoriesCatalogApiFactory = createApiFactory({
  api: gitRepositoriesCatalogApiRef,
  deps: {},
  factory: () => ({
    invalidateCatalogCache: () => {
      gitReposCache.invalidateFetchedData();
    },
  }),
});
