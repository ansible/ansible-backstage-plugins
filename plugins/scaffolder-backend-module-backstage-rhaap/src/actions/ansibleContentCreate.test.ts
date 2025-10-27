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

// Mock external dependencies first (before imports for proper hoisting)
jest.mock('@backstage/plugin-scaffolder-node', () => ({
  executeShellCommand: jest.fn(),
}));

jest.mock('./utils/api', () => {
  const MockBackendServiceAPI = jest.fn().mockImplementation(() => ({
    downloadPlaybookProject: jest.fn(),
    downloadCollectionProject: jest.fn(),
    downloadDevfileProject: jest.fn(),
  }));
  (MockBackendServiceAPI as any).pluginLogName =
    'plugin-scaffolder-backend-module-backstage-rhaap';
  return {
    BackendServiceAPI: MockBackendServiceAPI,
  };
});

jest.mock('./helpers', () => ({
  UseCaseMaker: jest.fn(),
}));

jest.mock('os', () => ({
  homedir: jest.fn(),
  platform: jest.fn().mockReturnValue('linux'),
  cpus: jest.fn().mockReturnValue([]),
  tmpdir: jest.fn().mockReturnValue('/tmp'),
  type: jest.fn().mockReturnValue('Linux'),
  release: jest.fn().mockReturnValue('1.0.0'),
  arch: jest.fn().mockReturnValue('x64'),
  EOL: '\n',
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

import * as os from 'os';
import { executeShellCommand } from '@backstage/plugin-scaffolder-node';
import { mockServices } from '@backstage/backend-test-utils';
import { AnsibleConfig } from '@ansible/backstage-rhaap-common';
import {
  ansibleCreatorRun,
  handleDevfileProject,
} from './ansibleContentCreate';
import { BackendServiceAPI } from './utils/api';
import { UseCaseMaker } from './helpers';
import { appType } from './constants';
import * as fs from 'fs/promises';

const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

const mockExecuteShellCommand = executeShellCommand as jest.MockedFunction<
  typeof executeShellCommand
>;
const mockOs = os as jest.Mocked<typeof os>;

describe('ansibleContentCreate', () => {
  const logger = mockServices.logger.mock();
  const mockWorkspacePath = '/tmp/test-workspace';
  const mockCollectionGroup = 'test-group';
  const mockCollectionName = 'test-collection';
  const mockCreatorServiceUrl = 'http://localhost:8000';
  const mockDescription = 'Test description';

  // Mock console.error
  const originalConsoleError = console.error;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/home/user');
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  describe('ansibleCreatorRun', () => {
    let mockBackendServiceAPI: jest.Mocked<BackendServiceAPI>;

    beforeEach(() => {
      mockBackendServiceAPI = {
        downloadPlaybookProject: jest.fn(),
        downloadCollectionProject: jest.fn(),
        downloadDevfileProject: jest.fn(),
      } as any;
      (
        BackendServiceAPI as jest.MockedClass<typeof BackendServiceAPI>
      ).mockImplementation(() => mockBackendServiceAPI);
    });

    it('should successfully run for PLAYBOOK application type', async () => {
      mockExecuteShellCommand.mockResolvedValueOnce(undefined);
      mockBackendServiceAPI.downloadPlaybookProject.mockResolvedValueOnce();

      await ansibleCreatorRun(
        mockWorkspacePath,
        appType.PLAYBOOK,
        logger,
        mockDescription,
        mockCollectionGroup,
        mockCollectionName,
        mockCreatorServiceUrl,
      );

      expect(
        mockBackendServiceAPI.downloadPlaybookProject,
      ).toHaveBeenCalledWith(
        mockWorkspacePath,
        logger,
        mockCreatorServiceUrl,
        mockCollectionGroup,
        mockCollectionName,
        `${mockCollectionGroup}-${appType.PLAYBOOK}.tar`,
      );
      expect(mockExecuteShellCommand).toHaveBeenCalledWith({
        command: 'tar',
        args: ['-xvf', `${mockCollectionGroup}-${appType.PLAYBOOK}.tar`],
        options: {
          cwd: mockWorkspacePath,
        },
      });
      expect(mockExecuteShellCommand).toHaveBeenCalledWith({
        command: 'rm',
        args: [`${mockCollectionGroup}-${appType.PLAYBOOK}.tar`],
        options: {
          cwd: mockWorkspacePath,
        },
        logger,
      });
    });

    it('should successfully run for COLLECTION application type', async () => {
      mockExecuteShellCommand.mockResolvedValueOnce(undefined);
      mockBackendServiceAPI.downloadCollectionProject.mockResolvedValueOnce();

      await ansibleCreatorRun(
        mockWorkspacePath,
        appType.COLLECTION,
        logger,
        mockDescription,
        mockCollectionGroup,
        mockCollectionName,
        mockCreatorServiceUrl,
      );

      expect(
        mockBackendServiceAPI.downloadCollectionProject,
      ).toHaveBeenCalledWith(
        mockWorkspacePath,
        logger,
        mockCreatorServiceUrl,
        mockCollectionGroup,
        mockCollectionName,
        `${mockCollectionGroup}-${appType.COLLECTION}.tar`,
      );
    });

    it('should successfully run for DEVFILE application type', async () => {
      mockExecuteShellCommand.mockResolvedValueOnce(undefined);
      mockBackendServiceAPI.downloadDevfileProject.mockResolvedValueOnce();

      await ansibleCreatorRun(
        mockWorkspacePath,
        appType.DEVFILE,
        logger,
        mockDescription,
        mockCollectionGroup,
        mockCollectionName,
        mockCreatorServiceUrl,
      );

      expect(mockBackendServiceAPI.downloadDevfileProject).toHaveBeenCalledWith(
        mockWorkspacePath,
        logger,
        mockCreatorServiceUrl,
        'devfile.tar',
      );
      expect(mockExecuteShellCommand).toHaveBeenCalledWith({
        command: 'tar',
        args: ['-xvf', 'devfile.tar'],
        options: {
          cwd: mockWorkspacePath,
        },
      });
    });

    it('should use default workspace path when not provided', async () => {
      mockExecuteShellCommand.mockResolvedValueOnce(undefined);
      mockBackendServiceAPI.downloadPlaybookProject.mockResolvedValueOnce();

      await ansibleCreatorRun(
        '',
        appType.PLAYBOOK,
        logger,
        mockDescription,
        mockCollectionGroup,
        mockCollectionName,
        mockCreatorServiceUrl,
      );

      expect(
        mockBackendServiceAPI.downloadPlaybookProject,
      ).toHaveBeenCalledWith(
        '/home/user/.ansible/collections/ansible_collections',
        logger,
        mockCreatorServiceUrl,
        mockCollectionGroup,
        mockCollectionName,
        `${mockCollectionGroup}-${appType.PLAYBOOK}.tar`,
      );
    });

    it('should handle download errors gracefully', async () => {
      const downloadError = new Error('Download failed');
      mockBackendServiceAPI.downloadPlaybookProject.mockRejectedValueOnce(
        downloadError,
      );

      await ansibleCreatorRun(
        mockWorkspacePath,
        appType.PLAYBOOK,
        logger,
        mockDescription,
        mockCollectionGroup,
        mockCollectionName,
        mockCreatorServiceUrl,
      );

      expect(logger.error).toHaveBeenCalledWith(
        '[plugin-scaffolder-backend-module-backstage-rhaap] Error occurred while downloading the project tar at:',
        downloadError,
      );
    });

    it('should throw error when tar extraction fails', async () => {
      const tarError = new Error('Tar extraction failed');
      mockBackendServiceAPI.downloadPlaybookProject.mockResolvedValueOnce();
      mockExecuteShellCommand.mockRejectedValueOnce(tarError);

      await expect(
        ansibleCreatorRun(
          mockWorkspacePath,
          appType.PLAYBOOK,
          logger,
          mockDescription,
          mockCollectionGroup,
          mockCollectionName,
          mockCreatorServiceUrl,
        ),
      ).rejects.toThrow('Tar extraction failed');

      expect(logger.error).toHaveBeenCalledWith(
        '[plugin-scaffolder-backend-module-backstage-rhaap] Error while un-tar',
        tarError,
      );
    });

    it('should throw error when tar cleanup fails', async () => {
      const cleanupError = new Error('Cleanup failed');
      mockBackendServiceAPI.downloadPlaybookProject.mockResolvedValueOnce();
      mockExecuteShellCommand
        .mockResolvedValueOnce(undefined) // tar extraction success
        .mockRejectedValueOnce(cleanupError); // cleanup failure

      await expect(
        ansibleCreatorRun(
          mockWorkspacePath,
          appType.PLAYBOOK,
          logger,
          mockDescription,
          mockCollectionGroup,
          mockCollectionName,
          mockCreatorServiceUrl,
        ),
      ).rejects.toThrow('Cleanup failed');

      expect(logger.error).toHaveBeenCalledWith(
        '[plugin-scaffolder-backend-module-backstage-rhaap] Error while deleting tarball: ',
        cleanupError,
      );
    });
  });

  describe('handleDevfileProject', () => {
    const mockAnsibleConfig: AnsibleConfig = {
      rhaap: {
        baseUrl: 'https://test.ansible.com/',
        checkSSL: true,
        showCaseLocation: {
          type: 'url',
          target: 'https://showcase.example.com',
          gitBranch: 'main',
          gitUser: 'testUser',
          gitEmail: 'test@example.com',
        },
      },
      githubIntegration: {
        host: 'github.com',
        apiBaseUrl: 'https://api.github.com',
        rawBaseUrl: 'https://raw.githubusercontent.com',
        token: 'dummy-token',
        apps: [],
      },
      gitlabIntegration: {
        host: 'gitlab.com',
        apiBaseUrl: 'https://api.gitlab.com',
        baseUrl: 'https://raw.gitlabusercontent.com',
        token: 'dummy-token',
      },
    };

    const mockSourceControl = 'github.com';
    const mockRepositoryUrl = 'https://github.com/test/repo';

    let mockUseCaseMaker: jest.Mocked<UseCaseMaker>;

    beforeEach(() => {
      mockUseCaseMaker = {
        devfilePushToGithub: jest.fn(),
        devfilePushToGitLab: jest.fn(),
      } as any;
      (
        UseCaseMaker as jest.MockedClass<typeof UseCaseMaker>
      ).mockImplementation(() => mockUseCaseMaker);
    });

    it('should handle GitHub devfile project successfully', async () => {
      const mockDevfileContent = 'devfile content';
      const mockPrLink = 'https://github.com/test/repo/pull/1';

      mockReadFile.mockResolvedValueOnce(mockDevfileContent);
      mockUseCaseMaker.devfilePushToGithub.mockResolvedValueOnce(mockPrLink);

      const result = await handleDevfileProject(
        mockAnsibleConfig,
        logger,
        mockSourceControl,
        mockRepositoryUrl,
        mockWorkspacePath,
      );

      expect(mockReadFile).toHaveBeenCalledWith(
        `${mockWorkspacePath}/devfile.yaml`,
        'utf8',
      );
      expect(UseCaseMaker).toHaveBeenCalledWith({
        ansibleConfig: mockAnsibleConfig,
        logger,
        scmType: 'Github',
        apiClient: null,
        useCases: [],
        organization: null,
        token: null,
      });
      expect(mockUseCaseMaker.devfilePushToGithub).toHaveBeenCalledWith({
        value: mockDevfileContent,
        repositoryUrl: mockRepositoryUrl,
      });
      expect(result).toBe(mockPrLink);
    });

    it('should handle GitLab devfile project successfully', async () => {
      const mockDevfileContent = 'devfile content';
      const mockPrLink = 'https://gitlab.com/test/repo/-/merge_requests/1';

      mockReadFile.mockResolvedValueOnce(mockDevfileContent);
      mockUseCaseMaker.devfilePushToGitLab.mockResolvedValueOnce(mockPrLink);

      const result = await handleDevfileProject(
        mockAnsibleConfig,
        logger,
        'gitlab.com',
        mockRepositoryUrl,
        mockWorkspacePath,
      );

      expect(UseCaseMaker).toHaveBeenCalledWith({
        ansibleConfig: mockAnsibleConfig,
        logger,
        scmType: 'Gitlab',
        apiClient: null,
        useCases: [],
        organization: null,
        token: null,
      });
      expect(mockUseCaseMaker.devfilePushToGitLab).toHaveBeenCalledWith({
        value: mockDevfileContent,
        repositoryUrl: mockRepositoryUrl,
      });
      expect(result).toBe(mockPrLink);
    });

    it('should handle unknown source control provider', async () => {
      const mockDevfileContent = 'devfile content';

      mockReadFile.mockResolvedValueOnce(mockDevfileContent);

      const result = await handleDevfileProject(
        mockAnsibleConfig,
        logger,
        'bitbucket.com',
        mockRepositoryUrl,
        mockWorkspacePath,
      );

      expect(UseCaseMaker).toHaveBeenCalledWith({
        ansibleConfig: mockAnsibleConfig,
        logger,
        scmType: 'Bitbucket',
        apiClient: null,
        useCases: [],
        organization: null,
        token: null,
      });
      expect(mockUseCaseMaker.devfilePushToGithub).not.toHaveBeenCalled();
      expect(mockUseCaseMaker.devfilePushToGitLab).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should throw error when file reading fails', async () => {
      const fileError = new Error('File not found');
      mockReadFile.mockRejectedValueOnce(fileError);

      await expect(
        handleDevfileProject(
          mockAnsibleConfig,
          logger,
          mockSourceControl,
          mockRepositoryUrl,
          mockWorkspacePath,
        ),
      ).rejects.toThrow('File not found');

      expect(console.error).toHaveBeenCalledWith(
        'Error reading the file or pushing to GitHub:',
        fileError,
      );
    });

    it('should throw error when GitHub push fails', async () => {
      const mockDevfileContent = 'devfile content';
      const pushError = new Error('GitHub push failed');

      mockReadFile.mockResolvedValueOnce(mockDevfileContent);
      mockUseCaseMaker.devfilePushToGithub.mockRejectedValueOnce(pushError);

      await expect(
        handleDevfileProject(
          mockAnsibleConfig,
          logger,
          mockSourceControl,
          mockRepositoryUrl,
          mockWorkspacePath,
        ),
      ).rejects.toThrow('GitHub push failed');
    });

    it('should throw error when GitLab push fails', async () => {
      const mockDevfileContent = 'devfile content';
      const pushError = new Error('GitLab push failed');

      mockReadFile.mockResolvedValueOnce(mockDevfileContent);
      mockUseCaseMaker.devfilePushToGitLab.mockRejectedValueOnce(pushError);

      await expect(
        handleDevfileProject(
          mockAnsibleConfig,
          logger,
          'gitlab.com',
          mockRepositoryUrl,
          mockWorkspacePath,
        ),
      ).rejects.toThrow('GitLab push failed');
    });
  });
});
