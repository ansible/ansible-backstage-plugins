import {
  DefaultGitRepositoriesExtensionsApi,
  gitRepositoriesExtensionsApiRef,
} from './gitRepositoriesExtensions';
import { gitRepositoriesCatalogApiRef } from './gitRepositoriesCatalog';

it('keeps stable API IDs and an empty default when no guest contributes', () => {
  expect(gitRepositoriesExtensionsApiRef.id).toBe(
    'plugin.rhaap.git-repositories.extensions',
  );
  expect(gitRepositoriesCatalogApiRef.id).toBe(
    'plugin.rhaap.git-repositories.catalog',
  );
  const api = new DefaultGitRepositoriesExtensionsApi();
  expect(api.getPageTabs()).toEqual([]);
  expect(api.getPageHeaderActions()).toEqual([]);
  expect(api.getDetailTabs()).toEqual([]);
  expect(api.getDetailOverviewSlots()).toEqual([]);
  expect(api.getDetailHeaderMenuItems()).toEqual([]);
  expect(api.getDetailOverlays()).toEqual([]);
  expect(api.getCatalogOverlays()).toEqual([]);
  expect(api.getCatalogRowSlots()).toEqual([]);
  expect(api.getCatalogRowMenuItems()).toEqual([]);
  expect(api.getCatalogColumns()).toEqual([]);
  expect(
    api.getCollectionsTabContent({
      entity: {
        apiVersion: 'v1',
        kind: 'Component',
        metadata: { name: 'repo' },
      },
      repoUrl: null,
    }),
  ).toBeNull();
});
