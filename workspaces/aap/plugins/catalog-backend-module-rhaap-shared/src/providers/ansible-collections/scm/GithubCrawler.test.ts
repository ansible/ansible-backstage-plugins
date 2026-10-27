import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  ScmClient,
  RepositoryInfo,
  DirectoryEntry,
} from '@ansible/backstage-rhaap-common';

import { GithubCrawler } from './GithubCrawler';
import type { AnsibleGitContentsSourceConfig } from '../../types';
import * as galaxySchema from '../galaxySchema';

jest.mock('../galaxySchema');

describe('GithubCrawler', () => {
  let mockLogger: jest.Mocked<LoggerService>;
  let mockScmClient: jest.Mocked<ScmClient>;
  let crawler: GithubCrawler;

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

  const validGalaxyYaml = `
namespace: test_namespace
name: test_collection
version: 1.0.0
`;

  const validGalaxyMetadata = {
    namespace: 'test_namespace',
    name: 'test_collection',
    version: '1.0.0',
  };

  beforeEach(() => {
    jest.clearAllMocks();

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
      getBranches: jest.fn().mockResolvedValue(['main', 'develop', 'feature']),
      getTags: jest.fn().mockResolvedValue(['v1.0.0', 'v1.1.0', 'v2.0.0']),
      getContents: jest.fn().mockResolvedValue([]),
      getFileContent: jest.fn().mockResolvedValue(validGalaxyYaml),
      buildSourceLocation: jest
        .fn()
        .mockReturnValue('url:https://github.com/test-org/test-repo'),
    } as unknown as jest.Mocked<ScmClient>;

    (galaxySchema.validateGalaxyContent as jest.Mock).mockReturnValue({
      success: true,
      data: validGalaxyMetadata,
    });

    crawler = new GithubCrawler({
      sourceConfig: mockSourceConfig,
      logger: mockLogger,
      scmClient: mockScmClient,
    });
  });

  describe('discoverGalaxyFiles', () => {
    it('should discover galaxy files in all repositories', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      const result = await crawler.discoverGalaxyFiles({ crawlDepth: 3 });

      expect(mockScmClient.getRepositories).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].metadata).toEqual(validGalaxyMetadata);
    });

    it('should log repository count on start', async () => {
      await crawler.discoverGalaxyFiles({ crawlDepth: 3 });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Starting galaxy.yml discovery in 1 repositories',
        ),
      );
    });
  });

  describe('discoverGalaxyFilesInRepos', () => {
    it('should process multiple repositories', async () => {
      const repo2: RepositoryInfo = {
        name: 'another-repo',
        fullPath: 'test-org/another-repo',
        defaultBranch: 'main',
        url: 'https://github.com/test-org/another-repo',
      };

      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      const result = await crawler.discoverGalaxyFilesInRepos(
        [mockRepo, repo2],
        { crawlDepth: 3 },
      );

      expect(result).toHaveLength(2);
    });

    it('should search additional branches when configured', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
        branches: ['develop'],
      });

      expect(mockScmClient.getBranches).toHaveBeenCalledWith(
        mockRepo,
        undefined,
      );
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should search tags when configured', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
        tags: ['v1.*'],
      });

      expect(mockScmClient.getTags).toHaveBeenCalledWith(mockRepo, undefined);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should skip repositories with errors and log warning', async () => {
      mockScmClient.getContents.mockRejectedValue(new Error('API Error'));

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch contents'),
      );
    });

    it('should skip repositories with no galaxy files and log info', async () => {
      mockScmClient.getContents.mockResolvedValue([]);

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipped 1 repositories'),
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockScmClient.getContents.mockRejectedValue('string error');

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('directory crawling', () => {
    it('should recursively crawl directories', async () => {
      const rootContents: DirectoryEntry[] = [
        { name: 'subdir', path: 'subdir', type: 'dir' },
      ];
      const subdirContents: DirectoryEntry[] = [
        { name: 'galaxy.yml', path: 'subdir/galaxy.yml', type: 'file' },
      ];

      mockScmClient.getContents
        .mockResolvedValueOnce(rootContents)
        .mockResolvedValueOnce(subdirContents);

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('subdir/galaxy.yml');
    });

    it('should respect crawl depth limit', async () => {
      const dirEntry: DirectoryEntry = {
        name: 'deep',
        path: 'deep',
        type: 'dir',
      };
      mockScmClient.getContents.mockResolvedValue([dirEntry]);

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 1,
      });

      expect(result).toHaveLength(0);
    });

    it('should skip common non-collection directories', async () => {
      const skipDirs = [
        'node_modules',
        '.git',
        '.github',
        '__pycache__',
        '.tox',
        '.venv',
        'venv',
        '.cache',
        'dist',
        'build',
        'docs',
        'tests',
        'test',
      ];

      const dirEntries: DirectoryEntry[] = skipDirs.map(name => ({
        name,
        path: name,
        type: 'dir' as const,
      }));

      mockScmClient.getContents.mockResolvedValueOnce(dirEntries);

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(mockScmClient.getContents).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(0);
    });

    it('should use galaxyFilePaths when provided', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'collections/my_collection/galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
        galaxyFilePaths: ['collections'],
      });

      expect(mockScmClient.getContents).toHaveBeenCalledWith(
        mockRepo,
        'main',
        'collections',
        undefined,
      );
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should warn when root directory returns empty contents', async () => {
      mockScmClient.getContents.mockResolvedValue([]);

      await crawler.discoverGalaxyFilesInRepos([mockRepo], { crawlDepth: 3 });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Empty contents returned'),
      );
    });

    it('should handle errors during directory crawl', async () => {
      mockScmClient.getContents.mockRejectedValue(new Error('Network error'));

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should log and skip repo when getRefsToSearch throws (e.g. getBranches fails)', async () => {
      mockScmClient.getBranches.mockRejectedValue(new Error('API rate limit'));

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
        branches: ['develop'],
      });

      expect(result).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error discovering collections'),
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(mockRepo.fullPath),
      );
    });
  });

  describe('galaxy file processing', () => {
    it('should process valid galaxy.yml files', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        repository: mockRepo,
        ref: 'main',
        refType: 'branch',
        path: 'galaxy.yml',
        metadata: validGalaxyMetadata,
      });
    });

    it('should skip files with invalid YAML', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);
      mockScmClient.getFileContent.mockResolvedValue(
        'invalid: yaml: content: [',
      );

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid YAML'),
      );
    });

    it('should skip files that fail galaxy schema validation', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);
      (galaxySchema.validateGalaxyContent as jest.Mock).mockReturnValue({
        success: false,
        errors: ['Missing required field: namespace'],
      });

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Invalid galaxy.yml'),
      );
    });

    it('should handle errors when fetching file content', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);
      mockScmClient.getFileContent.mockRejectedValue(
        new Error('File not found'),
      );

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error processing'),
      );
    });

    it('should recognize galaxy.yaml files', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yaml',
        path: 'galaxy.yaml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(1);
    });
  });

  describe('ref type handling', () => {
    it('should set refType to branch for branch refs', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result[0].refType).toBe('branch');
    });

    it('should set refType to tag for tag refs', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
        tags: ['v1.0.0'],
      });

      const tagResult = result.find(r => r.refType === 'tag');
      expect(tagResult).toBeDefined();
      expect(tagResult?.ref).toBe('v1.0.0');
    });
  });

  describe('branch filtering', () => {
    it('should not duplicate default branch', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
        branches: ['main', 'develop'],
      });

      const mainBranchCalls = mockScmClient.getContents.mock.calls.filter(
        call => call[1] === 'main' && call[2] === '',
      );
      expect(mainBranchCalls.length).toBe(1);
    });

    it('should add configured branches that exist', async () => {
      mockScmClient.getBranches.mockResolvedValue([
        'main',
        'develop',
        'feature',
      ]);
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
        branches: ['develop'],
      });

      expect(mockScmClient.getContents).toHaveBeenCalledWith(
        mockRepo,
        'develop',
        '',
        undefined,
      );
    });

    it('should ignore configured branches that do not exist', async () => {
      mockScmClient.getBranches.mockResolvedValue(['main']);
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
        branches: ['nonexistent'],
      });

      expect(mockScmClient.getContents).not.toHaveBeenCalledWith(
        mockRepo,
        'nonexistent',
        '',
        undefined,
      );
    });
  });
});
