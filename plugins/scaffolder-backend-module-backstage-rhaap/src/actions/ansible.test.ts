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

import { getVoidLogger } from '@backstage/backend-common';
import { createAnsibleContentAction } from './ansible';
import { ansibleCreatorRun } from './ansibleContentCreate';
import {
    getDevspacesUrlFromAnsibleConfig,
    generateRepoUrl,
    getServiceUrlFromAnsibleConfig,
  } from './utils/config';
import { ConfigReader } from '@backstage/config';
import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { AnsibleApiClient } from './utils/api';
import { MockAuthService } from './MockAuthService';

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

    const logger = getVoidLogger();

    const auth = new MockAuthService({
      pluginId: 'test',
      disableDefaultAuthPolicy: false,
    });

    const action = createAnsibleContentAction(config, logger, auth);

    const mockContext = createMockActionContext({
      input: {
        sourceControl: 'github.com',
        repoOwner: 'testOwner',
        repoName: 'testRepo',
        description: 'test description',
        collectionGroup: 'dummyGroup',
        collectionName: 'dummyName',
        applicationType: 'collection-project',
       },
    });

    const isValidSubscriptionMock = jest
      .spyOn(AnsibleApiClient.prototype, 'isValidSubscription')
      .mockImplementation(async () => {
        return {status: 200, isValid: true, isCompliant: false}
    });


    beforeEach(() => {
      jest.clearAllMocks();
    });


    it('should call output with the devSpaces.baseUrl and the repoUrl', async () => {
      await action.handler(mockContext);

      expect(isValidSubscriptionMock).toHaveBeenCalledTimes(1);
      expect(mockContext.output).toHaveBeenCalledWith(
        'devSpacesBaseUrl',
        getDevspacesUrlFromAnsibleConfig(config, 'github.com', 'testOwner', 'testRepo'),
      );
      expect(mockContext.output).toHaveBeenCalledWith(
        'repoUrl',
        generateRepoUrl('github.com', 'testOwner', 'testRepo'),
      );
    });

    it('match ansibleCreatorRun call with the correct parameters', async () => {
      await action.handler(mockContext);

      expect(isValidSubscriptionMock).toHaveBeenCalledTimes(1);
      expect(ansibleCreatorRun).toHaveBeenCalledWith(
        mockContext.workspacePath,
        'collection-project',
        logger,
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
  });
