import { ConfigReader } from '@backstage/config';
import {
  SchedulerServiceTaskInvocationDefinition,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import { mockServices } from '@backstage/backend-test-utils';
import { EntityProviderConnection } from '@backstage/plugin-catalog-node';
import { PAHCollectionProvider } from './PAHCollectionProvider';
import { mockAnsibleService } from '../mock/mockIAAPService';
import { ICollection } from '@ansible/backstage-rhaap-common';

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
const MOCK_COLLECTION: ICollection = {
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

const MOCK_COLLECTION_2: ICollection = {
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
      ).toHaveBeenCalledWith(['validated']);
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
      await capturedTask!.fn(jest.fn());

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
      await expect(capturedTask!.fn(jest.fn())).resolves.not.toThrow();
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

      const mutation = mockConnection.applyMutation.mock.calls[0][0];
      expect(mutation.type).toBe('full');
      expect(mutation.entities).toHaveLength(1);

      const entity = mutation.entities[0].entity;
      expect(entity.metadata.name).toBe('pah-validated-ansible.posix-1.5.4');
      expect(entity.metadata.title).toBe('ansible.posix v1.5.4');
      expect(entity.spec.collection_namespace).toBe('ansible');
      expect(entity.spec.collection_name).toBe('posix');
    });
  });
});
