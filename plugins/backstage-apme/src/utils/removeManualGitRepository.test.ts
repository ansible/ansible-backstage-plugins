/*
 * Copyright Red Hat
 */

import type { Entity } from '@backstage/catalog-model';
import {
  isManuallyRegisteredGitRepository,
  removeManualGitRepository,
} from './removeManualGitRepository';

describe('isManuallyRegisteredGitRepository', () => {
  it('detects manually registered git repositories', () => {
    const manual: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'repo-manual',
        annotations: { 'ansible.io/registration-method': 'manual' },
      },
      spec: { type: 'git-repository' },
    };
    const discovered: Entity = {
      ...manual,
      metadata: {
        name: 'repo-discovered',
        annotations: { 'ansible.io/discovery-source-id': 'github-org' },
      },
    };
    expect(isManuallyRegisteredGitRepository(manual)).toBe(true);
    expect(isManuallyRegisteredGitRepository(discovered)).toBe(false);
  });
});

describe('removeManualGitRepository', () => {
  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'craig-br-ans-tower-devsecops-github-manual',
      uid: 'uid-1',
      annotations: {
        'ansible.io/registration-method': 'manual',
        'backstage.io/source-location':
          'url:https://github.com/craig-br/ans-tower-devsecops',
      },
    },
    spec: {
      type: 'git-repository',
      repository_default_branch: 'master',
    },
  };

  it('deletes APME project then removes catalog entity', async () => {
    const catalogApi = {
      removeEntityByUid: jest.fn().mockResolvedValue(undefined),
    };
    const apmeApi = {
      getProjectByRepoUrl: jest.fn().mockResolvedValue({ id: 'proj-1' }),
      deleteProject: jest.fn().mockResolvedValue(undefined),
    };

    await removeManualGitRepository({
      entity,
      catalogApi: catalogApi as any,
      apmeApi: apmeApi as any,
      apmeEnabled: true,
    });

    expect(apmeApi.getProjectByRepoUrl).toHaveBeenCalled();
    expect(apmeApi.deleteProject).toHaveBeenCalledWith('proj-1');
    expect(catalogApi.removeEntityByUid).toHaveBeenCalledWith('uid-1');
  });

  it('skips APME when disabled', async () => {
    const catalogApi = {
      removeEntityByUid: jest.fn().mockResolvedValue(undefined),
    };
    const apmeApi = {
      getProjectByRepoUrl: jest.fn(),
      deleteProject: jest.fn(),
    };

    await removeManualGitRepository({
      entity,
      catalogApi: catalogApi as any,
      apmeApi: apmeApi as any,
      apmeEnabled: false,
    });

    expect(apmeApi.getProjectByRepoUrl).not.toHaveBeenCalled();
    expect(catalogApi.removeEntityByUid).toHaveBeenCalledWith('uid-1');
  });
});
