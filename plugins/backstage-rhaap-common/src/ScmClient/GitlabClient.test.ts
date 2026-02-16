import { LoggerService } from '@backstage/backend-plugin-api';
import { GitlabClient } from './GitlabClient';
import type { RepositoryInfo, ScmClientConfig } from './types';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GitlabClient', () => {
  let client: GitlabClient;
  let mockLogger: LoggerService;
  let mockConfig: ScmClientConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as LoggerService;

    mockConfig = {
      scmProvider: 'gitlab',
      host: 'gitlab.com',
      organization: 'test-group',
      token: 'test-token',
    };

    client = new GitlabClient({ config: mockConfig, logger: mockLogger });
  });

  describe('constructor', () => {
    it('should use gitlab.com as default host', () => {
      const config: ScmClientConfig = {
        scmProvider: 'gitlab',
        organization: 'test-group',
        token: 'test-token',
      };
      const glClient = new GitlabClient({ config, logger: mockLogger });
      expect(glClient.getHost()).toBe('gitlab.com');
    });

    it('should use custom host when provided', () => {
      const config: ScmClientConfig = {
        scmProvider: 'gitlab',
        host: 'gitlab.enterprise.com',
        organization: 'test-group',
        token: 'test-token',
      };
      const glClient = new GitlabClient({ config, logger: mockLogger });
      expect(glClient.getHost()).toBe('gitlab.enterprise.com');
    });
  });

  describe('getHost', () => {
    it('should return the configured host', () => {
      expect(client.getHost()).toBe('gitlab.com');
    });
  });

  describe('getOrganization', () => {
    it('should return the configured organization/group', () => {
      expect(client.getOrganization()).toBe('test-group');
    });
  });

  describe('getSourceId', () => {
    it('should return a formatted source ID', () => {
      const sourceId = client.getSourceId();
      expect(sourceId).toBe('gitlab-gitlab-com-test-group');
    });

    it('should handle nested groups in source ID', () => {
      const config: ScmClientConfig = {
        scmProvider: 'gitlab',
        host: 'gitlab.com',
        organization: 'parent/child/subgroup',
        token: 'test-token',
      };
      const glClient = new GitlabClient({ config, logger: mockLogger });
      const sourceId = glClient.getSourceId();
      expect(sourceId).toBe('gitlab-gitlab-com-parent-child-subgroup');
    });
  });

  describe('getRepositories', () => {
    it('should fetch projects from GitLab group', async () => {
      const mockProjects = [
        {
          id: 1,
          name: 'project1',
          path_with_namespace: 'test-group/project1',
          default_branch: 'main',
          web_url: 'https://gitlab.com/test-group/project1',
          description: 'Test project 1',
          archived: false,
          empty_repo: false,
        },
        {
          id: 2,
          name: 'project2',
          path_with_namespace: 'test-group/project2',
          default_branch: 'develop',
          web_url: 'https://gitlab.com/test-group/project2',
          description: null,
          archived: false,
          empty_repo: false,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProjects),
      });

      const repos = await client.getRepositories();

      expect(repos).toHaveLength(2);
      expect(repos[0]).toEqual({
        name: 'project1',
        fullPath: 'test-group/project1',
        defaultBranch: 'main',
        url: 'https://gitlab.com/test-group/project1',
        description: 'Test project 1',
      });
      expect(repos[1]).toEqual({
        name: 'project2',
        fullPath: 'test-group/project2',
        defaultBranch: 'develop',
        url: 'https://gitlab.com/test-group/project2',
        description: undefined,
      });
    });

    it('should skip archived projects', async () => {
      const mockProjects = [
        {
          id: 1,
          name: 'active-project',
          path_with_namespace: 'test-group/active-project',
          default_branch: 'main',
          web_url: 'https://gitlab.com/test-group/active-project',
          description: null,
          archived: false,
          empty_repo: false,
        },
        {
          id: 2,
          name: 'archived-project',
          path_with_namespace: 'test-group/archived-project',
          default_branch: 'main',
          web_url: 'https://gitlab.com/test-group/archived-project',
          description: null,
          archived: true,
          empty_repo: false,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProjects),
      });

      const repos = await client.getRepositories();

      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe('active-project');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Skipping archived project'),
      );
    });

    it('should skip empty repositories', async () => {
      const mockProjects = [
        {
          id: 1,
          name: 'project-with-code',
          path_with_namespace: 'test-group/project-with-code',
          default_branch: 'main',
          web_url: 'https://gitlab.com/test-group/project-with-code',
          description: null,
          archived: false,
          empty_repo: false,
        },
        {
          id: 2,
          name: 'empty-project',
          path_with_namespace: 'test-group/empty-project',
          default_branch: null,
          web_url: 'https://gitlab.com/test-group/empty-project',
          description: null,
          archived: false,
          empty_repo: true,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProjects),
      });

      const repos = await client.getRepositories();

      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe('project-with-code');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Skipping empty project'),
      );
    });

    it('should handle pagination', async () => {
      const mockPage1 = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: i,
          name: `project${i}`,
          path_with_namespace: `test-group/project${i}`,
          default_branch: 'main',
          web_url: `https://gitlab.com/test-group/project${i}`,
          description: null,
          archived: false,
          empty_repo: false,
        }));

      const mockPage2 = [
        {
          id: 100,
          name: 'project100',
          path_with_namespace: 'test-group/project100',
          default_branch: 'main',
          web_url: 'https://gitlab.com/test-group/project100',
          description: null,
          archived: false,
          empty_repo: false,
        },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPage1),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPage2),
        });

      const repos = await client.getRepositories();

      expect(repos).toHaveLength(101);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should use main as default branch when not specified', async () => {
      const mockProjects = [
        {
          id: 1,
          name: 'project1',
          path_with_namespace: 'test-group/project1',
          default_branch: null,
          web_url: 'https://gitlab.com/test-group/project1',
          description: null,
          archived: false,
          empty_repo: false,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProjects),
      });

      const repos = await client.getRepositories();

      expect(repos[0].defaultBranch).toBe('main');
    });

    it('should include subgroups with include_subgroups parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await client.getRepositories();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('include_subgroups=true'),
        expect.any(Object),
      );
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(client.getRepositories()).rejects.toThrow(
        'GitLab API error (401): Unauthorized',
      );
    });

    it('should encode group name in URL', async () => {
      const config: ScmClientConfig = {
        scmProvider: 'gitlab',
        host: 'gitlab.com',
        organization: 'parent/child group',
        token: 'test-token',
      };
      const glClient = new GitlabClient({ config, logger: mockLogger });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await glClient.getRepositories();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('parent/child group')),
        expect.any(Object),
      );
    });
  });

  describe('getBranches', () => {
    const mockRepo: RepositoryInfo = {
      name: 'test-project',
      fullPath: 'test-group/test-project',
      defaultBranch: 'main',
      url: 'https://gitlab.com/test-group/test-project',
    };

    it('should fetch branches using REST API', async () => {
      const mockBranches = [{ name: 'main' }, { name: 'develop' }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBranches),
      });

      const branches = await client.getBranches(mockRepo);

      expect(branches).toEqual(['main', 'develop']);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/repository/branches'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'PRIVATE-TOKEN': 'test-token',
          }),
        }),
      );
    });

    it('should handle pagination for branches', async () => {
      const mockPage1 = Array(100)
        .fill(null)
        .map((_, i) => ({ name: `branch${i}` }));
      const mockPage2 = [{ name: 'branch100' }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPage1),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPage2),
        });

      const branches = await client.getBranches(mockRepo);

      expect(branches).toHaveLength(101);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should encode project path in URL', async () => {
      const repoWithSlash: RepositoryInfo = {
        name: 'sub-project',
        fullPath: 'test-group/subgroup/sub-project',
        defaultBranch: 'main',
        url: 'https://gitlab.com/test-group/subgroup/sub-project',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await client.getBranches(repoWithSlash);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          encodeURIComponent('test-group/subgroup/sub-project'),
        ),
        expect.any(Object),
      );
    });
  });

  describe('getTags', () => {
    const mockRepo: RepositoryInfo = {
      name: 'test-project',
      fullPath: 'test-group/test-project',
      defaultBranch: 'main',
      url: 'https://gitlab.com/test-group/test-project',
    };

    it('should fetch tags using REST API', async () => {
      const mockTags = [{ name: 'v1.0.0' }, { name: 'v1.1.0' }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTags),
      });

      const tags = await client.getTags(mockRepo);

      expect(tags).toEqual(['v1.0.0', 'v1.1.0']);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/repository/tags'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'PRIVATE-TOKEN': 'test-token',
          }),
        }),
      );
    });

    it('should handle pagination for tags', async () => {
      const mockPage1 = Array(100)
        .fill(null)
        .map((_, i) => ({ name: `v${i}.0.0` }));
      const mockPage2 = [{ name: 'v100.0.0' }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPage1),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPage2),
        });

      const tags = await client.getTags(mockRepo);

      expect(tags).toHaveLength(101);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getContents', () => {
    const mockRepo: RepositoryInfo = {
      name: 'test-project',
      fullPath: 'test-group/test-project',
      defaultBranch: 'main',
      url: 'https://gitlab.com/test-group/test-project',
    };

    it('should fetch directory contents from repository tree', async () => {
      const mockTree = [
        { name: 'file1.txt', path: 'file1.txt', type: 'blob' },
        { name: 'src', path: 'src', type: 'tree' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTree),
      });

      const contents = await client.getContents(mockRepo, 'main', '');

      expect(contents).toEqual([
        { name: 'file1.txt', path: 'file1.txt', type: 'file' },
        { name: 'src', path: 'src', type: 'dir' },
      ]);
    });

    it('should fetch contents at a specific path', async () => {
      const mockTree = [
        { name: 'index.ts', path: 'src/index.ts', type: 'blob' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTree),
      });

      const contents = await client.getContents(mockRepo, 'main', 'src');

      expect(contents).toEqual([
        { name: 'index.ts', path: 'src/index.ts', type: 'file' },
      ]);
    });

    it('should handle pagination for large directories', async () => {
      const mockPage1 = Array(100)
        .fill(null)
        .map((_, i) => ({
          name: `file${i}.txt`,
          path: `file${i}.txt`,
          type: 'blob',
        }));
      const mockPage2 = [
        { name: 'file100.txt', path: 'file100.txt', type: 'blob' },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPage1),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPage2),
        });

      const contents = await client.getContents(mockRepo, 'main', '');

      expect(contents).toHaveLength(101);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should log when galaxy files are found', async () => {
      const mockTree = [
        { name: 'galaxy.yml', path: 'galaxy.yml', type: 'blob' },
        { name: 'README.md', path: 'README.md', type: 'blob' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTree),
      });

      await client.getContents(mockRepo, 'main', '');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Found galaxy files'),
      );
    });

    it('should return empty array on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });

      const contents = await client.getContents(
        mockRepo,
        'main',
        'nonexistent',
      );

      expect(contents).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('getFileContent', () => {
    const mockRepo: RepositoryInfo = {
      name: 'test-project',
      fullPath: 'test-group/test-project',
      defaultBranch: 'main',
      url: 'https://gitlab.com/test-group/test-project',
    };

    it('should fetch raw file content', async () => {
      const mockContent = 'console.log("Hello World");';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockContent),
      });

      const content = await client.getFileContent(
        mockRepo,
        'main',
        'src/index.ts',
      );

      expect(content).toBe(mockContent);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/repository/files/'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'PRIVATE-TOKEN': 'test-token',
          }),
        }),
      );
    });

    it('should encode file path in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('content'),
      });

      await client.getFileContent(
        mockRepo,
        'main',
        'src/components/Button.tsx',
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          encodeURIComponent('src/components/Button.tsx'),
        ),
        expect.any(Object),
      );
    });

    it('should throw error when file not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        client.getFileContent(mockRepo, 'main', 'nonexistent.txt'),
      ).rejects.toThrow('Failed to fetch file: 404 Not Found');
    });
  });

  describe('buildUrl', () => {
    const mockRepo: RepositoryInfo = {
      name: 'test-project',
      fullPath: 'test-group/test-project',
      defaultBranch: 'main',
      url: 'https://gitlab.com/test-group/test-project',
    };

    it('should build URL for a file', () => {
      const url = client.buildUrl({
        repo: mockRepo,
        ref: 'main',
        path: 'src/index.ts',
        type: 'file',
      });

      expect(url).toBe(
        'https://gitlab.com/test-group/test-project/-/blob/main/src/index.ts',
      );
    });

    it('should build URL for a directory', () => {
      const url = client.buildUrl({
        repo: mockRepo,
        ref: 'main',
        path: 'src',
        type: 'dir',
      });

      expect(url).toBe(
        'https://gitlab.com/test-group/test-project/-/tree/main/src',
      );
    });

    it('should build URL without path', () => {
      const url = client.buildUrl({
        repo: mockRepo,
        ref: 'main',
        path: '',
        type: 'dir',
      });

      expect(url).toBe(
        'https://gitlab.com/test-group/test-project/-/tree/main',
      );
    });

    it('should use custom host in URL', () => {
      const config: ScmClientConfig = {
        scmProvider: 'gitlab',
        host: 'gitlab.enterprise.com',
        organization: 'test-group',
        token: 'test-token',
      };
      const glClient = new GitlabClient({ config, logger: mockLogger });

      const url = glClient.buildUrl({
        repo: mockRepo,
        ref: 'main',
        path: 'file.txt',
        type: 'file',
      });

      expect(url).toBe(
        'https://gitlab.enterprise.com/test-group/test-project/-/blob/main/file.txt',
      );
    });
  });

  describe('buildSourceLocation', () => {
    const mockRepo: RepositoryInfo = {
      name: 'test-project',
      fullPath: 'test-group/test-project',
      defaultBranch: 'main',
      url: 'https://gitlab.com/test-group/test-project',
    };

    it('should build source location with directory path', () => {
      const location = client.buildSourceLocation(
        mockRepo,
        'main',
        'src/components/Button.tsx',
      );

      expect(location).toBe(
        'url:https://gitlab.com/test-group/test-project/-/tree/main/src/components',
      );
    });

    it('should build source location for root file', () => {
      const location = client.buildSourceLocation(
        mockRepo,
        'main',
        'README.md',
      );

      expect(location).toBe(
        'url:https://gitlab.com/test-group/test-project/-/tree/main',
      );
    });
  });
});
