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

// Mock external dependencies first (before imports for proper hoisting)
jest.mock('./helpers', () => ({
  UseCaseMaker: jest.fn(),
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn(),
}));

import { randomBytes } from 'crypto';
import { mockServices } from '@backstage/backend-test-utils';
import { prepareForPublishAction } from './prepareForPublish';
import { UseCaseMaker } from './helpers';
import { AnsibleConfig } from '@ansible/backstage-rhaap-common';

const mockRandomBytes = randomBytes as jest.MockedFunction<
  (size: number) => Buffer
>;
const MockUseCaseMaker = UseCaseMaker as jest.MockedClass<typeof UseCaseMaker>;

describe('prepareForPublish', () => {
  const logger = mockServices.logger.mock();
  const mockWorkspacePath = '/tmp/test-workspace';
  const mockAnsibleConfig: AnsibleConfig = {
    githubIntegration: {
      host: 'github.com',
    },
    gitlabIntegration: {
      host: 'gitlab.com',
    },
  } as AnsibleConfig;

  let mockUseCaseMakerInstance: {
    checkIfRepositoryExists: jest.Mock;
    generateRepositoryUrl: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRandomBytes.mockReturnValue(Buffer.from('abcd', 'hex'));

    mockUseCaseMakerInstance = {
      checkIfRepositoryExists: jest.fn(),
      generateRepositoryUrl: jest.fn(),
    };

    MockUseCaseMaker.mockImplementation(() => {
      return mockUseCaseMakerInstance as any;
    });
  });

  describe('repository existence check functionality', () => {
    it('should set createNewRepo to false when repository exists', async () => {
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'github.com?repo=test-repo&owner=test-owner',
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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

      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).toHaveBeenCalledWith({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
      });
      expect(ctx.output).toHaveBeenCalledWith('createNewRepo', false);
      expect(logger.info).toHaveBeenCalledWith(
        'Github Repository test-owner/test-repo exists: true',
      );
    });

    it('should set createNewRepo to true when repository does not exist and createNewRepository is true', async () => {
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(false);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'github.com?repo=test-repo&owner=test-owner',
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(false);

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'gitlab.com?repo=test-repo&owner=test-owner',
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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
      const mockRepoUrl = 'github.com?repo=test-repo&owner=test-owner';
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        mockRepoUrl,
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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

      expect(
        mockUseCaseMakerInstance.generateRepositoryUrl,
      ).toHaveBeenCalledWith({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
      });
      expect(ctx.output).toHaveBeenCalledWith('generatedRepoUrl', mockRepoUrl);
      expect(logger.info).toHaveBeenCalledWith(
        `Generated repository URL: ${mockRepoUrl}`,
      );
    });

    it('should generate repository URL even when creating new repository', async () => {
      const mockRepoUrl = 'github.com?repo=new-repo&owner=test-owner';
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(false);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        mockRepoUrl,
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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

      expect(mockUseCaseMakerInstance.generateRepositoryUrl).toHaveBeenCalled();
      expect(ctx.output).toHaveBeenCalledWith('generatedRepoUrl', mockRepoUrl);
    });
  });

  describe('PR/MR generation functionality', () => {
    it('should generate PR title, description, and branch name when repository exists', async () => {
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'github.com?repo=test-repo&owner=test-owner',
      );
      mockRandomBytes.mockReturnValue(Buffer.from('1234', 'hex'));

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'gitlab.com?repo=test-repo&owner=test-owner',
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(false);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'github.com?repo=new-repo&owner=test-owner',
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'github.com?repo=test-repo&owner=test-owner',
      );
      mockRandomBytes.mockReturnValue(Buffer.from('abcd', 'hex'));

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'github.com?repo=test-repo&owner=test-owner',
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'gitlab.com?repo=test-repo&owner=test-owner',
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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

    it('should handle repository URL with query parameters', async () => {
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'github.com?repo=test-repo&owner=test-owner&other=param',
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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

      // Should split on '?' and use only the host part
      expect(ctx.output).toHaveBeenCalledWith(
        'generatedCatalogInfoUrl',
        'https://github.com/test-owner/test-repo/blob/main/test-ee/catalog-info.yaml',
      );
    });
  });

  describe('full repo URL generation functionality', () => {
    it('should generate full repo URL for Github when creating new repository', async () => {
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(false);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'github.com?repo=new-repo&owner=test-owner',
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(false);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'gitlab.com?repo=new-repo&owner=test-owner',
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'github.com?repo=test-repo&owner=test-owner',
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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

  describe('UseCaseMaker initialization', () => {
    it('should initialize UseCaseMaker with correct parameters', async () => {
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'github.com?repo=test-repo&owner=test-owner',
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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

      expect(MockUseCaseMaker).toHaveBeenCalledWith({
        ansibleConfig: mockAnsibleConfig,
        logger,
        scmType: 'Github',
        apiClient: null,
        useCases: [],
        organization: null,
        token: null,
      });
    });

    it('should initialize UseCaseMaker with Gitlab scmType', async () => {
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockResolvedValue(
        'gitlab.com?repo=test-repo&owner=test-owner',
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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

      expect(MockUseCaseMaker).toHaveBeenCalledWith({
        ansibleConfig: mockAnsibleConfig,
        logger,
        scmType: 'Gitlab',
        apiClient: null,
        useCases: [],
        organization: null,
        token: null,
      });
    });
  });

  describe('error handling', () => {
    it('should handle checkIfRepositoryExists errors', async () => {
      const errorMessage = 'Repository check failed';
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockRejectedValue(
        new Error(errorMessage),
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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

    it('should handle generateRepositoryUrl errors', async () => {
      const errorMessage = 'URL generation failed';
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      mockUseCaseMakerInstance.generateRepositoryUrl.mockRejectedValue(
        new Error(errorMessage),
      );

      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
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
  });

  describe('action schema and metadata', () => {
    it('should have correct action id', () => {
      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
      expect(action.id).toBe('ansible:prepare:publish');
    });

    it('should have correct action description', () => {
      const action = prepareForPublishAction({
        ansibleConfig: mockAnsibleConfig,
      });
      expect(action.description).toBe('Check if a repository exists');
    });
  });
});
