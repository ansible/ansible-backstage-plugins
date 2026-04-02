import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { ScmClientFactory } from './ScmClientFactory';
import { GithubClient } from './GithubClient';
import { GitlabClient } from './GitlabClient';

const mockGithubGetCredentials = jest.fn();

jest.mock('@backstage/integration', () => ({
  ScmIntegrations: {
    fromConfig: jest.fn(),
  },
  DefaultGithubCredentialsProvider: class {
    static fromIntegrations() {
      return { getCredentials: mockGithubGetCredentials };
    }
  },
}));

import { ScmIntegrations } from '@backstage/integration';

describe('ScmClientFactory', () => {
  let factory: ScmClientFactory;
  let mockConfig: Config;
  let mockLogger: LoggerService;
  let mockIntegrations: {
    github: { byHost: jest.Mock };
    gitlab: { byHost: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGithubGetCredentials.mockReset();
    mockGithubGetCredentials.mockResolvedValue({
      type: 'token' as const,
      token: 'github-token',
    });

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as LoggerService;

    mockConfig = {} as Config;

    mockIntegrations = {
      github: {
        byHost: jest.fn(),
      },
      gitlab: {
        byHost: jest.fn(),
      },
    };

    (ScmIntegrations.fromConfig as jest.Mock).mockReturnValue(mockIntegrations);

    factory = new ScmClientFactory({
      rootConfig: mockConfig,
      logger: mockLogger,
    });
  });

  describe('constructor', () => {
    it('should initialize with ScmIntegrations from config', () => {
      expect(ScmIntegrations.fromConfig).toHaveBeenCalledWith(mockConfig);
    });
  });

  describe('createClient', () => {
    describe('GitHub client creation', () => {
      it('should create a GithubClient for github provider', async () => {
        mockIntegrations.github.byHost.mockReturnValue({
          config: {
            token: 'github-token',
          },
        });

        const client = await factory.createClient({
          scmProvider: 'github',
          organization: 'test-org',
        });

        expect(client).toBeInstanceOf(GithubClient);
        expect(client.getHost()).toBe('github.com');
        expect(client.getOrganization()).toBe('test-org');
        expect(mockGithubGetCredentials).toHaveBeenCalledWith({
          url: 'https://github.com/test-org',
        });
      });

      it('should use custom host for GitHub enterprise', async () => {
        mockIntegrations.github.byHost.mockReturnValue({
          config: {
            token: 'github-enterprise-token',
          },
        });

        const client = await factory.createClient({
          scmProvider: 'github',
          host: 'github.enterprise.com',
          organization: 'test-org',
        });

        expect(client).toBeInstanceOf(GithubClient);
        expect(client.getHost()).toBe('github.enterprise.com');
        expect(mockIntegrations.github.byHost).toHaveBeenCalledWith(
          'github.enterprise.com',
        );
      });

      it('should use default github.com host when not specified', async () => {
        mockIntegrations.github.byHost.mockReturnValue({
          config: {
            token: 'github-token',
          },
        });

        await factory.createClient({
          scmProvider: 'github',
          organization: 'test-org',
        });

        expect(mockIntegrations.github.byHost).toHaveBeenCalledWith(
          'github.com',
        );
      });

      it('should throw error when GitHub integration not found', async () => {
        mockIntegrations.github.byHost.mockReturnValue(null);

        await expect(
          factory.createClient({
            scmProvider: 'github',
            host: 'github.unknown.com',
            organization: 'test-org',
          }),
        ).rejects.toThrow(
          'No GitHub integration configured for host: github.unknown.com',
        );
      });

      it('should throw error when neither app nor PAT credentials resolve', async () => {
        mockIntegrations.github.byHost.mockReturnValue({
          config: {
            token: undefined,
          },
        });
        mockGithubGetCredentials.mockResolvedValue({
          type: 'token' as const,
          token: undefined,
        });

        await expect(
          factory.createClient({
            scmProvider: 'github',
            organization: 'test-org',
          }),
        ).rejects.toThrow('No credentials for GitHub host: github.com');
      });

      it('should request credentials for org/repo URL when repository is set', async () => {
        mockIntegrations.github.byHost.mockReturnValue({
          config: { token: 'pat' },
        });
        mockGithubGetCredentials.mockResolvedValue({
          type: 'app' as const,
          token: 'installation-token',
        });

        await factory.createClient({
          scmProvider: 'github',
          organization: 'acme',
          repository: 'widgets',
        });

        expect(mockGithubGetCredentials).toHaveBeenCalledWith({
          url: 'https://github.com/acme/widgets',
        });
      });

      it('should fall back to PAT when getCredentials throws', async () => {
        mockIntegrations.github.byHost.mockReturnValue({
          config: { token: 'fallback-pat' },
        });
        mockGithubGetCredentials.mockRejectedValue(
          new Error('app auth failed'),
        );

        const client = await factory.createClient({
          scmProvider: 'github',
          organization: 'test-org',
        });

        expect(client).toBeInstanceOf(GithubClient);
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringContaining(
            'GitHub App credentials unavailable for https://github.com/test-org',
          ),
        );
        expect(mockLogger.debug).toHaveBeenCalledWith(
          '[resolveGithubToken] Resolved GitHub credentials for host: github.com',
        );
      });

      it('should use integration PAT when getCredentials resolves without a token', async () => {
        mockIntegrations.github.byHost.mockReturnValue({
          config: { token: 'pat-only-no-app-token' },
        });
        mockGithubGetCredentials.mockResolvedValue({
          type: 'token' as const,
          token: undefined,
        });

        const client = await factory.createClient({
          scmProvider: 'github',
          organization: 'test-org',
        });

        expect(client).toBeInstanceOf(GithubClient);
        expect(mockGithubGetCredentials).toHaveBeenCalledWith({
          url: 'https://github.com/test-org',
        });
        expect(mockLogger.debug).not.toHaveBeenCalledWith(
          expect.stringMatching(/GitHub App credentials unavailable/),
        );
        expect(mockLogger.debug).toHaveBeenCalledWith(
          '[resolveGithubToken] Resolved GitHub credentials for host: github.com',
        );
      });
    });

    describe('GitLab client creation', () => {
      it('should create a GitlabClient for gitlab provider', async () => {
        mockIntegrations.gitlab.byHost.mockReturnValue({
          config: {
            token: 'gitlab-token',
          },
        });

        const client = await factory.createClient({
          scmProvider: 'gitlab',
          organization: 'test-group',
        });

        expect(client).toBeInstanceOf(GitlabClient);
        expect(client.getHost()).toBe('gitlab.com');
        expect(client.getOrganization()).toBe('test-group');
      });

      it('should use custom host for GitLab self-hosted', async () => {
        mockIntegrations.gitlab.byHost.mockReturnValue({
          config: {
            token: 'gitlab-selfhosted-token',
          },
        });

        const client = await factory.createClient({
          scmProvider: 'gitlab',
          host: 'gitlab.selfhosted.com',
          organization: 'test-group',
        });

        expect(client).toBeInstanceOf(GitlabClient);
        expect(client.getHost()).toBe('gitlab.selfhosted.com');
        expect(mockIntegrations.gitlab.byHost).toHaveBeenCalledWith(
          'gitlab.selfhosted.com',
        );
      });

      it('should use default gitlab.com host when not specified', async () => {
        mockIntegrations.gitlab.byHost.mockReturnValue({
          config: {
            token: 'gitlab-token',
          },
        });

        await factory.createClient({
          scmProvider: 'gitlab',
          organization: 'test-group',
        });

        expect(mockIntegrations.gitlab.byHost).toHaveBeenCalledWith(
          'gitlab.com',
        );
      });

      it('should throw error when GitLab integration not found', async () => {
        mockIntegrations.gitlab.byHost.mockReturnValue(null);

        await expect(
          factory.createClient({
            scmProvider: 'gitlab',
            host: 'gitlab.unknown.com',
            organization: 'test-group',
          }),
        ).rejects.toThrow(
          'No GitLab integration configured for host: gitlab.unknown.com',
        );
      });

      it('should throw error when GitLab token not configured', async () => {
        mockIntegrations.gitlab.byHost.mockReturnValue({
          config: {
            token: undefined,
          },
        });

        await expect(
          factory.createClient({
            scmProvider: 'gitlab',
            organization: 'test-group',
          }),
        ).rejects.toThrow('No token configured for GitLab host: gitlab.com');
      });
    });

    describe('unsupported provider', () => {
      it('should throw error for unsupported SCM provider', async () => {
        await expect(
          factory.createClient({
            scmProvider: 'bitbucket' as any,
            organization: 'test-org',
          }),
        ).rejects.toThrow('Unsupported SCM provider: bitbucket');
      });
    });

    describe('provided token', () => {
      it('should use provided token instead of integration token for GitHub', async () => {
        mockIntegrations.github.byHost.mockReturnValue({
          config: {
            token: 'integration-token',
            apiBaseUrl: 'https://api.github.com',
          },
        });

        const client = await factory.createClient({
          scmProvider: 'github',
          organization: 'test-org',
          token: 'user-oauth-token',
        });

        expect(client).toBeInstanceOf(GithubClient);
        expect(mockLogger.info).toHaveBeenCalledWith(
          '[ScmClientFactory] Using provided OAuth token for GitHub host: github.com',
        );
      });

      it('should use provided token instead of integration token for GitLab', async () => {
        mockIntegrations.gitlab.byHost.mockReturnValue({
          config: {
            token: 'integration-token',
            apiBaseUrl: 'https://gitlab.com/api/v4',
          },
        });

        const client = await factory.createClient({
          scmProvider: 'gitlab',
          organization: 'test-group',
          token: 'user-oauth-token',
        });

        expect(client).toBeInstanceOf(GitlabClient);
        expect(mockLogger.info).toHaveBeenCalledWith(
          '[ScmClientFactory] Using provided OAuth token for GitLab host: gitlab.com',
        );
      });

      it('should work with provided token when no integration token is configured for GitHub', async () => {
        mockIntegrations.github.byHost.mockReturnValue({
          config: {
            token: undefined,
          },
        });

        const client = await factory.createClient({
          scmProvider: 'github',
          organization: 'test-org',
          token: 'user-oauth-token',
        });

        expect(client).toBeInstanceOf(GithubClient);
      });

      it('should work with provided token when no integration token is configured for GitLab', async () => {
        mockIntegrations.gitlab.byHost.mockReturnValue({
          config: {
            token: undefined,
          },
        });

        const client = await factory.createClient({
          scmProvider: 'gitlab',
          organization: 'test-group',
          token: 'user-oauth-token',
        });

        expect(client).toBeInstanceOf(GitlabClient);
      });

      it('should work with provided token when no integration is configured for GitHub', async () => {
        mockIntegrations.github.byHost.mockReturnValue(null);

        const client = await factory.createClient({
          scmProvider: 'github',
          organization: 'test-org',
          token: 'user-oauth-token',
        });

        expect(client).toBeInstanceOf(GithubClient);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          '[ScmClientFactory] GitHub credential resolution failed for host: github.com, but using provided token',
        );
      });

      it('should work with provided token when no integration is configured for GitLab', async () => {
        mockIntegrations.gitlab.byHost.mockReturnValue(null);

        const client = await factory.createClient({
          scmProvider: 'gitlab',
          organization: 'test-group',
          token: 'user-oauth-token',
        });

        expect(client).toBeInstanceOf(GitlabClient);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          '[ScmClientFactory] No GitLab integration configured for host: gitlab.com, but using provided token',
        );
      });
    });

    describe('logging', () => {
      it('should log debug message when using GitHub integration', async () => {
        mockIntegrations.github.byHost.mockReturnValue({
          config: {
            token: 'github-token',
          },
        });

        await factory.createClient({
          scmProvider: 'github',
          organization: 'test-org',
        });

        expect(mockLogger.debug).toHaveBeenCalledWith(
          '[resolveGithubToken] Resolved GitHub credentials for host: github.com',
        );
      });

      it('should log debug message when using GitLab integration', async () => {
        mockIntegrations.gitlab.byHost.mockReturnValue({
          config: {
            token: 'gitlab-token',
          },
        });

        await factory.createClient({
          scmProvider: 'gitlab',
          organization: 'test-group',
        });

        expect(mockLogger.debug).toHaveBeenCalledWith(
          '[ScmClientFactory] Using GitLab integration for host: gitlab.com',
        );
      });
    });
  });

  describe('client configuration', () => {
    it('should pass correct config to GithubClient', async () => {
      mockIntegrations.github.byHost.mockReturnValue({
        config: {
          token: 'test-github-token',
        },
      });
      mockGithubGetCredentials.mockResolvedValue({
        type: 'token' as const,
        token: 'test-github-token',
      });

      const client = await factory.createClient({
        scmProvider: 'github',
        host: 'github.enterprise.com',
        organization: 'my-org',
      });

      expect(client.getHost()).toBe('github.enterprise.com');
      expect(client.getOrganization()).toBe('my-org');
      expect(client.getSourceId()).toBe('github-github-enterprise-com-my-org');
    });

    it('should pass correct config to GitlabClient', async () => {
      mockIntegrations.gitlab.byHost.mockReturnValue({
        config: {
          token: 'test-gitlab-token',
        },
      });

      const client = await factory.createClient({
        scmProvider: 'gitlab',
        host: 'gitlab.selfhosted.com',
        organization: 'my-group/subgroup',
      });

      expect(client.getHost()).toBe('gitlab.selfhosted.com');
      expect(client.getOrganization()).toBe('my-group/subgroup');
      expect(client.getSourceId()).toBe(
        'gitlab-gitlab-selfhosted-com-my-group-subgroup',
      );
    });

    it('should enable GitLab Bearer auth when a user-provided token is passed', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      mockIntegrations.gitlab.byHost.mockReturnValue({
        config: {
          token: 'integration-token',
        },
      });

      const client = await factory.createClient({
        scmProvider: 'gitlab',
        organization: 'my-group',
        token: 'oauth-access-token',
      });

      await client.repositoryExists('my-group', 'my-project');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer oauth-access-token',
          }),
        }),
      );
    });
  });
});
