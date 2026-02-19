import { LoggerService } from '@backstage/backend-plugin-api';
import { GithubClient } from './GithubClient';
import type { RepositoryInfo, ScmClientConfig } from './types';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GithubClient', () => {
  let client: GithubClient;
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
      scmProvider: 'github',
      host: 'github.com',
      organization: 'test-org',
      token: 'test-token',
    };

    client = new GithubClient({ config: mockConfig, logger: mockLogger });
  });

  describe('constructor', () => {
    it('should use api.github.com for github.com host', () => {
      const config: ScmClientConfig = {
        scmProvider: 'github',
        host: 'github.com',
        organization: 'test-org',
        token: 'test-token',
      };
      const ghClient = new GithubClient({ config, logger: mockLogger });
      expect(ghClient.getHost()).toBe('github.com');
    });

    it('should use enterprise API URL for custom host', () => {
      const config: ScmClientConfig = {
        scmProvider: 'github',
        host: 'github.enterprise.com',
        organization: 'test-org',
        token: 'test-token',
      };
      const ghClient = new GithubClient({ config, logger: mockLogger });
      expect(ghClient.getHost()).toBe('github.enterprise.com');
    });

    it('should use default host when not provided', () => {
      const config: ScmClientConfig = {
        scmProvider: 'github',
        organization: 'test-org',
        token: 'test-token',
      };
      const ghClient = new GithubClient({ config, logger: mockLogger });
      expect(ghClient.getHost()).toBe('github.com');
    });
  });

  describe('getHost', () => {
    it('should return the configured host', () => {
      expect(client.getHost()).toBe('github.com');
    });
  });

  describe('getOrganization', () => {
    it('should return the configured organization', () => {
      expect(client.getOrganization()).toBe('test-org');
    });
  });

  describe('getSourceId', () => {
    it('should return a formatted source ID', () => {
      const sourceId = client.getSourceId();
      expect(sourceId).toBe('github-github-com-test-org');
    });

    it('should sanitize special characters in source ID', () => {
      const config: ScmClientConfig = {
        scmProvider: 'github',
        host: 'github.enterprise.com',
        organization: 'Test_Org.Name',
        token: 'test-token',
      };
      const ghClient = new GithubClient({ config, logger: mockLogger });
      const sourceId = ghClient.getSourceId();
      expect(sourceId).toBe('github-github-enterprise-com-test-org-name');
    });
  });

  describe('getRepositories', () => {
    it('should fetch repositories using GraphQL and return repository info', async () => {
      const mockResponse = {
        data: {
          organization: {
            repositories: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  name: 'repo1',
                  nameWithOwner: 'test-org/repo1',
                  defaultBranchRef: { name: 'main' },
                  url: 'https://github.com/test-org/repo1',
                  description: 'Test repo 1',
                  isArchived: false,
                  isEmpty: false,
                },
                {
                  name: 'repo2',
                  nameWithOwner: 'test-org/repo2',
                  defaultBranchRef: { name: 'develop' },
                  url: 'https://github.com/test-org/repo2',
                  description: null,
                  isArchived: false,
                  isEmpty: false,
                },
              ],
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const repos = await client.getRepositories();

      expect(repos).toHaveLength(2);
      expect(repos[0]).toEqual({
        name: 'repo1',
        fullPath: 'test-org/repo1',
        defaultBranch: 'main',
        url: 'https://github.com/test-org/repo1',
        description: 'Test repo 1',
      });
      expect(repos[1]).toEqual({
        name: 'repo2',
        fullPath: 'test-org/repo2',
        defaultBranch: 'develop',
        url: 'https://github.com/test-org/repo2',
        description: undefined,
      });
    });

    it('should skip archived repositories', async () => {
      const mockResponse = {
        data: {
          organization: {
            repositories: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  name: 'active-repo',
                  nameWithOwner: 'test-org/active-repo',
                  defaultBranchRef: { name: 'main' },
                  url: 'https://github.com/test-org/active-repo',
                  description: 'Active repo',
                  isArchived: false,
                  isEmpty: false,
                },
                {
                  name: 'archived-repo',
                  nameWithOwner: 'test-org/archived-repo',
                  defaultBranchRef: { name: 'main' },
                  url: 'https://github.com/test-org/archived-repo',
                  description: 'Archived repo',
                  isArchived: true,
                  isEmpty: false,
                },
              ],
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const repos = await client.getRepositories();

      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe('active-repo');
    });

    it('should skip empty repositories', async () => {
      const mockResponse = {
        data: {
          organization: {
            repositories: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  name: 'repo-with-code',
                  nameWithOwner: 'test-org/repo-with-code',
                  defaultBranchRef: { name: 'main' },
                  url: 'https://github.com/test-org/repo-with-code',
                  description: 'Has code',
                  isArchived: false,
                  isEmpty: false,
                },
                {
                  name: 'empty-repo',
                  nameWithOwner: 'test-org/empty-repo',
                  defaultBranchRef: null,
                  url: 'https://github.com/test-org/empty-repo',
                  description: 'Empty repo',
                  isArchived: false,
                  isEmpty: true,
                },
              ],
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const repos = await client.getRepositories();

      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe('repo-with-code');
    });

    it('should handle pagination', async () => {
      const mockPage1 = {
        data: {
          organization: {
            repositories: {
              pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
              nodes: [
                {
                  name: 'repo1',
                  nameWithOwner: 'test-org/repo1',
                  defaultBranchRef: { name: 'main' },
                  url: 'https://github.com/test-org/repo1',
                  description: null,
                  isArchived: false,
                  isEmpty: false,
                },
              ],
            },
          },
        },
      };

      const mockPage2 = {
        data: {
          organization: {
            repositories: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  name: 'repo2',
                  nameWithOwner: 'test-org/repo2',
                  defaultBranchRef: { name: 'main' },
                  url: 'https://github.com/test-org/repo2',
                  description: null,
                  isArchived: false,
                  isEmpty: false,
                },
              ],
            },
          },
        },
      };

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

      expect(repos).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should use main as default branch when defaultBranchRef is null', async () => {
      const mockResponse = {
        data: {
          organization: {
            repositories: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  name: 'repo1',
                  nameWithOwner: 'test-org/repo1',
                  defaultBranchRef: null,
                  url: 'https://github.com/test-org/repo1',
                  description: null,
                  isArchived: false,
                  isEmpty: false,
                },
              ],
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const repos = await client.getRepositories();

      expect(repos[0].defaultBranch).toBe('main');
    });

    it('should throw error on GraphQL failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(client.getRepositories()).rejects.toThrow(
        'GitHub GraphQL error (401): Unauthorized',
      );
    });

    it('should throw error on GraphQL errors in response', async () => {
      const mockResponse = {
        errors: [{ message: 'Rate limit exceeded' }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await expect(client.getRepositories()).rejects.toThrow(
        'GitHub GraphQL errors:',
      );
    });
  });

  describe('getBranches', () => {
    const mockRepo: RepositoryInfo = {
      name: 'test-repo',
      fullPath: 'test-org/test-repo',
      defaultBranch: 'main',
      url: 'https://github.com/test-org/test-repo',
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
        'https://api.github.com/repos/test-org/test-repo/branches?per_page=100&page=1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('should handle pagination for branches', async () => {
      const mockPage1 = Array(100)
        .fill(null)
        .map((_, i) => ({ name: `branch${i}` }));
      const mockPage2 = [{ name: 'branch100' }, { name: 'branch101' }];

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

      expect(branches).toHaveLength(102);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });

      await expect(client.getBranches(mockRepo)).rejects.toThrow(
        'GitHub API error (404): Not Found',
      );
    });
  });

  describe('getTags', () => {
    const mockRepo: RepositoryInfo = {
      name: 'test-repo',
      fullPath: 'test-org/test-repo',
      defaultBranch: 'main',
      url: 'https://github.com/test-org/test-repo',
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
        'https://api.github.com/repos/test-org/test-repo/tags?per_page=100&page=1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
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
      name: 'test-repo',
      fullPath: 'test-org/test-repo',
      defaultBranch: 'main',
      url: 'https://github.com/test-org/test-repo',
    };

    it('should fetch directory contents', async () => {
      const mockContents = [
        { name: 'file1.txt', path: 'file1.txt', type: 'file' },
        { name: 'src', path: 'src', type: 'dir' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockContents),
      });

      const contents = await client.getContents(mockRepo, 'main', '');

      expect(contents).toEqual([
        { name: 'file1.txt', path: 'file1.txt', type: 'file' },
        { name: 'src', path: 'src', type: 'dir' },
      ]);
    });

    it('should fetch contents at a specific path', async () => {
      const mockContents = [
        { name: 'index.ts', path: 'src/index.ts', type: 'file' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockContents),
      });

      const contents = await client.getContents(mockRepo, 'main', 'src');

      expect(contents).toEqual([
        { name: 'index.ts', path: 'src/index.ts', type: 'file' },
      ]);
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
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  describe('getFileContent', () => {
    const mockRepo: RepositoryInfo = {
      name: 'test-repo',
      fullPath: 'test-org/test-repo',
      defaultBranch: 'main',
      url: 'https://github.com/test-org/test-repo',
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
        expect.stringContaining('/repos/test-org/test-repo/contents/'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github.v3.raw',
          }),
        }),
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
      ).rejects.toThrow('Failed to fetch file content: 404 Not Found');
    });
  });

  describe('buildUrl', () => {
    const mockRepo: RepositoryInfo = {
      name: 'test-repo',
      fullPath: 'test-org/test-repo',
      defaultBranch: 'main',
      url: 'https://github.com/test-org/test-repo',
    };

    it('should build URL for a file', () => {
      const url = client.buildUrl({
        repo: mockRepo,
        ref: 'main',
        path: 'src/index.ts',
        type: 'file',
      });

      expect(url).toBe(
        'https://github.com/test-org/test-repo/blob/main/src/index.ts',
      );
    });

    it('should build URL for a directory', () => {
      const url = client.buildUrl({
        repo: mockRepo,
        ref: 'main',
        path: 'src',
        type: 'dir',
      });

      expect(url).toBe('https://github.com/test-org/test-repo/tree/main/src');
    });

    it('should build URL without path', () => {
      const url = client.buildUrl({
        repo: mockRepo,
        ref: 'main',
        path: '',
        type: 'dir',
      });

      expect(url).toBe('https://github.com/test-org/test-repo/tree/main');
    });

    it('should use custom host in URL', () => {
      const config: ScmClientConfig = {
        scmProvider: 'github',
        host: 'github.enterprise.com',
        organization: 'test-org',
        token: 'test-token',
      };
      const ghClient = new GithubClient({ config, logger: mockLogger });

      const url = ghClient.buildUrl({
        repo: mockRepo,
        ref: 'main',
        path: 'file.txt',
        type: 'file',
      });

      expect(url).toBe(
        'https://github.enterprise.com/test-org/test-repo/blob/main/file.txt',
      );
    });
  });

  describe('buildSourceLocation', () => {
    const mockRepo: RepositoryInfo = {
      name: 'test-repo',
      fullPath: 'test-org/test-repo',
      defaultBranch: 'main',
      url: 'https://github.com/test-org/test-repo',
    };

    it('should build source location with directory path', () => {
      const location = client.buildSourceLocation(
        mockRepo,
        'main',
        'src/components/Button.tsx',
      );

      expect(location).toBe(
        'url:https://github.com/test-org/test-repo/tree/main/src/components',
      );
    });

    it('should build source location for root file', () => {
      const location = client.buildSourceLocation(
        mockRepo,
        'main',
        'README.md',
      );

      expect(location).toBe(
        'url:https://github.com/test-org/test-repo/tree/main',
      );
    });
  });
});
