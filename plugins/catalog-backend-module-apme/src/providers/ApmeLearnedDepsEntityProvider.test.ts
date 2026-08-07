/*
 * Copyright Red Hat
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

import { ConfigReader } from '@backstage/config';
import { Entity } from '@backstage/catalog-model';
import { ApmeLearnedDepsEntityProvider } from './ApmeLearnedDepsEntityProvider';

describe('ApmeLearnedDepsEntityProvider', () => {
  const repoA: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'repo-a',
      annotations: {
        'ansible.io/scm-host': 'github.com',
        'ansible.io/scm-organization': 'acme',
        'ansible.io/scm-repository': 'repo-a',
      },
    },
    spec: { type: 'git-repository', repository_default_branch: 'main' },
  };

  const repoB: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'repo-b',
      annotations: {
        'ansible.io/scm-host': 'github.com',
        'ansible.io/scm-organization': 'acme',
        'ansible.io/scm-repository': 'repo-b',
      },
    },
    spec: { type: 'git-repository', repository_default_branch: 'main' },
  };

  const logger = {
    child: () => logger,
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  function createProvider(apmeService: {
    getProjectByRepoUrl: jest.Mock;
    getProjectDependencies: jest.Mock;
  }) {
    const applyMutation = jest.fn();
    const catalogClient = {
      getEntities: jest
        .fn()
        .mockResolvedValueOnce({ items: [repoA, repoB] })
        .mockResolvedValueOnce({ items: [] }),
    };
    const auth = {
      getOwnServiceCredentials: jest.fn().mockResolvedValue({}),
      getPluginRequestToken: jest.fn().mockResolvedValue({ token: 't' }),
    };
    const provider = new ApmeLearnedDepsEntityProvider({
      apmeService: apmeService as never,
      catalogClient: catalogClient as never,
      auth: auth as never,
      logger: logger as never,
      rootConfig: new ConfigReader({ ansible: { apme: { enabled: true } } }),
    });
    return { provider, applyMutation, catalogClient };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies a full mutation when all project fetches succeed', async () => {
    const apmeService = {
      getProjectByRepoUrl: jest
        .fn()
        .mockResolvedValueOnce({ id: 'p-a' })
        .mockResolvedValueOnce({ id: 'p-b' }),
      getProjectDependencies: jest.fn().mockResolvedValue({
        collections: [
          { fqcn: 'ansible.posix', version: '1.5.4', source: 'learned' },
        ],
      }),
    };
    const { provider, applyMutation } = createProvider(apmeService);
    await provider.connect({ applyMutation } as never);

    await provider.runFullSync();

    expect(applyMutation).toHaveBeenCalledTimes(1);
    expect(applyMutation.mock.calls[0][0].type).toBe('full');
    expect(applyMutation.mock.calls[0][0].entities).toHaveLength(2);
  });

  it('skips repos with no APME project (null) and still mutates', async () => {
    const apmeService = {
      getProjectByRepoUrl: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'p-b' }),
      getProjectDependencies: jest.fn().mockResolvedValue({
        collections: [
          { fqcn: 'ansible.posix', version: '1.5.4', source: 'learned' },
        ],
      }),
    };
    const { provider, applyMutation } = createProvider(apmeService);
    await provider.connect({ applyMutation } as never);

    await provider.runFullSync();

    expect(applyMutation).toHaveBeenCalledTimes(1);
    expect(applyMutation.mock.calls[0][0].entities).toHaveLength(1);
  });

  it('aborts without mutation when project lookup throws', async () => {
    const apmeService = {
      getProjectByRepoUrl: jest
        .fn()
        .mockResolvedValueOnce({ id: 'p-a' })
        .mockRejectedValueOnce(new Error('gateway 503')),
      getProjectDependencies: jest.fn().mockResolvedValue({
        collections: [
          { fqcn: 'ansible.posix', version: '1.5.4', source: 'learned' },
        ],
      }),
    };
    const { provider, applyMutation } = createProvider(apmeService);
    await provider.connect({ applyMutation } as never);

    await provider.runFullSync();

    expect(applyMutation).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Learned deps sync aborted: project lookup failed'),
    );
  });

  it('aborts without mutation when dependencies fetch throws', async () => {
    const apmeService = {
      getProjectByRepoUrl: jest.fn().mockResolvedValue({ id: 'p-a' }),
      getProjectDependencies: jest
        .fn()
        .mockRejectedValueOnce(new Error('deps unavailable')),
    };
    const { provider, applyMutation } = createProvider(apmeService);
    await provider.connect({ applyMutation } as never);

    await provider.runFullSync();

    expect(applyMutation).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Learned deps sync aborted: dependencies failed'),
    );
  });
});
