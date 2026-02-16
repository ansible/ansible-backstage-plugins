import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { ScmClientFactory } from './ScmClientFactory';
import { GithubClient } from './GithubClient';
import { GitlabClient } from './GitlabClient';

// Mock the ScmIntegrations
jest.mock('@backstage/integration', () => ({
  ScmIntegrations: {
    fromConfig: jest.fn(),
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

      it('should throw error when GitHub token not configured', async () => {
        mockIntegrations.github.byHost.mockReturnValue({
          config: {
            token: undefined,
          },
        });

        await expect(
          factory.createClient({
            scmProvider: 'github',
            organization: 'test-org',
          }),
        ).rejects.toThrow('No token configured for GitHub host: github.com');
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
          '[ScmClientFactory] Using GitHub integration for host: github.com',
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
  });
});
