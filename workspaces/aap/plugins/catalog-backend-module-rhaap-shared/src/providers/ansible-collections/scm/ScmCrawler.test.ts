import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  ScmClient,
  RepositoryInfo,
} from '@ansible/backstage-rhaap-common';

import { BaseScmCrawler, DiscoveryOptions } from './ScmCrawler';
import type {
  DiscoveredGalaxyFile,
  AnsibleGitContentsSourceConfig,
} from '../../types';

class TestScmCrawler extends BaseScmCrawler {
  protected getCrawlerName(): string {
    return 'TestScmCrawler';
  }

  async discoverGalaxyFiles(
    _options: DiscoveryOptions,
  ): Promise<DiscoveredGalaxyFile[]> {
    return [];
  }

  async discoverGalaxyFilesInRepos(
    _repos: RepositoryInfo[],
    _options: DiscoveryOptions,
    _signal?: AbortSignal,
  ): Promise<DiscoveredGalaxyFile[]> {
    return [];
  }

  public testIsGalaxyFile(filename: string): boolean {
    return this.isGalaxyFile(filename);
  }

  public testMatchesTagPattern(tag: string, patterns: string[]): boolean {
    return this.matchesTagPattern(tag, patterns);
  }

  public testFilterTags(allTags: string[], patterns?: string[]): string[] {
    return this.filterTags(allTags, patterns);
  }

  public testGetSourceId(): string {
    return this.getSourceId();
  }
}

/** Used for abort-signal test so base discoverGalaxyFilesInRepos runs and checks signal. */
class AbortTestScmCrawler extends BaseScmCrawler {
  protected getCrawlerName(): string {
    return 'AbortTestScmCrawler';
  }
}

