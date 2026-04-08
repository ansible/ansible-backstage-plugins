import { LoggerService } from '@backstage/backend-plugin-api';
import * as undici from 'undici';
import { GithubClient } from './GithubClient';
import { RepositoryInfo, ScmClientConfig } from './types';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('undici', () => ({
  ...jest.requireActual('undici'),
  fetch: jest.fn(),
}));

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

    it('should use apiBaseUrl for REST and derive GraphQL URL by stripping /v3 when provided', async () => {
      const config: ScmClientConfig = {
        scmProvider: 'github',
        host: 'ghe.example.com',
        organization: 'test-org',
        token: 'test-token',
        apiBaseUrl: 'https://ghe.example.com/api/v3',
      };
      const ghClient = new GithubClient({ config, logger: mockLogger });
      const mockResponse = {
        data: {
          organization: {
            repositories: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          },
        },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await ghClient.getRepositories();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://ghe.example.com/api/graphql',
        expect.any(Object),
      );
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

    it('retries GraphQL up to 2 times on HTTP 5xx then succeeds', async () => {
      jest.useFakeTimers();

      try {
        const successBody = {
          data: {
            organization: {
              repositories: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [],
              },
            },
          },
        };

        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 502,
            text: () => Promise.resolve('bad gateway'),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(successBody),
          });

        const promise = client.getRepositories();

        await Promise.resolve();
        await jest.runOnlyPendingTimersAsync();

        const repos = await promise;

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(repos).toHaveLength(0);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringMatching(/HTTP 502, retry 1\/2/),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('stops after all 5xx retries are exhausted and throws from the last response', async () => {
      jest.useFakeTimers();

      try {
        const errorResponse = {
          ok: false,
          status: 503,
          text: () => Promise.resolve('service unavailable'),
        };

        mockFetch
          .mockResolvedValueOnce(errorResponse)
          .mockResolvedValueOnce(errorResponse)
          .mockResolvedValueOnce(errorResponse);

        const promise = client.getRepositories();
        // Attach the matcher before advancing timers so the rejection is never "unhandled";
        // await is deferred until after fake timers (jest/valid-expect disallows non-awaited expect).
        const expectRejected =
          // eslint-disable-next-line jest/valid-expect -- awaited after runOnlyPendingTimersAsync below
          expect(promise).rejects.toThrow(
            'GitHub GraphQL error (503): service unavailable',
          );

        await Promise.resolve();
        await jest.runOnlyPendingTimersAsync();
        await Promise.resolve();
        await jest.runOnlyPendingTimersAsync();

        await expectRejected;

        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(mockLogger.warn).toHaveBeenCalledTimes(2);
        expect(mockLogger.warn).toHaveBeenNthCalledWith(
          1,
          expect.stringMatching(/HTTP 503, retry 1\/2/),
        );
        expect(mockLogger.warn).toHaveBeenNthCalledWith(
          2,
          expect.stringMatching(/HTTP 503, retry 2\/2/),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not retry GraphQL on non-5xx errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('not found'),
      });

      await expect(client.getRepositories()).rejects.toThrow(
        'GitHub GraphQL error (404)',
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).not.toHaveBeenCalled();
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

    it('should throw when GraphQL response has no data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await expect(client.getRepositories()).rejects.toThrow(
        'GitHub GraphQL response missing data',
      );
    });

    it('should throw when AbortSignal is aborted during getRepositories', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(client.getRepositories(controller.signal)).rejects.toThrow(
        'SCM sync aborted, stopping repository pagination',
      );
    });
  });

  describe('getFetchOptions (checkSSL: false)', () => {
    it('should merge init (e.g. signal) with headers and dispatcher when checkSSL is false', async () => {
      const config: ScmClientConfig = {
        scmProvider: 'github',
        host: 'github.com',
        organization: 'test-org',
        token: 'test-token',
        checkSSL: false,
      };
      const ghClient = new GithubClient({ config, logger: mockLogger });
      const mockResponse = {
        data: {
          organization: {
            repositories: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          },
        },
      };
      (undici.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      const signal = new AbortController().signal;

      await ghClient.getRepositories(signal);

      expect(undici.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
          signal,
          dispatcher: expect.anything(),
        }),
      );
    });
  });

  describe('getFetchOptions (no token)', () => {
    it('should omit Authorization header when token is not provided', async () => {
      const config: ScmClientConfig = {
        scmProvider: 'github',
        host: 'github.com',
        organization: 'test-org',
      };
      const ghClient = new GithubClient({ config, logger: mockLogger });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await ghClient.repositoryExists('test-org', 'public-repo');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.any(String),
          }),
        }),
      );
    });

    it('should omit Authorization header when token is empty string', async () => {
      const config: ScmClientConfig = {
        scmProvider: 'github',
        host: 'github.com',
        organization: 'test-org',
        token: '',
      };
      const ghClient = new GithubClient({ config, logger: mockLogger });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await ghClient.repositoryExists('test-org', 'public-repo');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.any(String),
          }),
        }),
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

    it('should throw when AbortSignal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        client.getBranches(mockRepo, controller.signal),
      ).rejects.toThrow('SCM sync aborted, stopping branch fetch');

      expect(mockFetch).not.toHaveBeenCalled();
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

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      });

      await expect(client.getTags(mockRepo)).rejects.toThrow(
        'GitHub API error (403): Forbidden',
      );
    });

    it('should throw when AbortSignal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(client.getTags(mockRepo, controller.signal)).rejects.toThrow(
        'SCM sync aborted, stopping tag fetch',
      );

      expect(mockFetch).not.toHaveBeenCalled();
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

    it('should throw AbortError when signal is already aborted before fetch', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        client.getFileContent(mockRepo, 'main', 'file.ts', controller.signal),
      ).rejects.toThrow('The operation was aborted');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw AbortError when signal aborts between fetch and sleepMs', async () => {
      jest.useFakeTimers();

      try {
        const controller = new AbortController();

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 502,
          arrayBuffer: () => {
            controller.abort();
            return Promise.resolve(new ArrayBuffer(0));
          },
        });

        const promise = client.getFileContent(
          mockRepo,
          'main',
          'file.ts',
          controller.signal,
        );

        await expect(promise).rejects.toThrow('The operation was aborted');

        expect(mockFetch).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should throw AbortError when signal fires during retry backoff', async () => {
      jest.useFakeTimers();

      try {
        const controller = new AbortController();

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        });

        const promise = client.getFileContent(
          mockRepo,
          'main',
          'file.ts',
          controller.signal,
        );

        const expectRejected =
          // eslint-disable-next-line jest/valid-expect
          expect(promise).rejects.toThrow('The operation was aborted');

        // Flush enough microtasks for fetchWithRetry to enter sleepMs and set
        // up the addEventListener before we fire abort.
        for (let i = 0; i < 10; i++) {
          await Promise.resolve();
        }

        controller.abort();

        await expectRejected;

        expect(mockFetch).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
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

  describe('repositoryExists', () => {
    it('should return true when repository exists', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const exists = await client.repositoryExists('test-owner', 'test-repo');

      expect(exists).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo',
        expect.objectContaining({
          method: 'HEAD',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('should return false when repository does not exist', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const exists = await client.repositoryExists('test-owner', 'nonexistent');

      expect(exists).toBe(false);
    });

    it('should return false when fetch throws error', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const exists = await client.repositoryExists('test-owner', 'test-repo');

      expect(exists).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining(
          '[GithubClient] Repository test-owner/test-repo check failed',
        ),
      );
    });

    it('should encode owner and repo in URL', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await client.repositoryExists('test/owner', 'test/repo');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test%2Fowner/test%2Frepo',
        expect.any(Object),
      );
    });

    it('should use enterprise API URL for enterprise host', async () => {
      const config: ScmClientConfig = {
        scmProvider: 'github',
        host: 'github.enterprise.com',
        organization: 'test-org',
        token: 'test-token',
        apiBaseUrl: 'https://github.enterprise.com/api/v3',
      };
      const enterpriseClient = new GithubClient({ config, logger: mockLogger });

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await enterpriseClient.repositoryExists('test-owner', 'test-repo');

      expect(fetch).toHaveBeenCalledWith(
        'https://github.enterprise.com/api/v3/repos/test-owner/test-repo',
        expect.any(Object),
      );
    });
  });

  describe('dispatchActionsWorkflow', () => {
    it('should POST workflow_dispatch with API version 2026-03-10 and parse run details', async () => {
      const dispatchBody = JSON.stringify({
        workflow_run_id: 987654,
        run_url:
          'https://api.github.com/repos/acme/widgets/actions/runs/987654',
        html_url: 'https://github.com/acme/widgets/actions/runs/987654',
      });
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(dispatchBody),
      });

      const result = await client.dispatchActionsWorkflow(
        'acme',
        'widgets',
        'ee-build.yml',
        'main',
        {
          ee_dir: 'my-ee',
          ee_file_name: 'my-ee.yml',
          ee_registry: 'quay.io/ansible',
          ee_image_name: 'ns/img',
        },
      );

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.workflowRunId).toBe(987654);
      expect(result.workflowRunUrl).toBe(
        'https://github.com/acme/widgets/actions/runs/987654',
      );
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/acme/widgets/actions/workflows/ee-build.yml/dispatches',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2026-03-10',
          }),
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              ee_dir: 'my-ee',
              ee_file_name: 'my-ee.yml',
              ee_registry: 'quay.io/ansible',
              ee_image_name: 'ns/img',
            },
          }),
        }),
      );
    });

    it('falls back gracefully when response body is empty (legacy 204)', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 204,
        statusText: 'No Content',
        text: () => Promise.resolve(''),
      });

      const result = await client.dispatchActionsWorkflow(
        'acme',
        'widgets',
        'ee-build.yml',
        'main',
        { ee_dir: 'x' },
      );

      expect(result.ok).toBe(true);
      expect(result.workflowRunId).toBeUndefined();
      expect(result.workflowRunUrl).toBeUndefined();
    });

    it('returns undefined run details when response JSON lacks those fields', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('{"some":"other"}'),
      });

      const result = await client.dispatchActionsWorkflow(
        'acme',
        'widgets',
        'ee-build.yml',
        'main',
        { ee_dir: 'x' },
      );

      expect(result.ok).toBe(true);
      expect(result.workflowRunId).toBeUndefined();
      expect(result.workflowRunUrl).toBeUndefined();
    });

    it('ignores non-JSON body on success (catch branch)', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('not valid json'),
      });

      const result = await client.dispatchActionsWorkflow(
        'acme',
        'widgets',
        'ee-build.yml',
        'main',
        { ee_dir: 'x' },
      );

      expect(result.ok).toBe(true);
      expect(result.workflowRunId).toBeUndefined();
      expect(result.workflowRunUrl).toBeUndefined();
      expect(result.bodyText).toBe('not valid json');
    });

    it('should return body text when GitHub returns an error', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable',
        text: () => Promise.resolve('{"message":"No ref"}'),
      });

      const result = await client.dispatchActionsWorkflow(
        'o',
        'r',
        'w.yml',
        'bad',
        {},
      );

      expect(result.ok).toBe(false);
      expect(result.status).toBe(422);
      expect(result.bodyText).toBe('{"message":"No ref"}');
      expect(result.workflowRunId).toBeUndefined();
      expect(result.workflowRunUrl).toBeUndefined();
    });
  });
});
