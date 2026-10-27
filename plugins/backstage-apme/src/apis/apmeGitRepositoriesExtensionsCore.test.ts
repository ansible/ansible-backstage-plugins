/*
 * Copyright Red Hat
 */

import { ConfigReader } from '@backstage/config';
import { createApmeGitRepositoriesExtensionsApi } from './apmeGitRepositoriesExtensionsCore';

const stubComponents = {
  FleetQualityTab: () => null,
  EntityQualityTab: () => null,
  EntityQualityActivityTab: () => null,
  DependenciesTab: () => null,
  ApmeRepositoryOverviewCard: () => null,
  ApmeRepositoryHeaderActions: () => null,
  ApmeDeregisterRepositoryOverlay: () => null,
  ApmeViolationsCell: () => null,
};

describe('createApmeGitRepositoriesExtensionsApi', () => {
  const ApiClass = createApmeGitRepositoriesExtensionsApi(stubComponents);

  it('omits page header actions when addRepositoryButton.enabled is false', () => {
    const config = new ConfigReader({
      ansible: {
        apme: {
          enabled: true,
          baseUrl: 'http://localhost:8080',
          addRepositoryButton: { enabled: false },
        },
      },
    });
    const api = new ApiClass(config);
    expect(api.getPageHeaderActions()).toEqual([]);
  });

  it('includes add-repository header action when addRepositoryButton.enabled is true', () => {
    const config = new ConfigReader({
      ansible: {
        apme: {
          enabled: true,
          baseUrl: 'http://localhost:8080',
          addRepositoryButton: { enabled: true },
        },
      },
    });
    const api = new ApiClass(config);
    const actions = api.getPageHeaderActions();
    expect(actions).toHaveLength(1);
    expect(actions[0]?.id).toBe('add-repository');
  });
});
