import type {
  LoggerService,
  SchedulerServiceTaskRunner,
  SchedulerService,
} from '@backstage/backend-plugin-api';
import type { EntityProviderConnection } from '@backstage/plugin-catalog-node';
import { ConfigReader } from '@backstage/config';
import type { RepositoryInfo } from '@ansible/backstage-rhaap-common';

import { AnsibleGitContentsProvider } from './AnsibleGitContentsProvider';
import type { ScmCrawler } from './ansible-collections/scm';
import type {
  DiscoveredGalaxyFile,
  AnsibleGitContentsSourceConfig,
} from './types';

const createMockCrawler = (): jest.Mocked<ScmCrawler> => ({
  getRepositories: jest.fn().mockResolvedValue([]),
  getBranches: jest.fn().mockResolvedValue(['main']),
  getTags: jest.fn().mockResolvedValue([]),
  getContents: jest.fn().mockResolvedValue([]),
  getFileContent: jest.fn().mockResolvedValue(''),
  buildSourceLocation: jest.fn().mockReturnValue('url:https://example.com'),
  discoverGalaxyFiles: jest.fn().mockResolvedValue([]),
  discoverGalaxyFilesInRepos: jest.fn().mockResolvedValue([]),
});

let mockCrawlerInstance: jest.Mocked<ScmCrawler>;

jest.mock('./ansible-collections/scm', () => ({
  ScmCrawlerFactory: jest.fn().mockImplementation(() => ({
    createCrawler: jest.fn().mockImplementation(() => mockCrawlerInstance),
  })),
}));

jest.mock('./config', () => ({
  readAnsibleGitContentsConfigs: jest.fn().mockReturnValue([]),
}));

