import { ConfigReader } from '@backstage/config';
import {
  SchedulerServiceTaskInvocationDefinition,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import { mockServices } from '@backstage/backend-test-utils';
import { EntityProviderConnection } from '@backstage/plugin-catalog-node';
import { PAHCollectionProvider } from './PAHCollectionProvider';
import { mockAnsibleService } from '../mock/mockIAAPService';
import { Collection } from '@ansible/backstage-rhaap-common';

// Mock the entityParser module for testing parser errors
jest.mock('./entityParser', () => {
  const actual = jest.requireActual('./entityParser');
  return {
    ...actual,
    pahCollectionParser: jest.fn(actual.pahCollectionParser),
  };
});
import { pahCollectionParser } from './entityParser';

// Mock config for PAH collection provider
const MOCK_PAH_CONFIG = {
  catalog: {
    providers: {
      rhaap: {
        development: {
          orgs: 'Default',
          sync: {
            pahCollections: {
              enabled: true,
              repositories: [
                {
                  name: 'validated',
                  schedule: {
                    frequency: { minutes: 60 },
                    timeout: { minutes: 15 },
                  },
                },
              ],
            },
          },
        },
      },
    },
  },
  ansible: {
    rhaap: {
      baseUrl: 'https://pah.test',
      token: 'testtoken',
      checkSSL: false,
    },
  },
};

// Mock config with multiple repositories
const MOCK_MULTI_REPO_CONFIG = {
  catalog: {
    providers: {
      rhaap: {
        development: {
          orgs: 'Default',
          sync: {
            pahCollections: {
              enabled: true,
              repositories: [
                {
                  name: 'validated',
                  schedule: {
                    frequency: { minutes: 60 },
                    timeout: { minutes: 15 },
                  },
                },
                {
                  name: 'rh-certified',
                  schedule: {
                    frequency: { minutes: 30 },
                    timeout: { minutes: 10 },
                  },
                },
              ],
            },
          },
        },
      },
    },
  },
  ansible: {
    rhaap: {
      baseUrl: 'https://pah.test',
      token: 'testtoken',
      checkSSL: false,
    },
  },
};

// Mock config with top-level schedule (applies to all repositories without individual schedules)
const MOCK_TOP_LEVEL_SCHEDULE_CONFIG = {
  catalog: {
    providers: {
      rhaap: {
        development: {
          orgs: 'Default',
          sync: {
            pahCollections: {
              enabled: true,
              schedule: {
                frequency: { minutes: 45 },
                timeout: { minutes: 10 },
              },
              repositories: [{ name: 'validated' }, { name: 'rh-certified' }],
            },
          },
        },
      },
    },
  },
  ansible: {
    rhaap: {
      baseUrl: 'https://pah.test',
      token: 'testtoken',
      checkSSL: false,
    },
  },
};

// Mock config with mixed schedules (some repos have individual, some use top-level)
const MOCK_MIXED_SCHEDULE_CONFIG = {
  catalog: {
    providers: {
      rhaap: {
        development: {
          orgs: 'Default',
          sync: {
            pahCollections: {
              enabled: true,
              schedule: {
                frequency: { minutes: 45 },
                timeout: { minutes: 10 },
              },
              repositories: [
                { name: 'validated' }, // Uses top-level schedule
                {
                  name: 'rh-certified',
                  schedule: {
                    frequency: { minutes: 30 },
                    timeout: { minutes: 5 },
                  },
                }, // Uses individual schedule
              ],
            },
          },
        },
      },
    },
  },
  ansible: {
    rhaap: {
      baseUrl: 'https://pah.test',
      token: 'testtoken',
      checkSSL: false,
    },
  },
};

// Mock collection data
const MOCK_COLLECTION: Collection = {
  namespace: 'ansible',
  name: 'posix',
  version: '1.5.4',
  dependencies: { 'ansible.builtin': '>=2.9' },
  description: 'POSIX collection for Ansible',
  tags: ['linux', 'posix'],
  repository_name: 'validated',
  collection_readme_html: '<h1>POSIX Collection</h1>',
  authors: ['Ansible Core Team'],
};

const MOCK_COLLECTION_2: Collection = {
  namespace: 'cisco',
  name: 'ios',
  version: '4.6.1',
  dependencies: { 'ansible.netcommon': '>=2.0' },
  description: 'Cisco IOS collection',
  tags: ['networking', 'cisco'],
  repository_name: 'validated',
  collection_readme_html: '<h1>Cisco IOS Collection</h1>',
  authors: ['Cisco'],
};

describe('PAHCollectionProvider', () => {
  let mockTaskRunner: jest.Mocked<SchedulerServiceTaskRunner>;
  let mockConnection: jest.Mocked<EntityProviderConnection>;
  let capturedTask: SchedulerServiceTaskInvocationDefinition | undefined;

  beforeEach(() => {
    jest.clearAllMocks();

    mockTaskRunner = {
      run: jest.fn().mockImplementation(async task => {
        capturedTask = task;
      }),
    };

    mockConnection = {
      applyMutation: jest.fn(),
      refresh: jest.fn(),
    } as unknown as jest.Mocked<EntityProviderConnection>;
  });

  describe('fromConfig', () => {
    it('should create providers from config', () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers).toHaveLength(1);
      expect(providers[0].getProviderName()).toBe(
        'PAHCollectionProvider:development:validated',
      );
    });

    it('should create multiple providers for multiple repositories', () => {
      const config = new ConfigReader(MOCK_MULTI_REPO_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers).toHaveLength(2);
      expect(providers[0].getProviderName()).toBe(
        'PAHCollectionProvider:development:validated',
      );
      expect(providers[1].getProviderName()).toBe(
        'PAHCollectionProvider:development:rh-certified',
      );
    });

    it('should create providers using top-level schedule when repositories have no individual schedules', () => {
      const config = new ConfigReader(MOCK_TOP_LEVEL_SCHEDULE_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          scheduler: {
            createScheduledTaskRunner: jest
              .fn()
              .mockReturnValue(mockTaskRunner),
          } as any,
        },
      );

      expect(providers).toHaveLength(2);
      expect(providers[0].getProviderName()).toBe(
        'PAHCollectionProvider:development:validated',
      );
      expect(providers[1].getProviderName()).toBe(
        'PAHCollectionProvider:development:rh-certified',
      );
    });

    it('should support mixed schedules (top-level and individual)', () => {
      const config = new ConfigReader(MOCK_MIXED_SCHEDULE_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          scheduler: {
            createScheduledTaskRunner: jest
              .fn()
              .mockReturnValue(mockTaskRunner),
          } as any,
        },
      );

      expect(providers).toHaveLength(2);
      expect(providers[0].getProviderName()).toBe(
        'PAHCollectionProvider:development:validated',
      );
      expect(providers[1].getProviderName()).toBe(
        'PAHCollectionProvider:development:rh-certified',
      );
    });

    it('should throw error when no schedule is provided in config', () => {
      const configWithoutSchedule = {
        catalog: {
          providers: {
            rhaap: {
              development: {
                orgs: 'Default',
                sync: {
                  pahCollections: {
                    enabled: true,
                    repositories: [{ name: 'validated' }],
                  },
                },
              },
            },
          },
        },
        ansible: {
          rhaap: {
            baseUrl: 'https://pah.test',
            token: 'testtoken',
            checkSSL: false,
          },
        },
      };

      const config = new ConfigReader(configWithoutSchedule);
      const logger = mockServices.logger.mock();

      // Provider throws when no schedule is available (neither top-level nor repository-specific)
      expect(() =>
        PAHCollectionProvider.fromConfig(config, mockAnsibleService, {
          logger,
        }),
      ).toThrow(
        'No schedule provided via config for PAH Collection Provider: validated.',
      );
    });

    it('should return empty array when pahCollections is disabled', () => {
      const disabledConfig = {
        catalog: {
          providers: {
            rhaap: {
              development: {
                orgs: 'Default',
                sync: {
                  pahCollections: {
                    enabled: false,
                    repositories: [{ name: 'validated' }],
                  },
                },
              },
            },
          },
        },
        ansible: {
          rhaap: {
            baseUrl: 'https://pah.test',
            token: 'testtoken',
            checkSSL: false,
          },
        },
      };

      const config = new ConfigReader(disabledConfig);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers).toHaveLength(0);
    });

    it('should return empty array when no rhaap config exists', () => {
      const emptyConfig = {
        catalog: {
          providers: {},
        },
        ansible: {
          rhaap: {
            baseUrl: 'https://pah.test',
            token: 'testtoken',
            checkSSL: false,
          },
        },
      };

      const config = new ConfigReader(emptyConfig);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers).toHaveLength(0);
    });

    it('should return empty array when repositories array is empty', () => {
      const emptyReposConfig = {
        catalog: {
          providers: {
            rhaap: {
              development: {
                orgs: 'Default',
                sync: {
                  pahCollections: {
                    enabled: true,
                    repositories: [],
                  },
                },
              },
            },
          },
        },
        ansible: {
          rhaap: {
            baseUrl: 'https://pah.test',
            token: 'testtoken',
            checkSSL: false,
          },
        },
      };

      const config = new ConfigReader(emptyReposConfig);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers).toHaveLength(0);
    });

    it('should return empty array when pahCollections sync config is missing', () => {
      const noSyncConfig = {
        catalog: {
          providers: {
            rhaap: {
              development: {
                orgs: 'Default',
                // No sync config at all
              },
            },
          },
        },
        ansible: {
          rhaap: {
            baseUrl: 'https://pah.test',
            token: 'testtoken',
            checkSSL: false,
          },
        },
      };

      const config = new ConfigReader(noSyncConfig);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers).toHaveLength(0);
    });
  });

  describe('getProviderName', () => {
    it('should return provider name with env and repository', () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers[0].getProviderName()).toBe(
        'PAHCollectionProvider:development:validated',
      );
    });
  });

  describe('getPahRepositoryName', () => {
    it('should return the PAH repository name', () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers[0].getPahRepositoryName()).toBe('validated');
    });
  });

  describe('getLastSyncTime', () => {
    it('should return null before first sync', () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers[0].getLastSyncTime()).toBeNull();
    });

    it('should return timestamp after successful sync', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // Simulate sync
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
      ]);

      const result = await provider.run();

      expect(result.success).toBe(true);
      expect(provider.getLastSyncTime()).not.toBeNull();
      expect(
        new Date(provider.getLastSyncTime()!).getTime(),
      ).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('connect', () => {
    it('should store connection and schedule task', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      await providers[0].connect(mockConnection);

      expect(mockTaskRunner.run).toHaveBeenCalled();
      expect(capturedTask?.id).toBe(
        'PAHCollectionProvider:development:validated:run',
      );
    });
  });

  describe('run', () => {
    it('should throw error if not connected', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      await expect(providers[0].run()).rejects.toThrow(
        'PAHCollectionProvider not connected',
      );
    });

    it('should sync collections and apply mutations', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
        MOCK_COLLECTION_2,
      ]);

      const result = await provider.run();

      expect(result.success).toBe(true);
      expect(result.collectionsCount).toBe(2);
      expect(
        mockAnsibleService.syncCollectionsByRepositories,
      ).toHaveBeenCalledWith(['validated'], 100, undefined);
      expect(mockConnection.applyMutation).toHaveBeenCalledWith({
        type: 'full',
        entities: expect.arrayContaining([
          expect.objectContaining({
            entity: expect.objectContaining({
              kind: 'Component',
              spec: expect.objectContaining({
                type: 'ansible-collection',
              }),
            }),
            locationKey: 'PAHCollectionProvider:development:validated',
          }),
        ]),
      });
    });

    it('should return empty collections count when no collections found', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([]);

      const result = await provider.run();

      expect(result.success).toBe(true);
      expect(result.collectionsCount).toBe(0);
      expect(mockConnection.applyMutation).toHaveBeenCalledWith({
        type: 'full',
        entities: [],
      });
    });

    it('should return success false and skip sync when AbortSignal is already aborted', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      const controller = new AbortController();
      controller.abort();

      const result = await provider.run(controller.signal);

      expect(result.success).toBe(false);
      expect(result.collectionsCount).toBe(0);
      expect(
        mockAnsibleService.syncCollectionsByRepositories,
      ).not.toHaveBeenCalled();
      expect(mockConnection.applyMutation).not.toHaveBeenCalled();
    });

    it('should handle errors from syncCollectionsByRepositories', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(
        new Error('API Error'),
      );

      const result = await provider.run();

      expect(result.success).toBe(false);
      expect(result.collectionsCount).toBe(0);
      expect(mockConnection.applyMutation).not.toHaveBeenCalled();
    });

    it('should not update lastSyncTime on error', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(
        new Error('API Error'),
      );

      await provider.run();

      expect(provider.getLastSyncTime()).toBeNull();
    });

    it('should set lastSyncStatus to failure when fetching collections fails', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(
        new Error('Network error while fetching collections'),
      );

      const result = await provider.run();

      expect(result.success).toBe(false);
      expect(provider.getLastSyncStatus()).toBe('failure');
      expect(provider.getLastFailedSyncTime()).not.toBeNull();
    });

    it('should set lastSyncStatus to failure when applyMutation fails', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
      ]);
      mockConnection.applyMutation.mockRejectedValue(
        new Error('Catalog mutation failed'),
      );

      const result = await provider.run();

      expect(result.success).toBe(false);
      expect(result.collectionsCount).toBe(0);
      expect(provider.getLastSyncStatus()).toBe('failure');
      expect(provider.getLastFailedSyncTime()).not.toBeNull();
      expect(provider.getLastSyncTime()).toBeNull();
    });

    it('should reset isSyncing to false after fetch error', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(
        new Error('Fetch failed'),
      );

      expect(provider.getIsSyncing()).toBe(false);
      const runPromise = provider.run();
      // Note: isSyncing is set synchronously at start of run()
      await runPromise;
      expect(provider.getIsSyncing()).toBe(false);
    });

    it('should reset isSyncing to false after mutation error', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
      ]);
      mockConnection.applyMutation.mockRejectedValue(
        new Error('Mutation failed'),
      );

      await provider.run();

      expect(provider.getIsSyncing()).toBe(false);
    });

    it('should return failure result when sync fails during fetch', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(
        new Error('Connection timeout'),
      );

      const result = await provider.run();

      expect(result.success).toBe(false);
      expect(result.collectionsCount).toBe(0);
      expect(provider.getLastSyncStatus()).toBe('failure');
    });

    it('should return failure result when sync fails during mutation', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
      ]);
      mockConnection.applyMutation.mockRejectedValue(
        new Error('Database write failed'),
      );

      const result = await provider.run();

      expect(result.success).toBe(false);
      expect(result.collectionsCount).toBe(0);
      expect(provider.getLastSyncStatus()).toBe('failure');
    });

    it('should handle error without message gracefully', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // Throw an error without a message
      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue({});

      const result = await provider.run();

      expect(result.success).toBe(false);
      expect(provider.getLastSyncStatus()).toBe('failure');
    });

    it('should set failure status when pahCollectionParser throws during normalization', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
      ]);

      // Mock pahCollectionParser to throw an error
      const mockedParser = pahCollectionParser as jest.MockedFunction<
        typeof pahCollectionParser
      >;
      mockedParser.mockImplementationOnce(() => {
        throw new Error('Invalid collection data: missing required field');
      });

      const result = await provider.run();

      expect(result.success).toBe(false);
      expect(result.collectionsCount).toBe(0);
      expect(provider.getLastSyncStatus()).toBe('failure');
      expect(provider.getLastFailedSyncTime()).not.toBeNull();
      expect(provider.getIsSyncing()).toBe(false);
      expect(mockConnection.applyMutation).not.toHaveBeenCalled();
    });

    it('should create entities with correct locationKey', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
      ]);

      await provider.run();

      expect(mockConnection.applyMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          entities: [
            expect.objectContaining({
              locationKey: 'PAHCollectionProvider:development:validated',
            }),
          ],
        }),
      );
    });

    it('should handle null response from syncCollectionsByRepositories', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // Return null/undefined from the API
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue(
        null as any,
      );

      // Should handle gracefully (will likely throw when iterating)
      const result = await provider.run();

      expect(result.success).toBe(false);
      expect(provider.getLastSyncStatus()).toBe('failure');
    });

    it('should handle timeout errors from syncCollectionsByRepositories', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      const timeoutError = new Error('Request timeout after 30000ms');
      timeoutError.name = 'TimeoutError';
      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(
        timeoutError,
      );

      const result = await provider.run();

      expect(result.success).toBe(false);
      expect(result.collectionsCount).toBe(0);
      expect(provider.getLastSyncStatus()).toBe('failure');
      expect(provider.getLastFailedSyncTime()).not.toBeNull();
    });

    it('should handle network errors from syncCollectionsByRepositories', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      const networkError = new Error('ECONNREFUSED');
      networkError.name = 'NetworkError';
      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(
        networkError,
      );

      const result = await provider.run();

      expect(result.success).toBe(false);
      expect(provider.getLastSyncStatus()).toBe('failure');
    });

    it('should handle 401 unauthorized errors', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      const authError = new Error('Unauthorized: Invalid token');
      (authError as any).status = 401;
      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(
        authError,
      );

      const result = await provider.run();

      expect(result.success).toBe(false);
      expect(provider.getLastSyncStatus()).toBe('failure');
    });

    it('should handle 500 server errors', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      const serverError = new Error('Internal Server Error');
      (serverError as any).status = 500;
      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(
        serverError,
      );

      const result = await provider.run();

      expect(result.success).toBe(false);
      expect(provider.getLastSyncStatus()).toBe('failure');
    });

    it('should not modify state on consecutive failures', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // First failure
      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(
        new Error('First error'),
      );
      await provider.run();
      const firstFailedTime = provider.getLastFailedSyncTime();

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second failure
      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(
        new Error('Second error'),
      );
      await provider.run();
      const secondFailedTime = provider.getLastFailedSyncTime();

      expect(provider.getLastSyncStatus()).toBe('failure');
      expect(provider.getLastSyncTime()).toBeNull();
      // Second failure should have updated the timestamp
      expect(secondFailedTime).not.toBe(firstFailedTime);
    });

    it('should recover from failure on subsequent successful sync', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // First: failure
      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(
        new Error('API Error'),
      );
      await provider.run();
      expect(provider.getLastSyncStatus()).toBe('failure');
      expect(provider.getLastFailedSyncTime()).not.toBeNull();
      expect(provider.getLastSyncTime()).toBeNull();

      // Second: success
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
      ]);
      await provider.run();

      expect(provider.getLastSyncStatus()).toBe('success');
      expect(provider.getLastSyncTime()).not.toBeNull();
      expect(provider.getCurrentCollectionsCount()).toBe(1);
    });

    it('should handle collections with missing optional fields', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // Collection with empty/default values for optional-like fields
      const minimalCollection: Collection = {
        namespace: 'test',
        name: 'minimal',
        version: '1.0.0',
        repository_name: 'validated',
        dependencies: {},
        description: '',
        tags: [],
        collection_readme_html: '',
        authors: [],
      };

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        minimalCollection,
      ]);

      const result = await provider.run();

      expect(result.success).toBe(true);
      expect(result.collectionsCount).toBe(1);
    });

    it('should handle very large collection arrays', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // Create array with many collections
      const largeCollectionArray: Collection[] = Array.from(
        { length: 100 },
        (_, i) => ({
          namespace: 'test',
          name: `collection-${i}`,
          version: '1.0.0',
          repository_name: 'validated',
          dependencies: {},
          description: `Test collection ${i}`,
          tags: [],
          collection_readme_html: '',
          authors: [],
        }),
      );

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue(
        largeCollectionArray,
      );

      const result = await provider.run();

      expect(result.success).toBe(true);
      expect(result.collectionsCount).toBe(100);
      expect(mockConnection.applyMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          entities: expect.arrayContaining([
            expect.objectContaining({
              locationKey: 'PAHCollectionProvider:development:validated',
            }),
          ]),
        }),
      );
    });
  });

  describe('scheduled task execution', () => {
    it('should execute run when scheduled task is triggered', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
      ]);

      // Execute the captured task function
      expect(capturedTask).toBeDefined();
      await capturedTask!.fn(new AbortController().signal);

      expect(
        mockAnsibleService.syncCollectionsByRepositories,
      ).toHaveBeenCalled();
      expect(mockConnection.applyMutation).toHaveBeenCalled();
    });

    it('should handle errors during scheduled execution gracefully', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      const error = new Error('Scheduled task error');
      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(error);

      // Execute the captured task function - should not throw
      expect(capturedTask).toBeDefined();
      await expect(
        capturedTask!.fn(new AbortController().signal),
      ).resolves.not.toThrow();
    });
  });

  describe('entity generation', () => {
    it('should generate correct entity metadata', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
      ]);

      await provider.run();

      const mutation = mockConnection.applyMutation.mock.calls[0][0] as {
        type: 'full';
        entities: Array<{ entity: any; locationKey: string }>;
      };
      expect(mutation.type).toBe('full');
      expect(mutation.entities).toHaveLength(1);

      const entity = mutation.entities[0].entity;
      expect(entity.metadata.name).toBe('pah-validated-ansible.posix-1.5.4');
      expect(entity.metadata.title).toBe('ansible.posix v1.5.4');
      expect(entity.spec.collection_namespace).toBe('ansible');
      expect(entity.spec.collection_name).toBe('posix');
    });
  });

  describe('getLastFailedSyncTime', () => {
    it('should return null before any sync', () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers[0].getLastFailedSyncTime()).toBeNull();
    });

    it('should return timestamp after a failed sync', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(
        new Error('API Error'),
      );

      await provider.run();

      expect(provider.getLastFailedSyncTime()).not.toBeNull();
      expect(
        new Date(provider.getLastFailedSyncTime()!).getTime(),
      ).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('getLastSyncStatus', () => {
    it('should return null before any sync', () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers[0].getLastSyncStatus()).toBeNull();
    });

    it('should return success after successful sync', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
      ]);

      await provider.run();

      expect(provider.getLastSyncStatus()).toBe('success');
    });

    it('should return failure after failed sync', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockRejectedValue(
        new Error('API Error'),
      );

      await provider.run();

      expect(provider.getLastSyncStatus()).toBe('failure');
    });
  });

  describe('getCurrentCollectionsCount and getCollectionsDelta', () => {
    it('should return 0 before any sync', () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers[0].getCurrentCollectionsCount()).toBe(0);
      expect(providers[0].getCollectionsDelta()).toBe(0);
    });

    it('should return correct count after sync', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
        MOCK_COLLECTION_2,
      ]);

      await provider.run();

      expect(provider.getCurrentCollectionsCount()).toBe(2);
      // First sync: new = 2 - 0 = 2
      expect(provider.getCollectionsDelta()).toBe(2);
    });

    it('should track new collections across multiple syncs', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // First sync: 2 collections
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
        MOCK_COLLECTION_2,
      ]);
      await provider.run();
      expect(provider.getCurrentCollectionsCount()).toBe(2);
      expect(provider.getCollectionsDelta()).toBe(2);

      // Second sync: 3 collections (1 new)
      const MOCK_COLLECTION_3: Collection = {
        ...MOCK_COLLECTION,
        namespace: 'amazon',
        name: 'aws',
        version: '5.0.0',
      };
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
        MOCK_COLLECTION_2,
        MOCK_COLLECTION_3,
      ]);
      await provider.run();
      expect(provider.getCurrentCollectionsCount()).toBe(3);
      expect(provider.getCollectionsDelta()).toBe(1);
    });

    it('should return negative delta when collections are removed', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // First sync: 2 collections
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
        MOCK_COLLECTION_2,
      ]);
      await provider.run();

      // Second sync: 1 collection (1 collection removed)
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
      ]);
      await provider.run();

      expect(provider.getCurrentCollectionsCount()).toBe(1);
      // Delta should be -1 (1 - 2 = -1)
      expect(provider.getCollectionsDelta()).toBe(-1);
    });

    it('should return large negative delta when many collections are removed', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // First sync: 100 collections
      const manyCollections = Array.from({ length: 100 }, (_, i) => ({
        ...MOCK_COLLECTION,
        name: `collection-${i}`,
      }));
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue(
        manyCollections,
      );
      await provider.run();

      expect(provider.getCurrentCollectionsCount()).toBe(100);
      expect(provider.getCollectionsDelta()).toBe(100); // First run: 100 - 0 = 100

      // Second sync: only 25 collections (75 removed)
      const fewerCollections = Array.from({ length: 25 }, (_, i) => ({
        ...MOCK_COLLECTION,
        name: `collection-${i}`,
      }));
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue(
        fewerCollections,
      );
      await provider.run();

      expect(provider.getCurrentCollectionsCount()).toBe(25);
      // Delta should be -75 (25 - 100 = -75)
      expect(provider.getCollectionsDelta()).toBe(-75);
    });

    it('should return negative delta equal to previous count when all collections are removed', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // First sync: 10 collections
      const collections = Array.from({ length: 10 }, (_, i) => ({
        ...MOCK_COLLECTION,
        name: `collection-${i}`,
      }));
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue(
        collections,
      );
      await provider.run();

      expect(provider.getCurrentCollectionsCount()).toBe(10);

      // Second sync: 0 collections (all removed)
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([]);
      await provider.run();

      expect(provider.getCurrentCollectionsCount()).toBe(0);
      // Delta should be -10 (0 - 10 = -10)
      expect(provider.getCollectionsDelta()).toBe(-10);
    });

    it('should track delta correctly across multiple syncs with additions and removals', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // Run 1: 5 collections (delta: +5)
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({
          ...MOCK_COLLECTION,
          name: `col-${i}`,
        })),
      );
      await provider.run();
      expect(provider.getCurrentCollectionsCount()).toBe(5);
      expect(provider.getCollectionsDelta()).toBe(5);

      // Run 2: 8 collections (delta: +3)
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue(
        Array.from({ length: 8 }, (_, i) => ({
          ...MOCK_COLLECTION,
          name: `col-${i}`,
        })),
      );
      await provider.run();
      expect(provider.getCurrentCollectionsCount()).toBe(8);
      expect(provider.getCollectionsDelta()).toBe(3);

      // Run 3: 3 collections (delta: -5)
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue(
        Array.from({ length: 3 }, (_, i) => ({
          ...MOCK_COLLECTION,
          name: `col-${i}`,
        })),
      );
      await provider.run();
      expect(provider.getCurrentCollectionsCount()).toBe(3);
      expect(provider.getCollectionsDelta()).toBe(-5);

      // Run 4: 3 collections again (delta: 0)
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue(
        Array.from({ length: 3 }, (_, i) => ({
          ...MOCK_COLLECTION,
          name: `col-${i}`,
        })),
      );
      await provider.run();
      expect(provider.getCurrentCollectionsCount()).toBe(3);
      expect(provider.getCollectionsDelta()).toBe(0);

      // Run 5: 7 collections (delta: +4)
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue(
        Array.from({ length: 7 }, (_, i) => ({
          ...MOCK_COLLECTION,
          name: `col-${i}`,
        })),
      );
      await provider.run();
      expect(provider.getCurrentCollectionsCount()).toBe(7);
      expect(provider.getCollectionsDelta()).toBe(4);
    });
  });

  describe('getSourceId', () => {
    it('should return correct source ID format', () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers[0].getSourceId()).toBe('development:pah:validated');
    });

    it('should include repository name in source ID', () => {
      const config = new ConfigReader(MOCK_MULTI_REPO_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers[0].getSourceId()).toBe('development:pah:validated');
      expect(providers[1].getSourceId()).toBe('development:pah:rh-certified');
    });
  });

  describe('isEnabled', () => {
    it('should return true when pahCollections is enabled in config', () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers[0].isEnabled()).toBe(true);
    });
  });

  describe('getIsSyncing', () => {
    it('should return false when not syncing', () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      expect(providers[0].getIsSyncing()).toBe(false);
    });

    it('should return false after sync completes', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
      ]);

      await provider.run();

      expect(provider.getIsSyncing()).toBe(false);
    });
  });

  describe('startSync', () => {
    it('should return started true when sync starts successfully', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
      ]);

      const result = provider.startSync();

      expect(result.started).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should return skipped true when sync is already in progress', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // Create a promise that won't resolve immediately
      let resolveSync: () => void;
      const syncPromise = new Promise<Collection[]>(resolve => {
        resolveSync = () => resolve([MOCK_COLLECTION]);
      });
      mockAnsibleService.syncCollectionsByRepositories.mockReturnValue(
        syncPromise,
      );

      // Start first sync
      provider.startSync();

      // Try to start another sync while first is in progress
      const result = provider.startSync();

      expect(result.started).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.error).toBeUndefined();

      // Cleanup: resolve the pending sync
      resolveSync!();
    });

    it('should return error when provider is not connected', () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      // Don't call connect()
      const result = providers[0].startSync();

      expect(result.started).toBe(false);
      expect(result.skipped).toBe(false);
      expect(result.error).toBe('Provider not connected');
    });
  });

  describe('delayed failure scenarios', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should correctly set failure status when sync fails after a delay', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // Verify initial state
      expect(provider.getLastSyncStatus()).toBeNull();
      expect(provider.getLastFailedSyncTime()).toBeNull();
      expect(provider.getIsSyncing()).toBe(false);

      // Mock a delayed failure (simulating a 30-second operation that fails)
      mockAnsibleService.syncCollectionsByRepositories.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Connection timeout after 30 seconds'));
            }, 30000);
          }),
      );

      // Start the sync (don't await - we want to observe intermediate state)
      const syncPromise = provider.run();

      // Immediately after starting, isSyncing should be true
      expect(provider.getIsSyncing()).toBe(true);

      // Advance timers by 30 seconds to trigger the rejection
      await jest.advanceTimersByTimeAsync(30000);

      // Wait for the promise to settle
      await syncPromise;

      // Verify failure state after delayed error
      expect(provider.getIsSyncing()).toBe(false);
      expect(provider.getLastSyncStatus()).toBe('failure');
      expect(provider.getLastFailedSyncTime()).not.toBeNull();
      expect(provider.getLastSyncTime()).toBeNull(); // Should not be updated on failure
      expect(provider.getCurrentCollectionsCount()).toBe(0); // Should not be updated on failure
      expect(provider.getCollectionsDelta()).toBe(0); // No change since no successful sync
    });

    it('should correctly set failure status when sync fails during entity parsing after delay', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // Mock a delayed successful fetch, but parser will fail
      mockAnsibleService.syncCollectionsByRepositories.mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => {
              resolve([MOCK_COLLECTION]);
            }, 15000);
          }),
      );

      // Mock parser to throw after fetch succeeds
      (pahCollectionParser as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to parse collection data');
      });

      const syncPromise = provider.run();

      // Verify sync is in progress
      expect(provider.getIsSyncing()).toBe(true);

      // Advance timers to trigger the fetch completion
      await jest.advanceTimersByTimeAsync(15000);

      await syncPromise;

      // Verify failure state
      expect(provider.getIsSyncing()).toBe(false);
      expect(provider.getLastSyncStatus()).toBe('failure');
      expect(provider.getLastFailedSyncTime()).not.toBeNull();
    });

    it('should correctly set failure status when applyMutation fails after delay', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // Mock a delayed successful fetch
      mockAnsibleService.syncCollectionsByRepositories.mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => {
              resolve([MOCK_COLLECTION]);
            }, 10000);
          }),
      );

      // Reset parser mock to work correctly
      (pahCollectionParser as jest.Mock).mockReturnValue({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'test-collection' },
        spec: { type: 'ansible-collection', lifecycle: 'production' },
      });

      // Mock applyMutation to fail after a delay
      mockConnection.applyMutation.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Database connection lost'));
            }, 5000);
          }),
      );

      const syncPromise = provider.run();

      expect(provider.getIsSyncing()).toBe(true);

      // Advance timers for fetch (10s)
      await jest.advanceTimersByTimeAsync(10000);
      // Advance timers for mutation failure (5s)
      await jest.advanceTimersByTimeAsync(5000);

      await syncPromise;

      // Verify failure state
      expect(provider.getIsSyncing()).toBe(false);
      expect(provider.getLastSyncStatus()).toBe('failure');
      expect(provider.getLastFailedSyncTime()).not.toBeNull();
      expect(provider.getLastSyncTime()).toBeNull();
    });

    it('should preserve previous successful sync data when delayed sync fails', async () => {
      const config = new ConfigReader(MOCK_PAH_CONFIG);
      const logger = mockServices.logger.mock();

      const providers = PAHCollectionProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule: mockTaskRunner,
        },
      );

      const provider = providers[0];
      await provider.connect(mockConnection);

      // First sync: successful with 2 collections
      mockAnsibleService.syncCollectionsByRepositories.mockResolvedValue([
        MOCK_COLLECTION,
        MOCK_COLLECTION_2,
      ]);
      (pahCollectionParser as jest.Mock).mockReturnValue({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'test-collection' },
        spec: { type: 'ansible-collection', lifecycle: 'production' },
      });
      mockConnection.applyMutation.mockResolvedValue(undefined);

      await provider.run();

      const firstSyncTime = provider.getLastSyncTime();
      expect(provider.getLastSyncStatus()).toBe('success');
      expect(provider.getCurrentCollectionsCount()).toBe(2);

      // Second sync: delayed failure
      mockAnsibleService.syncCollectionsByRepositories.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Service unavailable'));
            }, 20000);
          }),
      );

      const syncPromise = provider.run();

      await jest.advanceTimersByTimeAsync(20000);

      await syncPromise;

      // Verify: failure status is set but previous successful data is preserved
      expect(provider.getLastSyncStatus()).toBe('failure');
      expect(provider.getLastFailedSyncTime()).not.toBeNull();
      // Previous successful sync time should still be available
      expect(provider.getLastSyncTime()).toBe(firstSyncTime);
      // Collection count from last successful sync should be preserved
      expect(provider.getCurrentCollectionsCount()).toBe(2);
    });
  });
});
