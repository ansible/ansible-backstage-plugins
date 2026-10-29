/*
 * Copyright 2024 The Ansible plugin Authors
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

jest.mock('./ansibleContentCreate', () => {
  return {
    ...jest.requireActual('./ansibleContentCreate'),
    ansibleCreatorRun: jest.fn().mockResolvedValue(1),
  };
});

import { createAnsibleContentAction } from './ansible';
import { ansibleCreatorRun } from './ansibleContentCreate';
import {
  getDevspacesUrlFromAnsibleConfig,
  generateRepoUrl,
  getServiceUrlFromAnsibleConfig,
} from './utils/config';
import { ConfigReader } from '@backstage/config';
import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { appType } from './constants';

describe('ansible:content:create', () => {
  const config = new ConfigReader({
    ansible: {
      devSpaces: {
        baseUrl: 'https://test.apps.test-rhdh.testing.ansible.com/',
      },
      creatorService: {
        baseUrl: 'localhost',
        port: '8000',
      },
    },
  });

  const action = createAnsibleContentAction(config);

  const mockContext = createMockActionContext({
    input: {
      sourceControl: 'github.com',
      repoOwner: 'testOwner',
      repoName: 'testRepo',
      description: 'test description',
      collectionGroup: 'dummyGroup',
      collectionName: 'dummyName',
      applicationType: appType.COLLECTION,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call output with the devSpaces.baseUrl and the repoUrl and check', async () => {
    // @ts-ignore
    await action.handler(mockContext);

    expect(mockContext.output).toHaveBeenCalledWith(
      'devSpacesBaseUrl',
      getDevspacesUrlFromAnsibleConfig(
        config,
        'github.com',
        'testOwner',
        'testRepo',
      ),
    );
    expect(mockContext.output).toHaveBeenCalledWith(
      'repoUrl',
      generateRepoUrl('github.com', 'testOwner', 'testRepo'),
    );
  });

  it('match ansibleCreatorRun call with the correct parameters', async () => {
    // @ts-ignore
    await action.handler(mockContext);

    expect(ansibleCreatorRun).toHaveBeenCalledWith(
      mockContext.workspacePath,
      'collection-project',
      mockContext.logger,
      'test description',
      'dummyGroup',
      'dummyName',
      getServiceUrlFromAnsibleConfig(config),
    );
    expect(ansibleCreatorRun).toHaveBeenCalledTimes(1);
    expect(mockContext.output).toHaveBeenCalledWith(
      'repoUrl',
      generateRepoUrl('github.com', 'testOwner', 'testRepo'),
    );
  });

  it('uses empty string defaults when optional input fields are omitted', async () => {
    const ctxMinimal = createMockActionContext({
      input: {},
    });
    // @ts-ignore
    await action.handler(ctxMinimal);

    expect(ansibleCreatorRun).toHaveBeenCalledWith(
      ctxMinimal.workspacePath,
      '',
      ctxMinimal.logger,
      '',
      '',
      '',
      getServiceUrlFromAnsibleConfig(config),
    );
    expect(ctxMinimal.output).toHaveBeenCalledWith(
      'repoUrl',
      generateRepoUrl('', '', ''),
    );
  });

  it('treats null applicationType as empty string', async () => {
    const ctxNullType = createMockActionContext({
      input: {
        applicationType: null as any,
      },
    });
    // @ts-ignore
    await action.handler(ctxNullType);

    expect(ansibleCreatorRun).toHaveBeenCalledWith(
      ctxNullType.workspacePath,
      '',
      ctxNullType.logger,
      '',
      '',
      '',
      getServiceUrlFromAnsibleConfig(config),
    );
  });

  it('logs and rethrows when ansibleCreatorRun fails', async () => {
    const err = new Error('creator failed');
    (ansibleCreatorRun as jest.Mock).mockRejectedValueOnce(err);
    const errorSpy = jest
      .spyOn(mockContext.logger, 'error')
      .mockImplementation(() => {});

    await expect(
      // @ts-ignore — mock context matches handler contract
      action.handler(mockContext),
    ).rejects.toThrow('creator failed');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error occured:'),
    );
    errorSpy.mockRestore();
  });
});
