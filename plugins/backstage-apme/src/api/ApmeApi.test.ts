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

import { ApmeApiClient } from './ApmeApi';

describe('ApmeApiClient', () => {
  const mockDiscoveryApi = {
    getBaseUrl: jest
      .fn()
      .mockResolvedValue('http://localhost:7007/api/catalog'),
  };

  const mockFetchApi = {
    fetch: jest.fn(),
  };

  let client: ApmeApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new ApmeApiClient({
      discoveryApi: mockDiscoveryApi,
      fetchApi: mockFetchApi,
    });
  });

  describe('getHealth', () => {
    it('should fetch health status', async () => {
      const mockHealth = {
        status: 'ok',
        database: 'ok',
        components: [
          { name: 'Primary', status: 'ok', address: '127.0.0.1:50051' },
        ],
      };

      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHealth),
      });

      const result = await client.getHealth();

      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/apme/health',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(result).toEqual(mockHealth);
    });
  });

  describe('getProjects', () => {
    it('should fetch projects list', async () => {
      const mockProjects = {
        items: [
          { id: '1', name: 'Project 1', repo_url: 'https://github.com/test/1' },
          { id: '2', name: 'Project 2', repo_url: 'https://github.com/test/2' },
        ],
      };

      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProjects),
      });

      const result = await client.getProjects();

      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/apme/projects',
        expect.any(Object),
      );
      expect(result).toEqual(mockProjects.items);
    });

    it('should return empty array when no projects', async () => {
      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: null }),
      });

      const result = await client.getProjects();
      expect(result).toEqual([]);
    });
  });

  describe('getProjectByRepoUrl', () => {
    it('should find project by repo URL with branch', async () => {
      const mockProject = {
        id: 'proj-backup',
        name: 'terrible-playbook-backup',
        repo_url: 'https://github.com/test/1',
        branch: 'backup',
      };

      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProject),
      });

      const result = await client.getProjectByRepoUrl(
        'https://github.com/test/1',
        'backup',
      );

      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining('lookup?repo_url='),
        expect.any(Object),
      );
      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining('&branch=backup'),
        expect.any(Object),
      );
      expect(result).toEqual(mockProject);
    });

    it('should find project by repo URL', async () => {
      const mockProject = {
        id: '1',
        name: 'Project 1',
        repo_url: 'https://github.com/test/1',
      };

      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProject),
      });

      const result = await client.getProjectByRepoUrl(
        'https://github.com/test/1',
      );

      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining('lookup?repo_url='),
        expect.any(Object),
      );
      expect(result).toEqual(mockProject);
    });

    it('should return null when project not found', async () => {
      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      });

      const result = await client.getProjectByRepoUrl(
        'https://github.com/nonexistent',
      );
      expect(result).toBeNull();
    });
  });

  describe('triggerScan', () => {
    it('should trigger a scan operation', async () => {
      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ operation_id: 'op-123' }),
      });

      const result = await client.triggerScan('project-1');

      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/apme/projects/project-1/operation',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'check', options: {} }),
        }),
      );
      expect(result).toEqual({
        scanId: 'op-123',
        projectId: 'project-1',
        status: 'running',
      });
    });

    it('should handle 409 conflict when scan in progress', async () => {
      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: () => Promise.resolve('Conflict'),
      });

      await expect(client.triggerScan('project-1')).rejects.toThrow(
        'A scan is already in progress',
      );
    });
  });

  describe('createProject', () => {
    it('should create a new project', async () => {
      const newProject = {
        id: 'new-1',
        name: 'New Project',
        repo_url: 'https://github.com/test/new',
        branch: 'main',
      };

      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(newProject),
      });

      const result = await client.createProject({
        name: 'New Project',
        repo_url: 'https://github.com/test/new',
        branch: 'main',
      });

      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/apme/projects',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(result).toEqual(newProject);
    });
  });

  describe('getViolations', () => {
    it('should fetch violations for a project', async () => {
      const mockViolations = [
        { id: 1, rule_id: 'L001', message: 'Test violation', level: 'medium' },
      ];

      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockViolations),
      });

      const result = await client.getViolations('project-1');

      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/apme/projects/project-1/violations',
        expect.any(Object),
      );
      expect(result).toEqual(mockViolations);
    });
  });
});
