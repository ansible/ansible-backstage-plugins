import type { LoggerService } from '@backstage/backend-plugin-api';
import { ConfigReader } from '@backstage/config';
import { ScmClientFactory } from '@ansible/backstage-rhaap-common';

import { ScmCrawlerFactory } from './ScmCrawlerFactory';
import { GithubCrawler } from './GithubCrawler';
import { GitlabCrawler } from './GitlabCrawler';
import type { AnsibleGitContentsSourceConfig } from '../../types';

jest.mock('@ansible/backstage-rhaap-common', () => ({
  ScmClientFactory: jest.fn().mockImplementation(() => ({
    createClient: jest.fn().mockResolvedValue({
      getSourceId: jest.fn().mockReturnValue('test:source:id'),
      getRepositories: jest.fn().mockResolvedValue([]),
      getBranches: jest.fn().mockResolvedValue([]),
      getTags: jest.fn().mockResolvedValue([]),
      getContents: jest.fn().mockResolvedValue([]),
      getFileContent: jest.fn().mockResolvedValue(''),
      buildSourceLocation: jest.fn().mockReturnValue(''),
    }),
  })),
}));

describe('ScmCrawlerFactory', () => {
  let mockLogger: jest.Mocked<LoggerService>;
  let factory: ScmCrawlerFactory;

  const mockConfig = new ConfigReader({
    integrations: {
      github: [{ host: 'github.com', token: 'test-token' }],
      gitlab: [{ host: 'gitlab.com', token: 'test-token' }],
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<LoggerService>;

    factory = new ScmCrawlerFactory({
      rootConfig: mockConfig,
      logger: mockLogger,
    });
  });

  describe('constructor', () => {
    it('should create ScmClientFactory with provided options', () => {
      expect(ScmClientFactory).toHaveBeenCalledWith({
        rootConfig: mockConfig,
        logger: mockLogger,
      });
    });
  });

  describe('createCrawler', () => {
    it('should create GithubCrawler for github provider', async () => {
      const sourceConfig: AnsibleGitContentsSourceConfig = {
        env: 'development',
        scmProvider: 'github',
        host: 'github.com',
        hostName: 'github',
        organization: 'test-org',
        enabled: true,
        schedule: { frequency: { minutes: 30 }, timeout: { minutes: 10 } },
      };

      const crawler = await factory.createCrawler(sourceConfig);

      expect(crawler).toBeInstanceOf(GithubCrawler);
    });

    it('should create GitlabCrawler for gitlab provider', async () => {
      const sourceConfig: AnsibleGitContentsSourceConfig = {
        env: 'development',
        scmProvider: 'gitlab',
        host: 'gitlab.com',
        hostName: 'gitlab',
        organization: 'test-group',
        enabled: true,
        schedule: { frequency: { minutes: 30 }, timeout: { minutes: 10 } },
      };

      const crawler = await factory.createCrawler(sourceConfig);

      expect(crawler).toBeInstanceOf(GitlabCrawler);
    });

    it('should throw error for unsupported provider', async () => {
      const sourceConfig: AnsibleGitContentsSourceConfig = {
        env: 'development',
        scmProvider: 'bitbucket' as any,
        host: 'bitbucket.org',
        hostName: 'bitbucket',
        organization: 'test-org',
        enabled: true,
        schedule: { frequency: { minutes: 30 }, timeout: { minutes: 10 } },
      };

      await expect(factory.createCrawler(sourceConfig)).rejects.toThrow(
        'Unsupported SCM provider: bitbucket',
      );
    });

    it('should pass source config to ScmClientFactory', async () => {
      const sourceConfig: AnsibleGitContentsSourceConfig = {
        env: 'development',
        scmProvider: 'github',
        host: 'github.enterprise.com',
        hostName: 'github-enterprise',
        organization: 'enterprise-org',
        enabled: true,
        schedule: { frequency: { minutes: 30 }, timeout: { minutes: 10 } },
      };

      await factory.createCrawler(sourceConfig);

      const mockScmClientFactory = (ScmClientFactory as jest.Mock).mock
        .results[0].value;
      expect(mockScmClientFactory.createClient).toHaveBeenCalledWith({
        scmProvider: 'github',
        host: 'github.enterprise.com',
        organization: 'enterprise-org',
      });
    });
  });
});