describe('BaseScmCrawler', () => {
  let mockLogger: jest.Mocked<LoggerService>;
  let mockScmClient: jest.Mocked<ScmClient>;
  let crawler: TestScmCrawler;

  const mockSourceConfig: AnsibleGitContentsSourceConfig = {
    env: 'development',
    scmProvider: 'github',
    host: 'github.com',
    hostName: 'github',
    organization: 'test-org',
    enabled: true,
    schedule: { frequency: { minutes: 30 }, timeout: { minutes: 10 } },
  };

  const mockRepo: RepositoryInfo = {
    name: 'test-repo',
    fullPath: 'test-org/test-repo',
    defaultBranch: 'main',
    url: 'https://github.com/test-org/test-repo',
  };

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<LoggerService>;

    mockScmClient = {
      getSourceId: jest.fn().mockReturnValue('dev:github:github.com:test-org'),
      getRepositories: jest.fn().mockResolvedValue([mockRepo]),
      getBranches: jest.fn().mockResolvedValue(['main', 'develop']),
      getTags: jest.fn().mockResolvedValue(['v1.0.0', 'v1.1.0', 'v2.0.0']),
      getContents: jest.fn().mockResolvedValue([]),
      getFileContent: jest.fn().mockResolvedValue('content'),
      buildSourceLocation: jest.fn().mockReturnValue('url:https://example.com'),
    } as unknown as jest.Mocked<ScmClient>;

    crawler = new TestScmCrawler({
      sourceConfig: mockSourceConfig,
      logger: mockLogger,
      scmClient: mockScmClient,
    });
  });

  describe('getSourceId', () => {
    it('should return source ID from scmClient', () => {
      expect(crawler.testGetSourceId()).toBe('dev:github:github.com:test-org');
      expect(mockScmClient.getSourceId).toHaveBeenCalled();
    });
  });

  describe('getRepositories', () => {
    it('should delegate to scmClient', async () => {
      const repos = await crawler.getRepositories();
      expect(repos).toEqual([mockRepo]);
      expect(mockScmClient.getRepositories).toHaveBeenCalled();
    });
  });

  describe('getBranches', () => {
    it('should delegate to scmClient', async () => {
      const branches = await crawler.getBranches(mockRepo);
      expect(branches).toEqual(['main', 'develop']);
      expect(mockScmClient.getBranches).toHaveBeenCalledWith(
        mockRepo,
        undefined,
      );
    });
  });

  describe('getTags', () => {
    it('should delegate to scmClient', async () => {
      const tags = await crawler.getTags(mockRepo);
      expect(tags).toEqual(['v1.0.0', 'v1.1.0', 'v2.0.0']);
      expect(mockScmClient.getTags).toHaveBeenCalledWith(mockRepo, undefined);
    });
  });

  describe('getContents', () => {
    it('should delegate to scmClient', async () => {
      const contents = await crawler.getContents(mockRepo, 'main', 'path');
      expect(contents).toEqual([]);
      expect(mockScmClient.getContents).toHaveBeenCalledWith(
        mockRepo,
        'main',
        'path',
        undefined,
      );
    });
  });

  describe('getFileContent', () => {
    it('should delegate to scmClient', async () => {
      const content = await crawler.getFileContent(
        mockRepo,
        'main',
        'file.txt',
      );
      expect(content).toBe('content');
      expect(mockScmClient.getFileContent).toHaveBeenCalledWith(
        mockRepo,
        'main',
        'file.txt',
        undefined,
      );
    });
  });

  describe('abort signal', () => {
    it('should throw when AbortSignal is aborted during discoverGalaxyFilesInRepos', async () => {
      const abortCrawler = new AbortTestScmCrawler({
        sourceConfig: mockSourceConfig,
        logger: mockLogger,
        scmClient: mockScmClient,
      });
      const controller = new AbortController();
      controller.abort();

      await expect(
        abortCrawler.discoverGalaxyFilesInRepos(
          [mockRepo],
          { crawlDepth: 3 },
          controller.signal,
        ),
      ).rejects.toThrow('SCM sync aborted, stopping galaxy file discovery');
    });
  });

  describe('buildSourceLocation', () => {
    it('should delegate to scmClient', () => {
      const location = crawler.buildSourceLocation(mockRepo, 'main', 'path');
      expect(location).toBe('url:https://example.com');
      expect(mockScmClient.buildSourceLocation).toHaveBeenCalledWith(
        mockRepo,
        'main',
        'path',
      );
    });
  });

  describe('isGalaxyFile', () => {
    it('should return true for galaxy.yml', () => {
      expect(crawler.testIsGalaxyFile('galaxy.yml')).toBe(true);
    });

    it('should return true for galaxy.yaml', () => {
      expect(crawler.testIsGalaxyFile('galaxy.yaml')).toBe(true);
    });

    it('should return true for GALAXY.YML (case insensitive)', () => {
      expect(crawler.testIsGalaxyFile('GALAXY.YML')).toBe(true);
    });

    it('should return true for Galaxy.Yaml (case insensitive)', () => {
      expect(crawler.testIsGalaxyFile('Galaxy.Yaml')).toBe(true);
    });

    it('should return false for other files', () => {
      expect(crawler.testIsGalaxyFile('package.json')).toBe(false);
      expect(crawler.testIsGalaxyFile('galaxy.json')).toBe(false);
      expect(crawler.testIsGalaxyFile('mygalaxy.yml')).toBe(false);
      expect(crawler.testIsGalaxyFile('galaxy.yml.bak')).toBe(false);
    });
  });

  describe('matchesTagPattern', () => {
    it('should match exact tags', () => {
      expect(crawler.testMatchesTagPattern('v1.0.0', ['v1.0.0'])).toBe(true);
    });

    it('should match wildcard patterns with *', () => {
      expect(crawler.testMatchesTagPattern('v1.0.0', ['v*'])).toBe(true);
      expect(crawler.testMatchesTagPattern('v1.2.3', ['v1.*'])).toBe(true);
      expect(
        crawler.testMatchesTagPattern('release-1.0.0', ['release-*']),
      ).toBe(true);
    });

    it('should match wildcard patterns with ?', () => {
      expect(crawler.testMatchesTagPattern('v1.0.0', ['v?.0.0'])).toBe(true);
      expect(crawler.testMatchesTagPattern('v1.0.0', ['v?.?.?'])).toBe(true);
    });

    it('should not match non-matching patterns', () => {
      expect(crawler.testMatchesTagPattern('v1.0.0', ['v2.*'])).toBe(false);
      expect(crawler.testMatchesTagPattern('release-1.0', ['v*'])).toBe(false);
    });

    it('should match if any pattern matches', () => {
      expect(crawler.testMatchesTagPattern('v1.0.0', ['v2.*', 'v1.*'])).toBe(
        true,
      );
    });

    it('should handle special regex characters in patterns', () => {
      expect(crawler.testMatchesTagPattern('v1.0.0', ['v1.0.0'])).toBe(true);
      expect(
        crawler.testMatchesTagPattern('tag+special', ['tag+special']),
      ).toBe(true);
      expect(crawler.testMatchesTagPattern('test[1]', ['test[1]'])).toBe(true);
    });
  });

  describe('filterTags', () => {
    it('should return empty array when patterns is undefined', () => {
      expect(crawler.testFilterTags(['v1.0.0', 'v2.0.0'], undefined)).toEqual(
        [],
      );
    });

    it('should return empty array when patterns is empty', () => {
      expect(crawler.testFilterTags(['v1.0.0', 'v2.0.0'], [])).toEqual([]);
    });

    it('should filter tags matching patterns', () => {
      const tags = ['v1.0.0', 'v1.1.0', 'v2.0.0', 'release-1.0'];
      const patterns = ['v1.*'];
      expect(crawler.testFilterTags(tags, patterns)).toEqual([
        'v1.0.0',
        'v1.1.0',
      ]);
    });

    it('should filter tags matching multiple patterns', () => {
      const tags = ['v1.0.0', 'v2.0.0', 'release-1.0', 'beta-1'];
      const patterns = ['v*', 'release-*'];
      expect(crawler.testFilterTags(tags, patterns)).toEqual([
        'v1.0.0',
        'v2.0.0',
        'release-1.0',
      ]);
    });

    it('should return empty array when no tags match', () => {
      const tags = ['v1.0.0', 'v2.0.0'];
      const patterns = ['release-*'];
      expect(crawler.testFilterTags(tags, patterns)).toEqual([]);
    });
  });
});