describe('AnsibleGitContentsProvider', () => {
  let mockLogger: jest.Mocked<LoggerService>;
  let mockTaskRunner: jest.Mocked<SchedulerServiceTaskRunner>;
  let mockScheduler: jest.Mocked<SchedulerService>;
  let mockConnection: jest.Mocked<EntityProviderConnection>;

  const mockSourceConfig: AnsibleGitContentsSourceConfig = {
    env: 'development',
    scmProvider: 'github',
    host: 'github.com',
    hostName: 'github',
    organization: 'test-org',
    enabled: true,
    schedule: {
      frequency: { minutes: 30 },
      timeout: { minutes: 10 },
    },
  };

  const mockRepo: RepositoryInfo = {
    name: 'test-repo',
    fullPath: 'test-org/test-repo',
    defaultBranch: 'main',
    url: 'https://github.com/test-org/test-repo',
  };

  const mockGalaxyFile: DiscoveredGalaxyFile = {
    repository: mockRepo,
    ref: 'main',
    refType: 'branch',
    path: 'galaxy.yml',
    content: 'namespace: test_ns\nname: test_coll\nversion: 1.0.0',
    metadata: {
      namespace: 'test_ns',
      name: 'test_coll',
      version: '1.0.0',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockCrawlerInstance = createMockCrawler();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<LoggerService>;

    mockTaskRunner = {
      run: jest.fn().mockImplementation(async ({ fn }) => {
        if (fn) await fn();
      }),
    } as unknown as jest.Mocked<SchedulerServiceTaskRunner>;

    mockScheduler = {
      createScheduledTaskRunner: jest.fn().mockReturnValue(mockTaskRunner),
    } as unknown as jest.Mocked<SchedulerService>;

    mockConnection = {
      applyMutation: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn(),
    } as unknown as jest.Mocked<EntityProviderConnection>;
  });

  const createProviderFromConfig = async (
    configs: AnsibleGitContentsSourceConfig[] = [mockSourceConfig],
  ): Promise<AnsibleGitContentsProvider[]> => {
    const { readAnsibleGitContentsConfigs } = require('./config');
    readAnsibleGitContentsConfigs.mockReturnValue(configs);

    const config = new ConfigReader({
      integrations: {
        github: [{ host: 'github.com', token: 'test-token' }],
      },
    });

    return AnsibleGitContentsProvider.fromConfig(config, {
      logger: mockLogger,
      scheduler: mockScheduler,
    });
  };

  describe('fromConfig', () => {
    it('should return empty array when no sources configured', async () => {
      const providers = await createProviderFromConfig([]);

      expect(providers).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('No Ansible Git Contents sources configured'),
      );
    });

    it('should skip disabled sources', async () => {
      const providers = await createProviderFromConfig([
        { ...mockSourceConfig, enabled: false },
      ]);

      expect(providers).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('is disabled'),
      );
    });

    it('should create providers for enabled sources', async () => {
      const providers = await createProviderFromConfig([mockSourceConfig]);

      expect(providers).toHaveLength(1);
      expect(providers[0].getProviderName()).toContain(
        'AnsibleGitContentsProvider',
      );
    });

    it('should log initialization info', async () => {
      await createProviderFromConfig([mockSourceConfig]);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Initializing Ansible Git Contents Provider'),
      );
    });

    it('should use scheduler when provided', async () => {
      await createProviderFromConfig([mockSourceConfig]);

      expect(mockScheduler.createScheduledTaskRunner).toHaveBeenCalled();
    });
  });

  describe('provider methods', () => {
    it('should return provider name', async () => {
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      expect(provider.getProviderName()).toContain(
        'AnsibleGitContentsProvider',
      );
    });

    it('should return source ID', async () => {
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      expect(provider.getSourceId()).toBeDefined();
      expect(provider.getSourceId()).toContain('github');
    });

    it('should return null for lastSyncTime initially', async () => {
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      expect(provider.getLastSyncTime()).toBeNull();
    });

    it('should return false for isSyncing initially', async () => {
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      expect(provider.getIsSyncing()).toBe(false);
    });

    it('should return enabled status from config', async () => {
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      expect(provider.isEnabled()).toBe(true);
    });

    it('should return null for lastFailedSyncTime initially', async () => {
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      expect(provider.getLastFailedSyncTime()).toBeNull();
    });

    it('should return null for lastSyncStatus initially', async () => {
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      expect(provider.getLastSyncStatus()).toBeNull();
    });

    it('should return 0 for currentCollectionsCount initially', async () => {
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      expect(provider.getCurrentCollectionsCount()).toBe(0);
    });

    it('should return 0 for collectionsDelta initially', async () => {
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      expect(provider.getCollectionsDelta()).toBe(0);
    });
  });

  describe('startSync', () => {
    it('should return error when not connected', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      const result = provider.startSync();

      expect(result).toEqual({
        started: false,
        skipped: false,
        error: 'Provider not connected',
      });
    });

    it('should start sync when connected', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);
      mockCrawlerInstance.getRepositories.mockResolvedValue([]);

      const result = provider.startSync();

      expect(result).toEqual({
        started: true,
        skipped: false,
      });
    });
  });

  describe('run', () => {
    it('should throw when not connected', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await expect(provider.run()).rejects.toThrow('Provider not initialized');
    });

    it('should return false and log when AbortSignal is aborted during run', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);
      mockCrawlerInstance.getRepositories.mockResolvedValue([mockRepo]);

      const controller = new AbortController();
      controller.abort();

      const result = await provider.run(controller.signal);
      expect(result).toBe(false);
      expect(provider.getLastSyncStatus()).toBe('failure');
      expect(provider.getLastFailedSyncTime()).not.toBeNull();
      // Abort may be logged in loop (warn) or catch (warn); child logger may forward to info/warn
      const abortLogged =
        mockLogger.warn.mock.calls.some(call =>
          String(call[0]).includes('SCM sync aborted'),
        ) ||
        mockLogger.info.mock.calls.some(call =>
          String(call[0]).includes('SCM sync aborted'),
        );
      expect(abortLogged).toBe(true);
    });

    it('should discover and apply collections', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);
      mockCrawlerInstance.getRepositories.mockResolvedValue([mockRepo]);
      mockCrawlerInstance.discoverGalaxyFilesInRepos.mockResolvedValue([
        mockGalaxyFile,
      ]);

      await provider.run();

      expect(mockCrawlerInstance.getRepositories).toHaveBeenCalled();
      expect(mockCrawlerInstance.discoverGalaxyFilesInRepos).toHaveBeenCalled();
      expect(mockConnection.applyMutation).toHaveBeenCalled();
    });

    it('should update sync status on success', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);
      mockCrawlerInstance.getRepositories.mockResolvedValue([mockRepo]);
      mockCrawlerInstance.discoverGalaxyFilesInRepos.mockResolvedValue([
        mockGalaxyFile,
      ]);

      await provider.run();

      expect(provider.getLastSyncStatus()).toBe('success');
      expect(provider.getLastSyncTime()).not.toBeNull();
      expect(provider.getIsSyncing()).toBe(false);
    });

    it('should update sync status on failure', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);
      mockCrawlerInstance.getRepositories.mockRejectedValue(
        new Error('API Error'),
      );

      const result = await provider.run();

      expect(result).toBe(false);
      expect(provider.getLastSyncStatus()).toBe('failure');
      expect(provider.getLastFailedSyncTime()).not.toBeNull();
      expect(provider.getIsSyncing()).toBe(false);
    });

    it('should track collection counts', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);
      mockCrawlerInstance.getRepositories.mockResolvedValue([mockRepo]);
      mockCrawlerInstance.discoverGalaxyFilesInRepos.mockResolvedValue([
        mockGalaxyFile,
      ]);

      await provider.run();

      expect(provider.getCurrentCollectionsCount()).toBe(1);
    });

    it('should handle empty repositories', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);
      mockCrawlerInstance.getRepositories.mockResolvedValue([]);

      await provider.run();

      expect(provider.getCurrentCollectionsCount()).toBe(0);
      expect(provider.getLastSyncStatus()).toBe('success');
    });

    it('should process repositories in batches', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);
      const manyRepos = Array.from({ length: 50 }, (_, i) => ({
        ...mockRepo,
        name: `repo-${i}`,
        fullPath: `test-org/repo-${i}`,
      }));
      mockCrawlerInstance.getRepositories.mockResolvedValue(manyRepos);
      mockCrawlerInstance.discoverGalaxyFilesInRepos.mockResolvedValue([]);

      await provider.run();

      expect(
        mockCrawlerInstance.discoverGalaxyFilesInRepos,
      ).toHaveBeenCalledTimes(3);
    });
  });

  describe('connect', () => {
    it('should store connection and start scheduled task', async () => {
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);

      expect(mockTaskRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringContaining('run'),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle mutation errors gracefully', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);
      mockCrawlerInstance.getRepositories.mockResolvedValue([mockRepo]);
      mockCrawlerInstance.discoverGalaxyFilesInRepos.mockResolvedValue([
        mockGalaxyFile,
      ]);
      mockConnection.applyMutation.mockRejectedValue(
        new Error('Mutation failed'),
      );

      const result = await provider.run();

      expect(result).toBe(false);
      expect(provider.getLastSyncStatus()).toBe('failure');
    });
  });

  describe('collection deduplication', () => {
    it('should deduplicate collections with same namespace/name/version', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);
      const duplicateFiles = [
        mockGalaxyFile,
        { ...mockGalaxyFile, path: 'other/galaxy.yml' },
      ];
      mockCrawlerInstance.getRepositories.mockResolvedValue([mockRepo]);
      mockCrawlerInstance.discoverGalaxyFilesInRepos.mockResolvedValue(
        duplicateFiles,
      );

      await provider.run();

      expect(provider.getCurrentCollectionsCount()).toBe(1);
    });

    it('should keep collections with different versions', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);
      const differentVersionFiles = [
        mockGalaxyFile,
        {
          ...mockGalaxyFile,
          metadata: { ...mockGalaxyFile.metadata, version: '2.0.0' },
        },
      ];
      mockCrawlerInstance.getRepositories.mockResolvedValue([mockRepo]);
      mockCrawlerInstance.discoverGalaxyFilesInRepos.mockResolvedValue(
        differentVersionFiles,
      );

      await provider.run();

      expect(provider.getCurrentCollectionsCount()).toBe(2);
    });
  });

  describe('repository entity creation', () => {
    it('should call applyMutation when collections are found', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);
      mockCrawlerInstance.getRepositories.mockResolvedValue([mockRepo]);
      mockCrawlerInstance.discoverGalaxyFilesInRepos.mockResolvedValue([
        mockGalaxyFile,
      ]);

      await provider.run();

      expect(mockConnection.applyMutation).toHaveBeenCalled();
      const mutations = mockConnection.applyMutation.mock.calls;
      expect(mutations.length).toBeGreaterThan(0);
    });
  });

  describe('delta tracking', () => {
    it('should track positive delta on first sync', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);
      mockCrawlerInstance.getRepositories.mockResolvedValue([mockRepo]);
      mockCrawlerInstance.discoverGalaxyFilesInRepos.mockResolvedValue([
        mockGalaxyFile,
      ]);

      await provider.run();

      expect(provider.getCollectionsDelta()).toBe(1);
    });

    it('should track delta across syncs', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);
      const providers = await createProviderFromConfig([mockSourceConfig]);
      const provider = providers[0];

      await provider.connect(mockConnection);
      mockCrawlerInstance.getRepositories.mockResolvedValue([mockRepo]);
      mockCrawlerInstance.discoverGalaxyFilesInRepos
        .mockResolvedValueOnce([mockGalaxyFile])
        .mockResolvedValueOnce([]);

      await provider.run();
      expect(provider.getCurrentCollectionsCount()).toBe(1);

      await provider.run();
      expect(provider.getCurrentCollectionsCount()).toBe(0);
      expect(provider.getCollectionsDelta()).toBe(-1);
    });
  });
});
