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

import * as fs from 'fs';
import * as path from 'path';
import { mockServices } from '@backstage/backend-test-utils';
import { createAnsibleContentAction } from './ansible';
import {
  ansibleCreatorRun,
  handleDevfileProject,
} from './ansibleContentCreate';
import {
  getDevspacesUrlFromAnsibleConfig,
  generateRepoUrl,
  getServiceUrlFromAnsibleConfig,
} from './utils/config';
import { ConfigReader } from '@backstage/config';
import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { AnsibleConfig } from '@ansible/backstage-rhaap-common';
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

  const logger = mockServices.logger.mock();

  const ansibleConfig: AnsibleConfig = {
    rhaap: {
      baseUrl: 'https://test.ansible.com/',
      checkSSL: true,
      showCaseLocation: {
        type: 'url',
        target: 'https://showcase.example.com',
        gitBranch: 'main',
        gitUser: 'dummyUser',
        gitEmail: 'dummyuser@example.com',
      },
    },
    githubIntegration: {
      host: 'github.com',
      apiBaseUrl: 'https://api.github.com',
      rawBaseUrl: 'https://raw.githubusercontent.com',
      token: 'dummy-personal-access-token',
      apps: [],
    },
    gitlabIntegration: {
      host: 'gitlab.com',
      apiBaseUrl: 'https://api.gitlab.com',
      baseUrl: 'https://raw.gitlabusercontent.com',
      token: 'dummy-personal-access-token',
    },
  };

  const action = createAnsibleContentAction(config, ansibleConfig);

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

  it('should run tests for devfileHandler with invalid repo URL', async () => {
    // @ts-ignore
    await action.handler(mockContext);
    const devfilePath = path.join(mockContext.workspacePath, 'devfile.yaml');
    if (!fs.existsSync(mockContext.workspacePath)) {
      fs.mkdirSync(mockContext.workspacePath, { recursive: true });
    }
    fs.writeFileSync(
      devfilePath,
      'schemaVersion: 2.1.0\nmetadata:\n  name: test-devfile',
      'utf8',
    );
    await expect(
      handleDevfileProject(
        ansibleConfig,
        logger,
        'gitlab.com',
        'https://gitlab.com/inValidUrl',
        mockContext.workspacePath,
      ),
    ).rejects.toThrow('Invalid repository URL');
    // For github
    await expect(
      handleDevfileProject(
        ansibleConfig,
        logger,
        'github.com',
        'https://github.com/inValidUrl',
        mockContext.workspacePath,
      ),
    ).rejects.toThrow('Invalid repository URL');
  });
});
