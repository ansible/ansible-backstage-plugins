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
jest.mock('./actions/helpers/useCaseMaker', () => ({
  UseCaseMaker: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import { UseCaseMaker } from './actions/helpers/useCaseMaker';
import { LoggerService } from '@backstage/backend-plugin-api';
import { AnsibleConfig } from '@ansible/backstage-rhaap-common';

const MockUseCaseMaker = UseCaseMaker as jest.MockedClass<typeof UseCaseMaker>;

describe('createRouter', () => {
  let app: express.Express;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockAnsibleConfig: AnsibleConfig;
  let mockUseCaseMakerInstance: {
    checkIfRepositoryExists: jest.Mock;
    fetchGithubFileContent: jest.Mock;
    fetchGitlabFileContent: jest.Mock;
  };

  beforeEach(async () => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<LoggerService>;

    mockAnsibleConfig = {
      githubIntegration: {
        host: 'github.com',
      },
      gitlabIntegration: {
        host: 'gitlab.com',
      },
    } as AnsibleConfig;

    mockUseCaseMakerInstance = {
      checkIfRepositoryExists: jest.fn(),
      fetchGithubFileContent: jest.fn(),
      fetchGitlabFileContent: jest.fn(),
    };

    MockUseCaseMaker.mockImplementation(() => {
      return mockUseCaseMakerInstance as any;
    });

    const router = await createRouter({
      logger: mockLogger,
      ansibleConfig: mockAnsibleConfig,
    });

    app = express().use(router);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /get_ee_readme', () => {
    it('should return 400 when scm parameter is missing', async () => {
      const response = await request(app).get('/get_ee_readme').query({
        owner: 'test-owner',
        repository: 'test-repo',
        subdir: 'ee',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Missing required query parameters: scm\n',
      });
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should return 400 when owner parameter is missing', async () => {
      const response = await request(app).get('/get_ee_readme').query({
        scm: 'Github',
        repository: 'test-repo',
        subdir: 'ee',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Missing required query parameters: owner\n',
      });
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should return 400 when repository parameter is missing', async () => {
      const response = await request(app).get('/get_ee_readme').query({
        scm: 'Github',
        owner: 'test-owner',
        subdir: 'ee',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Missing required query parameters: repository\n',
      });
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should return 400 when multiple required parameters are missing', async () => {
      const response = await request(app).get('/get_ee_readme').query({
        scm: 'Github',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Missing required query parameters: owner, repository, subdir\n',
      });
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should return 404 when repository does not exist', async () => {
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(false);

      const response = await request(app).get('/get_ee_readme').query({
        scm: 'Github',
        owner: 'test-owner',
        repository: 'test-repo',
        subdir: 'ee',
      });

      expect(response.status).toBe(404);
      expect(response.text).toBe(
        'Unable to fetch EE README because the repository does not exist\n',
      );
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).toHaveBeenCalledWith({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
      });
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should return 400 when SCM type is unsupported', async () => {
      const response = await request(app).get('/get_ee_readme').query({
        scm: 'bitbucket',
        owner: 'test-owner',
        repository: 'test-repo',
        subdir: 'ee',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error:
          "Unsupported SCM type 'bitbucket'. Supported values are: Github, Gitlab",
      });
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should successfully fetch README for GitHub repository', async () => {
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      const mockReadmeContent = '# Test README\n\nThis is a test README.';
      mockUseCaseMakerInstance.fetchGithubFileContent.mockResolvedValue(
        mockReadmeContent,
      );

      const response = await request(app).get('/get_ee_readme').query({
        scm: 'Github',
        owner: 'test-owner',
        repository: 'test-repo',
        subdir: 'ee',
      });

      expect(response.status).toBe(200);
      expect(response.text).toBe(mockReadmeContent);
      expect(response.headers['content-type']).toContain('text/markdown');
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).toHaveBeenCalledWith({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
      });
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        filePath: 'ee/README.md',
        branch: 'main',
      });
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should successfully fetch README for GitHub repository without host parameter', async () => {
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      const mockReadmeContent = '# Test README\n\nThis is a test README.';
      mockUseCaseMakerInstance.fetchGithubFileContent.mockResolvedValue(
        mockReadmeContent,
      );

      const response = await request(app).get('/get_ee_readme').query({
        scm: 'Github',
        owner: 'test-owner',
        repository: 'test-repo',
        subdir: 'ee',
        // host is intentionally omitted for GitHub
      });

      expect(response.status).toBe(200);
      expect(response.text).toBe(mockReadmeContent);
      expect(response.headers['content-type']).toContain('text/markdown');
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).toHaveBeenCalledWith({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
      });
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        filePath: 'ee/README.md',
        branch: 'main',
      });
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should successfully fetch README for GitLab repository', async () => {
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      const mockReadmeContent = '# GitLab README\n\nThis is a GitLab README.';
      mockUseCaseMakerInstance.fetchGitlabFileContent.mockResolvedValue(
        mockReadmeContent,
      );

      const response = await request(app).get('/get_ee_readme').query({
        scm: 'Gitlab',
        host: 'gitlab.example.com',
        owner: 'test-owner',
        repository: 'test-repo',
        subdir: 'ee',
      });

      expect(response.status).toBe(200);
      expect(response.text).toBe(mockReadmeContent);
      expect(response.headers['content-type']).toContain('text/markdown');
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).toHaveBeenCalledWith({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
      });
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        filePath: 'ee/README.md',
        branch: 'main',
      });
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should return 400 when SCM type is case-sensitive (GITHUB)', async () => {
      const response = await request(app).get('/get_ee_readme').query({
        scm: 'GITHUB',
        owner: 'test-owner',
        repository: 'test-repo',
        subdir: 'ee',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error:
          "Unsupported SCM type 'GITHUB'. Supported values are: Github, Gitlab",
      });
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should return 400 when SCM type is case-sensitive (GITLAB)', async () => {
      const response = await request(app).get('/get_ee_readme').query({
        scm: 'GITLAB',
        host: 'gitlab.example.com',
        owner: 'test-owner',
        repository: 'test-repo',
        subdir: 'ee',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error:
          "Unsupported SCM type 'GITLAB'. Supported values are: Github, Gitlab",
      });
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should handle errors when checkIfRepositoryExists throws', async () => {
      const mockError = new Error('Repository check failed');
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockRejectedValue(
        mockError,
      );

      const response = await request(app).get('/get_ee_readme').query({
        scm: 'Github',
        owner: 'test-owner',
        repository: 'test-repo',
        subdir: 'ee',
      });

      expect(response.status).toBe(500);
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).toHaveBeenCalledWith({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
      });
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should handle errors when fetchGithubFileContent throws', async () => {
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(true);
      const mockError = new Error('Failed to fetch README');
      mockUseCaseMakerInstance.fetchGithubFileContent.mockRejectedValue(
        mockError,
      );

      const response = await request(app).get('/get_ee_readme').query({
        scm: 'Github',
        owner: 'test-owner',
        repository: 'test-repo',
        subdir: 'ee',
      });

      expect(response.status).toBe(500);
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).toHaveBeenCalledWith({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
      });
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        filePath: 'ee/README.md',
        branch: 'main',
      });
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should return 400 when subdir parameter is empty', async () => {
      const response = await request(app).get('/get_ee_readme').query({
        scm: 'Github',
        owner: 'test-owner',
        repository: 'test-repo',
        subdir: '',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Missing required query parameters: subdir\n',
      });
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should return 400 when subdir parameter is missing', async () => {
      const response = await request(app).get('/get_ee_readme').query({
        scm: 'Github',
        owner: 'test-owner',
        repository: 'test-repo',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Missing required query parameters: subdir\n',
      });
      expect(
        mockUseCaseMakerInstance.checkIfRepositoryExists,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGithubFileContent,
      ).not.toHaveBeenCalled();
      expect(
        mockUseCaseMakerInstance.fetchGitlabFileContent,
      ).not.toHaveBeenCalled();
    });

    it('should create UseCaseMaker with correct parameters', async () => {
      mockUseCaseMakerInstance.checkIfRepositoryExists.mockResolvedValue(false);

      await request(app).get('/get_ee_readme').query({
        scm: 'Github',
        owner: 'test-owner',
        repository: 'test-repo',
        subdir: 'ee',
      });

      expect(MockUseCaseMaker).toHaveBeenCalledWith({
        ansibleConfig: mockAnsibleConfig,
        logger: mockLogger,
        scmType: 'Github',
        apiClient: null,
        useCases: [],
        organization: null,
        token: null,
      });
    });
  });

  describe('Router setup', () => {
    it('should handle undefined routes', async () => {
      const response = await request(app).get('/nonexistent');

      expect(response.status).toBe(404);
    });
  });
});
