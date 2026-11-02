import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  ScmClient,
  RepositoryInfo,
  DirectoryEntry,
} from '@ansible/backstage-rhaap-common';

import { GitlabCrawler } from './GitlabCrawler';
import type { AnsibleGitContentsSourceConfig } from '../../types';
import * as galaxySchema from '../galaxySchema';

jest.mock('../galaxySchema');

describe('GitlabCrawler', () => {
  let mockLogger: jest.Mocked<LoggerService>;
  let mockScmClient: jest.Mocked<ScmClient>;
  let crawler: GitlabCrawler;

  const mockSourceConfig: AnsibleGitContentsSourceConfig = {
    env: 'development',
    scmProvider: 'gitlab',
    host: 'gitlab.com',
    hostName: 'gitlab',
    organization: 'test-group',
    enabled: true,
    schedule: { frequency: { minutes: 30 }, timeout: { minutes: 10 } },
  };

  const mockRepo: RepositoryInfo = {
    name: 'test-project',
    fullPath: 'test-group/test-project',
    defaultBranch: 'main',
    url: 'https://gitlab.com/test-group/test-project',
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
      getSourceId: jest
        .fn()
        .mockReturnValue('dev:gitlab:gitlab.com:test-group'),
      getRepositories: jest.fn().mockResolvedValue([mockRepo]),
      getBranches: jest.fn().mockResolvedValue(['main', 'develop']),
      getTags: jest.fn().mockResolvedValue(['v1.0.0', 'v2.0.0']),
      getContents: jest.fn().mockResolvedValue([]),
      getFileContent: jest.fn().mockResolvedValue(validGalaxyYaml),
      buildSourceLocation: jest
        .fn()
        .mockReturnValue('url:https://gitlab.com/test-group/test-project'),
    } as unknown as jest.Mocked<ScmClient>;

    (galaxySchema.validateGalaxyContent as jest.Mock).mockReturnValue({
      success: true,
      data: validGalaxyMetadata,
    });

    crawler = new GitlabCrawler({
      sourceConfig: mockSourceConfig,
      logger: mockLogger,
      scmClient: mockScmClient,
    });
  });

  describe('discoverGalaxyFiles', () => {
    it('should discover galaxy files in all projects', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      const result = await crawler.discoverGalaxyFiles({ crawlDepth: 3 });

      expect(mockScmClient.getRepositories).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should log project count on start', async () => {
      await crawler.discoverGalaxyFiles({ crawlDepth: 3 });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting galaxy.yml discovery in 1 projects'),
      );
    });
  });

  describe('discoverGalaxyFilesInRepos', () => {
    it('should process multiple projects', async () => {
      const project2: RepositoryInfo = {
        name: 'another-project',
        fullPath: 'test-group/another-project',
        defaultBranch: 'main',
        url: 'https://gitlab.com/test-group/another-project',
      };

      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      const result = await crawler.discoverGalaxyFilesInRepos(
        [mockRepo, project2],
        { crawlDepth: 3 },
      );

      expect(result).toHaveLength(2);
    });

    it('should skip projects with errors', async () => {
      mockScmClient.getContents.mockRejectedValue(new Error('API Error'));

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch contents'),
      );
    });

    it('should skip projects with no galaxy files', async () => {
      mockScmClient.getContents.mockResolvedValue([]);

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipped 1 projects'),
      );
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
        tags: ['v*'],
      });

      expect(mockScmClient.getTags).toHaveBeenCalledWith(mockRepo, undefined);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('directory crawling', () => {
    it('should recursively crawl directories', async () => {
      const rootContents: DirectoryEntry[] = [
        { name: 'collections', path: 'collections', type: 'dir' },
      ];
      const subdirContents: DirectoryEntry[] = [
        { name: 'galaxy.yml', path: 'collections/galaxy.yml', type: 'file' },
      ];

      mockScmClient.getContents
        .mockResolvedValueOnce(rootContents)
        .mockResolvedValueOnce(subdirContents);

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('collections/galaxy.yml');
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
      const skipDirs = ['node_modules', '.git', '.gitlab', '__pycache__'];

      const dirEntries: DirectoryEntry[] = skipDirs.map(name => ({
        name,
        path: name,
        type: 'dir' as const,
      }));

      mockScmClient.getContents.mockResolvedValueOnce(dirEntries);

      await crawler.discoverGalaxyFilesInRepos([mockRepo], { crawlDepth: 3 });

      expect(mockScmClient.getContents).toHaveBeenCalledTimes(1);
    });

    it('should warn when root directory returns empty contents', async () => {
      mockScmClient.getContents.mockResolvedValue([]);

      await crawler.discoverGalaxyFilesInRepos([mockRepo], { crawlDepth: 3 });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Empty contents returned'),
      );
    });

    it('should handle errors in subdirectory crawl gracefully', async () => {
      const rootContents: DirectoryEntry[] = [
        { name: 'subdir', path: 'subdir', type: 'dir' },
      ];
      mockScmClient.getContents
        .mockResolvedValueOnce(rootContents)
        .mockRejectedValueOnce(new Error('Access denied'));

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Error crawling'),
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
      });
    });

    it('should skip files with invalid YAML', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);
      mockScmClient.getFileContent.mockResolvedValue('not: valid: yaml: [');

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid YAML'),
      );
    });

    it('should skip files that fail validation', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);
      (galaxySchema.validateGalaxyContent as jest.Mock).mockReturnValue({
        success: false,
        errors: ['Missing namespace'],
      });

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(0);
    });

    it('should handle errors when fetching file content', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);
      mockScmClient.getFileContent.mockRejectedValue(new Error('Not found'));

      const result = await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
      });

      expect(result).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error processing'),
      );
    });

    it('should log found galaxy files', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'collections/my_collection/galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      await crawler.discoverGalaxyFilesInRepos([mockRepo], { crawlDepth: 3 });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Found galaxy file'),
      );
    });
  });

  describe('galaxyFilePaths option', () => {
    it('should use specific paths when provided', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'custom/path/galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
        galaxyFilePaths: ['custom/path'],
      });

      expect(mockScmClient.getContents).toHaveBeenCalledWith(
        mockRepo,
        'main',
        'custom/path',
        undefined,
      );
    });

    it('should search multiple paths', async () => {
      const galaxyFileEntry: DirectoryEntry = {
        name: 'galaxy.yml',
        path: 'galaxy.yml',
        type: 'file',
      };
      mockScmClient.getContents.mockResolvedValue([galaxyFileEntry]);

      await crawler.discoverGalaxyFilesInRepos([mockRepo], {
        crawlDepth: 3,
        galaxyFilePaths: ['path1', 'path2'],
      });

      expect(mockScmClient.getContents).toHaveBeenCalledWith(
        mockRepo,
        'main',
        'path1',
        undefined,
      );
      expect(mockScmClient.getContents).toHaveBeenCalledWith(
        mockRepo,
        'main',
        'path2',
        undefined,
      );
    });
  });
});
