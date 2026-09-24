/*
 * Copyright Red Hat
 */

import { Entity } from '@backstage/catalog-model';
import { DefaultGitRepositoriesExtensionsApi } from './gitRepositoriesExtensions';

describe('DefaultGitRepositoriesExtensionsApi', () => {
  const api = new DefaultGitRepositoriesExtensionsApi();
  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'repo' },
  };

  it('returns empty collections for every slot', () => {
    expect(api.getPageTabs()).toEqual([]);
    expect(api.getPageHeaderActions()).toEqual([]);
    expect(api.getDetailTabs()).toEqual([]);
    expect(api.getDetailOverviewSlots()).toEqual([]);
    expect(api.getDetailHeaderMenuItems()).toEqual([]);
    expect(api.getDetailOverlays()).toEqual([]);
    expect(api.getCatalogRowSlots()).toEqual([]);
    expect(api.getCatalogRowMenuItems()).toEqual([]);
    expect(api.getCatalogColumns()).toEqual([]);
    expect(api.getCollectionsTabContent({ entity, repoUrl: null })).toBeNull();
  });
});
