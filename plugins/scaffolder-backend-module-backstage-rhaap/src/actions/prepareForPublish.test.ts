/*
 * Copyright 2025 The Ansible plugin Authors
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

jest.mock('node:crypto', () => ({
  randomBytes: jest.fn(),
}));

jest.mock('@ansible/backstage-rhaap-common', () => ({
  ScmClientFactory: jest.fn(),
}));

import { randomBytes } from 'node:crypto';
import { mockServices } from '@backstage/backend-test-utils';
import { ConfigReader } from '@backstage/config';
import { prepareForPublishAction } from './prepareForPublish';
import { ScmClientFactory } from '@ansible/backstage-rhaap-common';

const mockRandomBytes = randomBytes as jest.MockedFunction<
  (size: number) => Buffer
>;
const MockScmClientFactory = ScmClientFactory as jest.MockedClass<
  typeof ScmClientFactory
>;

describe('prepareForPublish', () => {
  const logger = mockServices.logger.mock();
  const mockWorkspacePath = '/tmp/test-workspace';
  const mockConfig = new ConfigReader({
    integrations: {
      github: [{ host: 'github.com', token: 'test-token' }],
      gitlab: [{ host: 'gitlab.com', token: 'test-token' }],
    },
  });

  let mockScmClient: {
    repositoryExists: jest.Mock;
    getHost: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRandomBytes.mockReturnValue(Buffer.from('abcd', 'hex'));

    mockScmClient = {
      repositoryExists: jest.fn(),
      getHost: jest.fn(),
    };

    MockScmClientFactory.mockImplementation(
      () =>
        ({
          createClient: jest.fn().mockResolvedValue(mockScmClient),
        }) as any,
    );
  });

  describe('repository existence check functionality', () => {
    it('should set createNewRepo to false when repository exists', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(true);
      mockScmClient.getHost.mockReturnValue('github.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Github',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'test-ee',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(mockScmClient.repositoryExists).toHaveBeenCalledWith(
        'test-owner',
        'test-repo',
      );
      expect(ctx.output).toHaveBeenCalledWith('createNewRepo', false);
      expect(logger.info).toHaveBeenCalledWith(
        'Github Repository test-owner/test-repo exists: true',
      );
    });

    it('should set createNewRepo to true when repository does not exist and createNewRepository is true', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(false);
      mockScmClient.getHost.mockReturnValue('github.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Github',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: true,
          eeFileName: 'test-ee',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(ctx.output).toHaveBeenCalledWith('createNewRepo', true);
      expect(logger.info).toHaveBeenCalledWith(
        'A new Github repository test-owner/test-repo will be created.',
      );
    });

    it('should throw error when repository does not exist and createNewRepository is false', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(false);
      mockScmClient.getHost.mockReturnValue('github.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Github',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'test-ee',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow(
        'Github Repository test-owner/test-repo does not exist and creating a new repository was not enabled.',
      );
    });

    it('should work with Gitlab provider', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(true);
      mockScmClient.getHost.mockReturnValue('gitlab.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Gitlab',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'test-ee',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(logger.info).toHaveBeenCalledWith(
        'Gitlab Repository test-owner/test-repo exists: true',
      );
    });
  });

  describe('generateRepositoryUrl functionality', () => {
    it('should generate and output repository URL', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(true);
      mockScmClient.getHost.mockReturnValue('github.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Github',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'test-ee',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(ctx.output).toHaveBeenCalledWith(
        'generatedRepoUrl',
        'github.com?repo=test-repo&owner=test-owner',
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Generated repository URL: github.com?repo=test-repo&owner=test-owner',
      );
    });

    it('should generate normalized repository URL', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(true);
      mockScmClient.getHost.mockReturnValue('github.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Github',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'test-ee',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(ctx.output).toHaveBeenCalledWith(
        'normalizedRepoUrl',
        'github.com/test-owner/test-repo',
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Normalized repository URL: github.com/test-owner/test-repo',
      );
    });
  });

  describe('PR/MR generation functionality', () => {
    it('should generate PR title, description, and branch name when repository exists', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(true);
      mockScmClient.getHost.mockReturnValue('github.com');
      mockRandomBytes.mockReturnValue(Buffer.from('1234', 'hex'));

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Github',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'MyTestEE',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(ctx.output).toHaveBeenCalledWith(
        'generatedTitle',
        '[AAP] Adds/updates files for Execution Environment MyTestEE',
      );
      expect(ctx.output).toHaveBeenCalledWith(
        'generatedDescription',
        'This Pull Request adds Execution Environment files generated from Ansible Portal.',
      );
      expect(ctx.output).toHaveBeenCalledWith(
        'generatedBranchName',
        'mytestee-1234',
      );
    });

    it('should generate MR title and description for Gitlab', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(true);
      mockScmClient.getHost.mockReturnValue('gitlab.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Gitlab',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'TestEE',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(ctx.output).toHaveBeenCalledWith(
        'generatedDescription',
        'This Merge Request adds Execution Environment files generated from Ansible Portal.',
      );
    });

    it('should not generate PR/MR fields when creating new repository', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(false);
      mockScmClient.getHost.mockReturnValue('github.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Github',
          repositoryOwner: 'test-owner',
          repositoryName: 'new-repo',
          createNewRepository: true,
          eeFileName: 'test-ee',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(ctx.output).not.toHaveBeenCalledWith(
        'generatedTitle',
        expect.any(String),
      );
      expect(ctx.output).not.toHaveBeenCalledWith(
        'generatedDescription',
        expect.any(String),
      );
      expect(ctx.output).not.toHaveBeenCalledWith(
        'generatedBranchName',
        expect.any(String),
      );
    });

    it('should lowercase EE file name in branch name', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(true);
      mockScmClient.getHost.mockReturnValue('github.com');
      mockRandomBytes.mockReturnValue(Buffer.from('abcd', 'hex'));

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Github',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'MyCustomEE',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(ctx.output).toHaveBeenCalledWith(
        'generatedBranchName',
        'mycustomee-abcd',
      );
    });
  });

  describe('catalog info URL generation functionality', () => {
    it('should generate catalog info URL for Github', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(true);
      mockScmClient.getHost.mockReturnValue('github.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Github',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'test-ee',
          contextDirName: 'my-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(ctx.output).toHaveBeenCalledWith(
        'generatedCatalogInfoUrl',
        'https://github.com/test-owner/test-repo/blob/main/my-ee/catalog-info.yaml',
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Generated repository contents URL: https://github.com/test-owner/test-repo/blob/main/my-ee/catalog-info.yaml',
      );
    });

    it('should generate catalog info URL for Gitlab', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(true);
      mockScmClient.getHost.mockReturnValue('gitlab.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Gitlab',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'test-ee',
          contextDirName: 'my-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(ctx.output).toHaveBeenCalledWith(
        'generatedCatalogInfoUrl',
        'https://gitlab.com/test-owner/test-repo/-/blob/main/my-ee/catalog-info.yaml',
      );
    });
  });

  describe('full repo URL generation functionality', () => {
    it('should generate full repo URL for Github when creating new repository', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(false);
      mockScmClient.getHost.mockReturnValue('github.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Github',
          repositoryOwner: 'test-owner',
          repositoryName: 'new-repo',
          createNewRepository: true,
          eeFileName: 'test-ee',
          contextDirName: 'my-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(ctx.output).toHaveBeenCalledWith(
        'generatedFullRepoUrl',
        'https://github.com/test-owner/new-repo/blob/main/my-ee/',
      );
    });

    it('should generate full repo URL for Gitlab when creating new repository', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(false);
      mockScmClient.getHost.mockReturnValue('gitlab.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Gitlab',
          repositoryOwner: 'test-owner',
          repositoryName: 'new-repo',
          createNewRepository: true,
          eeFileName: 'test-ee',
          contextDirName: 'my-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(ctx.output).toHaveBeenCalledWith(
        'generatedFullRepoUrl',
        'https://gitlab.com/test-owner/new-repo/-/blob/main/my-ee/',
      );
    });

    it('should not generate full repo URL when repository exists', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(true);
      mockScmClient.getHost.mockReturnValue('github.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Github',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'test-ee',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(ctx.output).not.toHaveBeenCalledWith(
        'generatedFullRepoUrl',
        expect.any(String),
      );
    });
  });

  describe('ScmClientFactory initialization', () => {
    it('should initialize ScmClientFactory with correct parameters', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(true);
      mockScmClient.getHost.mockReturnValue('github.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Github',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'test-ee',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(MockScmClientFactory).toHaveBeenCalledWith({
        rootConfig: mockConfig,
        logger,
      });
    });

    it('should create client with correct scmProvider', async () => {
      mockScmClient.repositoryExists.mockResolvedValue(true);
      mockScmClient.getHost.mockReturnValue('gitlab.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Gitlab',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'test-ee',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const factoryInstance = MockScmClientFactory.mock.results[0].value;
      expect(factoryInstance.createClient).toHaveBeenCalledWith({
        scmProvider: 'gitlab',
        organization: 'test-owner',
      });
    });
  });

  describe('error handling', () => {
    it('should handle repositoryExists errors', async () => {
      const errorMessage = 'Repository check failed';
      mockScmClient.repositoryExists.mockRejectedValue(new Error(errorMessage));
      mockScmClient.getHost.mockReturnValue('github.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Github',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'test-ee',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow(errorMessage);
    });

    it('should handle non-Error exceptions', async () => {
      mockScmClient.repositoryExists.mockRejectedValue('string error');
      mockScmClient.getHost.mockReturnValue('github.com');

      const action = prepareForPublishAction({ rootConfig: mockConfig });
      const ctx = {
        input: {
          sourceControlProvider: 'Github',
          repositoryOwner: 'test-owner',
          repositoryName: 'test-repo',
          createNewRepository: false,
          eeFileName: 'test-ee',
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow('Unknown error');
    });
  });

  describe('action schema and metadata', () => {
    it('should have correct action id', () => {
      const action = prepareForPublishAction({ rootConfig: mockConfig });
      expect(action.id).toBe('ansible:prepare:publish');
    });

    it('should have correct action description', () => {
      const action = prepareForPublishAction({ rootConfig: mockConfig });
      expect(action.description).toBe('Check if a repository exists');
    });
  });
});
