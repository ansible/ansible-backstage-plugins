/*
 * Copyright 2025 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

jest.mock('@ansible/backstage-rhaap-common', () => {
  const actual = jest.requireActual('@ansible/backstage-rhaap-common');
  return {
    ...actual,
    ScmClientFactory: jest.fn().mockImplementation(() => ({
      createClient: jest.fn().mockResolvedValue({
        getFileContent: jest.fn().mockResolvedValue('# README content'),
      }),
    })),
  };
});

import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import { AAPEntityProvider } from './providers/AAPEntityProvider';
import { AAPJobTemplateProvider } from './providers/AAPJobTemplateProvider';
import { EEEntityProvider } from './providers/EEEntityProvider';
import { PAHCollectionProvider } from './providers/PAHCollectionProvider';
import type { AnsibleGitContentsProvider } from './providers/AnsibleGitContentsProvider';
import { LoggerService } from '@backstage/backend-plugin-api';
import { ConfigReader } from '@backstage/config';

function createMockGitContentsProvider(
  overrides: {
    sourceId?: string;
    startSync?: () => { started: boolean; skipped?: boolean; error?: string };
  } = {},
): jest.Mocked<AnsibleGitContentsProvider> {
  const sourceId = overrides.sourceId ?? 'dev:github:github.com:my-org';
  return {
    getSourceId: jest.fn().mockReturnValue(sourceId),
    getProviderName: jest.fn().mockReturnValue('Git Contents'),
    getIsSyncing: jest.fn().mockReturnValue(false),
    getLastSyncTime: jest.fn().mockReturnValue(null),
    getLastFailedSyncTime: jest.fn().mockReturnValue(null),
    getLastSyncStatus: jest.fn().mockReturnValue(null),
    getCurrentCollectionsCount: jest.fn().mockReturnValue(0),
    getCollectionsDelta: jest.fn().mockReturnValue(0),
    isEnabled: jest.fn().mockReturnValue(true),
    startSync: jest
      .fn()
      .mockReturnValue(
        overrides.startSync?.() ?? { started: true, skipped: false },
      ),
    ...overrides,
  } as unknown as jest.Mocked<AnsibleGitContentsProvider>;
}

describe('createRouter', () => {
  let app: express.Express;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockAAPEntityProvider: jest.Mocked<AAPEntityProvider>;
  let mockJobTemplateProvider: jest.Mocked<AAPJobTemplateProvider>;
  let mockEEEntityProvider: jest.Mocked<EEEntityProvider>;
  let mockPAHCollectionProvider: jest.Mocked<PAHCollectionProvider>;

  const mockConfig = new ConfigReader({
    integrations: {
      github: [{ host: 'github.com', token: 'test-token' }],
      gitlab: [{ host: 'gitlab.com', token: 'test-token' }],
    },
  });

  beforeEach(async () => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<LoggerService>;

    mockAAPEntityProvider = {
      run: jest.fn(),
      getProviderName: jest.fn().mockReturnValue('AapEntityProvider:test'),
      connect: jest.fn(),
      getLastSyncTime: jest.fn(),
    } as unknown as jest.Mocked<AAPEntityProvider>;

    mockJobTemplateProvider = {
      run: jest.fn(),
      getProviderName: jest.fn().mockReturnValue('AAPJobTemplateProvider:test'),
      connect: jest.fn(),
      getLastSyncTime: jest.fn(),
    } as unknown as jest.Mocked<AAPJobTemplateProvider>;

    mockEEEntityProvider = {
      registerExecutionEnvironment: jest.fn(),
      getProviderName: jest.fn().mockReturnValue('EEEntityProvider:test'),
      connect: jest.fn(),
    } as unknown as jest.Mocked<EEEntityProvider>;

    mockPAHCollectionProvider = {
      run: jest.fn(),
      startSync: jest.fn().mockReturnValue({ started: true, skipped: false }),
      getProviderName: jest.fn().mockReturnValue('PAHCollectionProvider:test'),
      getPahRepositoryName: jest.fn().mockReturnValue('validated'),
      connect: jest.fn(),
      getLastSyncTime: jest.fn().mockReturnValue(null),
      getLastFailedSyncTime: jest.fn().mockReturnValue(null),
      getLastSyncStatus: jest.fn().mockReturnValue(null),
      getCurrentCollectionsCount: jest.fn().mockReturnValue(0),
      getCollectionsDelta: jest.fn().mockReturnValue(0),
      getIsSyncing: jest.fn().mockReturnValue(false),
      getSourceId: jest.fn().mockReturnValue('test:pah:validated'),
      isEnabled: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<PAHCollectionProvider>;

    const router = await createRouter({
      logger: mockLogger,
      config: mockConfig,
      aapEntityProvider: mockAAPEntityProvider,
      jobTemplateProvider: mockJobTemplateProvider,
      eeEntityProvider: mockEEEntityProvider,
      pahCollectionProviders: [mockPAHCollectionProvider],
    });

    app = express().use(router);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return ok status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
      expect(mockLogger.info).toHaveBeenCalledWith('PONG!');
    });
  });

  describe('GET /aap/sync_orgs_users_teams', () => {
    it('should call aapEntityProvider.run and return 200 when successful', async () => {
      mockAAPEntityProvider.run.mockResolvedValue(true);

      const response = await request(app).get('/aap/sync_orgs_users_teams');

      expect(response.status).toBe(200);
      expect(response.body).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting orgs, users and teams sync',
      );
      expect(mockAAPEntityProvider.run).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when aapEntityProvider.run throws', async () => {
      const mockError = new Error('Sync failed');
      mockAAPEntityProvider.run.mockRejectedValue(mockError);

      const response = await request(app).get('/aap/sync_orgs_users_teams');

      expect(response.status).toBe(500);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting orgs, users and teams sync',
      );
      expect(mockAAPEntityProvider.run).toHaveBeenCalledTimes(1);
    });

    it('should handle boolean return value from aapEntityProvider.run', async () => {
      mockAAPEntityProvider.run.mockResolvedValue(true);

      const response = await request(app).get('/aap/sync_orgs_users_teams');

      expect(response.status).toBe(200);
      expect(response.body).toBe(true);
      expect(mockAAPEntityProvider.run).toHaveBeenCalledTimes(1);
    });

    it('should handle false return value from aapEntityProvider.run', async () => {
      mockAAPEntityProvider.run.mockResolvedValue(false);

      const response = await request(app).get('/aap/sync_orgs_users_teams');

      expect(response.status).toBe(200);
      expect(response.body).toBe(false);
      expect(mockAAPEntityProvider.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /aap/sync_job_templates', () => {
    it('should call jobTemplateProvider.run and return 200 when successful', async () => {
      mockJobTemplateProvider.run.mockResolvedValue(true);

      const response = await request(app).get('/aap/sync_job_templates');

      expect(response.status).toBe(200);
      expect(response.body).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting job templates sync',
      );
      expect(mockJobTemplateProvider.run).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when jobTemplateProvider.run throws', async () => {
      const mockError = new Error('Job template sync failed');
      mockJobTemplateProvider.run.mockRejectedValue(mockError);

      const response = await request(app).get('/aap/sync_job_templates');

      expect(response.status).toBe(500);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting job templates sync',
      );
      expect(mockJobTemplateProvider.run).toHaveBeenCalledTimes(1);
    });

    it('should handle boolean return value from jobTemplateProvider.run', async () => {
      mockJobTemplateProvider.run.mockResolvedValue(true);

      const response = await request(app).get('/aap/sync_job_templates');

      expect(response.status).toBe(200);
      expect(response.body).toBe(true);
      expect(mockJobTemplateProvider.run).toHaveBeenCalledTimes(1);
    });

    it('should handle false return value from jobTemplateProvider.run', async () => {
      mockJobTemplateProvider.run.mockResolvedValue(false);

      const response = await request(app).get('/aap/sync_job_templates');

      expect(response.status).toBe(200);
      expect(response.body).toBe(false);
      expect(mockJobTemplateProvider.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /aap/create_user', () => {
    it('should successfully create a user', async () => {
      const mockCreateSingleUser = jest.fn().mockResolvedValue(true);
      const mockProvider = {
        createSingleUser: mockCreateSingleUser,
      };

      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
        }),
      );

      const response = await request(testApp)
        .post('/aap/create_user')
        .send({ username: 'testuser', userID: 123 })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        user: 'testuser',
        created: true,
      });
      expect(mockCreateSingleUser).toHaveBeenCalledWith('testuser', 123);
    });

    it('should return 400 when username and userID are missing', async () => {
      const mockProvider = {
        createSingleUser: jest.fn(),
      };

      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
        }),
      );

      const response = await request(testApp)
        .post('/aap/create_user')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        error: 'Missing username and user id in request body.',
      });
      expect(mockProvider.createSingleUser).not.toHaveBeenCalled();
    });

    it('should return 400 when only username is missing', async () => {
      const mockProvider = {
        createSingleUser: jest.fn(),
      };

      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
        }),
      );

      const response = await request(testApp)
        .post('/aap/create_user')
        .send({ userID: 123 })
        .expect(400);

      expect(response.body).toEqual({
        error: 'Missing username and user id in request body.',
      });
      expect(mockProvider.createSingleUser).not.toHaveBeenCalled();
    });

    it('should return 400 when only userID is missing', async () => {
      const mockProvider = {
        createSingleUser: jest.fn(),
      };

      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
        }),
      );

      const response = await request(testApp)
        .post('/aap/create_user')
        .send({ username: 'testuser' })
        .expect(400);

      expect(response.body).toEqual({
        error: 'Missing username and user id in request body.',
      });
      expect(mockProvider.createSingleUser).not.toHaveBeenCalled();
    });

    it('should handle createSingleUser failure with proper error response', async () => {
      const mockCreateSingleUser = jest
        .fn()
        .mockRejectedValue(new Error('User not found in AAP'));
      const mockProvider = {
        createSingleUser: mockCreateSingleUser,
      };

      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
        }),
      );

      const response = await request(testApp)
        .post('/aap/create_user')
        .send({ username: 'testuser', userID: 123 })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to create user: User not found in AAP',
      });
      expect(mockCreateSingleUser).toHaveBeenCalledWith('testuser', 123);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create user testuser: User not found in AAP',
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      const mockCreateSingleUser = jest.fn().mockRejectedValue('String error');
      const mockProvider = {
        createSingleUser: mockCreateSingleUser,
      };

      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
        }),
      );

      const response = await request(testApp)
        .post('/aap/create_user')
        .send({ username: 'testuser', userID: 123 })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to create user: String error',
      });
      expect(mockCreateSingleUser).toHaveBeenCalledWith('testuser', 123);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create user testuser: String error',
      );
    });

    it('should log info message when creating user', async () => {
      const mockCreateSingleUser = jest.fn().mockResolvedValue(true);
      const mockProvider = {
        createSingleUser: mockCreateSingleUser,
      };

      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
        }),
      );

      await request(testApp)
        .post('/aap/create_user')
        .send({ username: 'testuser', userID: 123 })
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating user testuser in catalog',
      );
    });

    it('should handle falsy userID (0) as valid', async () => {
      const mockCreateSingleUser = jest.fn().mockResolvedValue(true);
      const mockProvider = {
        createSingleUser: mockCreateSingleUser,
      };

      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
        }),
      );

      const response = await request(testApp)
        .post('/aap/create_user')
        .send({ username: 'admin', userID: 0 })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        user: 'admin',
        created: true,
      });
      expect(mockCreateSingleUser).toHaveBeenCalledWith('admin', 0);
    });

    it('should handle empty string username as invalid', async () => {
      const mockProvider = {
        createSingleUser: jest.fn(),
      };

      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
        }),
      );

      const response = await request(testApp)
        .post('/aap/create_user')
        .send({ username: '', userID: 123 })
        .expect(400);

      expect(response.body).toEqual({
        error: 'Missing username and user id in request body.',
      });
      expect(mockProvider.createSingleUser).not.toHaveBeenCalled();
    });
  });

  describe('POST /register_ee', () => {
    it('should successfully register an execution environment', async () => {
      const mockProvider = {};

      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
        }),
      );

      const mockEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-ee',
          title: 'test-ee',
          description: 'test-ee',
          tags: ['test-ee'],
          annotations: {
            'backstage.io/managed-by-location': `url:127.0.0.1`,
            'backstage.io/managed-by-origin-location': `url:127.0.0.1`,
            'ansible.io/download-experience': 'true',
          },
        },
        spec: {
          type: 'execution-environment',
          lifecycle: 'production',
          owner: 'team-a',
          definition: 'sample \ntest-ee \ndefinition',
          readme: 'sample \ntest-ee \nreadme',
        },
      };

      const response = await request(testApp)
        .post('/register_ee')
        .send({ entity: mockEntity })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
      });
      expect(
        mockEEEntityProvider.registerExecutionEnvironment,
      ).toHaveBeenCalledWith(mockEntity);
    });

    it('should return 400 when entity is missing', async () => {
      const mockProvider = {
        registerExecutionEnvironment: jest.fn(),
      };

      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
        }),
      );

      const response = await request(testApp)
        .post('/register_ee')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        error: 'Missing entity in request body.',
      });
      expect(mockProvider.registerExecutionEnvironment).not.toHaveBeenCalled();
    });

    it('should return 400 when entity is null', async () => {
      const mockProvider = {
        registerExecutionEnvironment: jest.fn(),
      };

      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
        }),
      );

      const response = await request(testApp)
        .post('/register_ee')
        .send({ entity: null })
        .expect(400);

      expect(response.body).toEqual({
        error: 'Missing entity in request body.',
      });
      expect(mockProvider.registerExecutionEnvironment).not.toHaveBeenCalled();
    });

    it('should handle registerExecutionEnvironment failure with proper error response', async () => {
      const mockProvider = {};

      mockEEEntityProvider.registerExecutionEnvironment = jest
        .fn()
        .mockRejectedValue(
          new Error(
            'Type [spec.type] must be "execution-environment" for Execution Environment registration',
          ),
        );

      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
        }),
      );

      const mockEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'test-ee' },
      };

      const response = await request(testApp)
        .post('/register_ee')
        .send({ entity: mockEntity })
        .expect(500);

      expect(response.body).toEqual({
        error:
          'Failed to register Execution Environment: Type [spec.type] must be "execution-environment" for Execution Environment registration',
      });
      expect(
        mockEEEntityProvider.registerExecutionEnvironment,
      ).toHaveBeenCalledWith(mockEntity);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to register Execution Environment: Type [spec.type] must be "execution-environment" for Execution Environment registration',
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      const mockProvider = {};

      mockEEEntityProvider.registerExecutionEnvironment = jest
        .fn()
        .mockRejectedValue(new Error('String error'));

      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
        }),
      );

      const mockEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'test-ee' },
      };

      const response = await request(testApp)
        .post('/register_ee')
        .send({ entity: mockEntity })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to register Execution Environment: String error',
      });
      expect(
        mockEEEntityProvider.registerExecutionEnvironment,
      ).toHaveBeenCalledWith(mockEntity);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to register Execution Environment: String error',
      );
    });
  });

  describe('GET /ansible/sync/status', () => {
    it('should return both aap and content status when no query params', async () => {
      mockAAPEntityProvider.getLastSyncTime.mockReturnValue(
        '2024-01-15T10:00:00Z',
      );
      mockJobTemplateProvider.getLastSyncTime.mockReturnValue(
        '2024-01-15T11:00:00Z',
      );
      mockPAHCollectionProvider.getLastSyncTime.mockReturnValue(
        '2024-01-15T12:00:00Z',
      );
      mockPAHCollectionProvider.getLastFailedSyncTime.mockReturnValue(null);
      mockPAHCollectionProvider.getLastSyncStatus.mockReturnValue('success');
      mockPAHCollectionProvider.getCurrentCollectionsCount.mockReturnValue(25);
      mockPAHCollectionProvider.getCollectionsDelta.mockReturnValue(5);
      mockPAHCollectionProvider.getIsSyncing.mockReturnValue(false);

      const response = await request(app).get('/ansible/sync/status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        aap: {
          orgsUsersTeams: { lastSync: '2024-01-15T10:00:00Z' },
          jobTemplates: { lastSync: '2024-01-15T11:00:00Z' },
        },
        content: {
          syncInProgress: false,
          providers: [
            {
              sourceId: 'test:pah:validated',
              repository: 'validated',
              providerName: 'PAHCollectionProvider:test',
              enabled: true,
              syncInProgress: false,
              lastSyncTime: '2024-01-15T12:00:00Z',
              lastFailedSyncTime: null,
              lastSyncStatus: 'success',
              collectionsFound: 25,
              collectionsDelta: 5,
            },
          ],
        },
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Getting sync status');
    });

    it('should return only aap status when aap_entities=true', async () => {
      mockAAPEntityProvider.getLastSyncTime.mockReturnValue(
        '2024-01-15T10:00:00Z',
      );
      mockJobTemplateProvider.getLastSyncTime.mockReturnValue(
        '2024-01-15T11:00:00Z',
      );

      const response = await request(app).get(
        '/ansible/sync/status?aap_entities=true',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        aap: {
          orgsUsersTeams: { lastSync: '2024-01-15T10:00:00Z' },
          jobTemplates: { lastSync: '2024-01-15T11:00:00Z' },
        },
      });
    });

    it('should return only content status when ansible_contents=true', async () => {
      mockPAHCollectionProvider.getLastSyncTime.mockReturnValue(
        '2024-01-15T12:00:00Z',
      );
      mockPAHCollectionProvider.getLastFailedSyncTime.mockReturnValue(
        '2024-01-15T13:00:00Z',
      );
      mockPAHCollectionProvider.getLastSyncStatus.mockReturnValue('failure');
      mockPAHCollectionProvider.getCurrentCollectionsCount.mockReturnValue(0);
      mockPAHCollectionProvider.getCollectionsDelta.mockReturnValue(0);
      mockPAHCollectionProvider.getIsSyncing.mockReturnValue(true);

      const response = await request(app).get(
        '/ansible/sync/status?ansible_contents=true',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        content: {
          syncInProgress: true,
          providers: [
            {
              sourceId: 'test:pah:validated',
              repository: 'validated',
              providerName: 'PAHCollectionProvider:test',
              enabled: true,
              syncInProgress: true,
              lastSyncTime: '2024-01-15T12:00:00Z',
              lastFailedSyncTime: '2024-01-15T13:00:00Z',
              lastSyncStatus: 'failure',
              collectionsFound: 0,
              collectionsDelta: 0,
            },
          ],
        },
      });
    });

    it('should return both when both query params are true', async () => {
      mockAAPEntityProvider.getLastSyncTime.mockReturnValue(
        '2024-01-15T10:00:00Z',
      );
      mockJobTemplateProvider.getLastSyncTime.mockReturnValue(
        '2024-01-15T11:00:00Z',
      );
      mockPAHCollectionProvider.getLastSyncTime.mockReturnValue(
        '2024-01-15T12:00:00Z',
      );
      mockPAHCollectionProvider.getLastFailedSyncTime.mockReturnValue(null);
      mockPAHCollectionProvider.getLastSyncStatus.mockReturnValue('success');
      mockPAHCollectionProvider.getCurrentCollectionsCount.mockReturnValue(10);
      mockPAHCollectionProvider.getCollectionsDelta.mockReturnValue(2);
      mockPAHCollectionProvider.getIsSyncing.mockReturnValue(false);

      const response = await request(app).get(
        '/ansible/sync/status?aap_entities=true&ansible_contents=true',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        aap: {
          orgsUsersTeams: { lastSync: '2024-01-15T10:00:00Z' },
          jobTemplates: { lastSync: '2024-01-15T11:00:00Z' },
        },
        content: {
          syncInProgress: false,
          providers: [
            {
              sourceId: 'test:pah:validated',
              repository: 'validated',
              providerName: 'PAHCollectionProvider:test',
              enabled: true,
              syncInProgress: false,
              lastSyncTime: '2024-01-15T12:00:00Z',
              lastFailedSyncTime: null,
              lastSyncStatus: 'success',
              collectionsFound: 10,
              collectionsDelta: 2,
            },
          ],
        },
      });
    });

    it('should handle errors when getLastSyncTime throws', async () => {
      const mockError = new Error('Failed to get sync time');
      mockAAPEntityProvider.getLastSyncTime.mockImplementation(() => {
        throw mockError;
      });
      mockJobTemplateProvider.getLastSyncTime.mockReturnValue(null);

      const response = await request(app).get(
        '/ansible/sync/status?aap_entities=true',
      );

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to get sync status: Failed to get sync time',
        aap: {
          orgsUsersTeams: null,
          jobTemplates: null,
        },
        content: null,
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get sync status: Failed to get sync time',
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockAAPEntityProvider.getLastSyncTime.mockImplementation(() => {
        throw new Error('String error');
      });
      mockJobTemplateProvider.getLastSyncTime.mockReturnValue(null);

      const response = await request(app).get(
        '/ansible/sync/status?aap_entities=true',
      );

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to get sync status: String error',
        aap: {
          orgsUsersTeams: null,
          jobTemplates: null,
        },
        content: null,
      });
    });
  });

  describe('GET /ansible/sync/status with ansible_contents', () => {
    it('should register providers in map and return content.providers when ansible_contents=true', async () => {
      const mockGitProvider = createMockGitContentsProvider({
        sourceId: 'dev:github:github.com:my-org',
      });
      mockGitProvider.getLastSyncTime.mockReturnValue('2024-06-01T12:00:00Z');
      mockGitProvider.getIsSyncing.mockReturnValue(false);

      const testApp = express().use(
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockAAPEntityProvider,
          jobTemplateProvider: mockJobTemplateProvider,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [],
          ansibleGitContentsProviders: [mockGitProvider],
        }),
      );

      const response = await request(testApp).get(
        '/ansible/sync/status?ansible_contents=true',
      );

      expect(response.status).toBe(200);
      expect(response.body.content).toBeDefined();
      expect(response.body.content.providers).toHaveLength(1);
      expect(response.body.content.providers[0]).toMatchObject({
        sourceId: 'dev:github:github.com:my-org',
        scmProvider: 'github',
        hostName: 'github.com',
        organization: 'my-org',
        providerName: 'Git Contents',
        enabled: true,
        syncInProgress: false,
        lastSyncTime: '2024-06-01T12:00:00Z',
      });
      expect(response.body.content.syncInProgress).toBe(false);
    });

    it('should set syncInProgress true when any provider is syncing', async () => {
      const mockGitProvider = createMockGitContentsProvider();
      mockGitProvider.getIsSyncing.mockReturnValue(true);

      const testApp = express().use(
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockAAPEntityProvider,
          jobTemplateProvider: mockJobTemplateProvider,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [],
          ansibleGitContentsProviders: [mockGitProvider],
        }),
      );

      const response = await request(testApp).get(
        '/ansible/sync/status?ansible_contents=true',
      );

      expect(response.status).toBe(200);
      expect(response.body.content.syncInProgress).toBe(true);
    });
  });

  async function createAppWithSyncProviders(
    providers: jest.Mocked<AnsibleGitContentsProvider>[],
  ): Promise<express.Express> {
    const router = await createRouter({
      logger: mockLogger,
      config: mockConfig,
      aapEntityProvider: mockAAPEntityProvider,
      jobTemplateProvider: mockJobTemplateProvider,
      eeEntityProvider: mockEEEntityProvider,
      pahCollectionProviders: [],
      ansibleGitContentsProviders: providers,
    });
    return express().use(express.json()).use(router);
  }

  describe('POST /ansible/sync/from-scm/content', () => {
    it('should validate filters and return invalid results with status 400 when all invalid', async () => {
      const testApp = await createAppWithSyncProviders([]);

      const response = await request(testApp)
        .post('/ansible/sync/from-scm/content')
        .send({ filters: [{ hostName: 'only-host' }] }); // invalid: hostName without scmProvider

      expect(response.status).toBe(400);
      expect(response.body.summary).toMatchObject({
        total: 1,
        invalid: 1,
      });
      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0].status).toBe('invalid');
      expect(response.body.results[0].error?.code).toBe('INVALID_FILTER');
    });

    it('should sync all providers when filters is empty and log provider ids', async () => {
      const mockProvider = createMockGitContentsProvider({
        sourceId: 'dev:github:github.com:acme',
      });
      mockProvider.startSync.mockReturnValue({ started: true, skipped: false });

      const testApp = await createAppWithSyncProviders([mockProvider]);

      const response = await request(testApp)
        .post('/ansible/sync/from-scm/content')
        .send({ filters: [] });

      expect(response.status).toBe(202);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting Ansible Git Contents sync'),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('dev:github:github.com:acme'),
      );
      expect(response.body.summary.sync_started).toBe(1);
      expect(response.body.results[0].status).toBe('sync_started');
    });

    it('should return already_syncing when provider.startSync returns skipped', async () => {
      const mockProvider = createMockGitContentsProvider({
        sourceId: 'dev:gitlab:gitlab.com:mygroup',
      });
      mockProvider.startSync.mockReturnValue({
        started: false,
        skipped: true,
      });

      const testApp = await createAppWithSyncProviders([mockProvider]);

      const response = await request(testApp)
        .post('/ansible/sync/from-scm/content')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.results[0].status).toBe('already_syncing');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping sync for'),
      );
    });

    it('should return failed when provider.startSync returns !started and log error', async () => {
      const mockProvider = createMockGitContentsProvider({
        sourceId: 'dev:github:github.com:fail-org',
      });
      mockProvider.startSync.mockReturnValue({
        started: false,
        skipped: false,
        error: 'Connection refused',
      });

      const testApp = await createAppWithSyncProviders([mockProvider]);

      const response = await request(testApp)
        .post('/ansible/sync/from-scm/content')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.results[0].status).toBe('failed');
      expect(response.body.results[0].error?.message).toBe(
        'Connection refused',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start sync'),
      );
    });

    it('should use getProvidersFromFilters when valid filters match providers', async () => {
      const mockProvider = createMockGitContentsProvider({
        sourceId: 'dev:github:github.com:matched',
      });
      mockProvider.startSync.mockReturnValue({ started: true, skipped: false });

      const testApp = await createAppWithSyncProviders([mockProvider]);

      const response = await request(testApp)
        .post('/ansible/sync/from-scm/content')
        .send({
          filters: [
            {
              scmProvider: 'github',
              hostName: 'github.com',
              organization: 'matched',
            },
          ],
        });

      expect(response.status).toBe(202);
      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0].scmProvider).toBe('github');
      expect(response.body.results[0].organization).toBe('matched');
    });

    it('should return 207 when mixed results and include summary counts', async () => {
      const started = createMockGitContentsProvider({
        sourceId: 'dev:github:github.com:org1',
      });
      started.startSync.mockReturnValue({ started: true, skipped: false });
      const skipped = createMockGitContentsProvider({
        sourceId: 'dev:github:github.com:org2',
      });
      skipped.startSync.mockReturnValue({ started: false, skipped: true });

      const testApp = await createAppWithSyncProviders([started, skipped]);

      const response = await request(testApp)
        .post('/ansible/sync/from-scm/content')
        .send({});

      expect(response.status).toBe(207);
      expect(response.body.summary).toMatchObject({
        total: 2,
        sync_started: 1,
        already_syncing: 1,
      });
    });
  });

  describe('GET /git_readme_content', () => {
    it('should return 400 when required query parameters are missing', async () => {
      const response = await request(app).get('/git_readme_content');

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Missing required query parameters/);
    });

    it('should return 400 for unsupported SCM provider', async () => {
      const response = await request(app).get(
        '/git_readme_content?scmProvider=bitbucket&host=h&owner=o&repo=r&filePath=README.md&ref=main',
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Unsupported SCM provider/);
    });

    it('should log fetch message, call createClient and getFileContent, and return 200 with text/markdown', async () => {
      const response = await request(app).get(
        '/git_readme_content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=README.md&ref=main',
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/markdown/);
      expect(response.text).toBe('# README content');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Fetching README from github://github.com/myorg/myrepo/README.md@main',
      );
    });

    it('should return 404 and log warn when getFileContent throws not found', async () => {
      const { ScmClientFactory } = require('@ansible/backstage-rhaap-common');
      ScmClientFactory.mockImplementationOnce(() => ({
        createClient: jest.fn().mockResolvedValue({
          getFileContent: jest.fn().mockRejectedValue(new Error('not found')),
        }),
      }));

      const router = await createRouter({
        logger: mockLogger,
        config: mockConfig,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
      });
      const testApp = express().use(router);

      const response = await request(testApp).get(
        '/git_readme_content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=README.md&ref=main',
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to fetch README: not found',
      );
    });

    it('should return 500 and log warn when getFileContent throws other error', async () => {
      const { ScmClientFactory } = require('@ansible/backstage-rhaap-common');
      ScmClientFactory.mockImplementationOnce(() => ({
        createClient: jest.fn().mockResolvedValue({
          getFileContent: jest
            .fn()
            .mockRejectedValue(new Error('Connection refused')),
        }),
      }));

      const router = await createRouter({
        logger: mockLogger,
        config: mockConfig,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
      });
      const testApp = express().use(router);

      const response = await request(testApp).get(
        '/git_readme_content?scmProvider=gitlab&host=gitlab.com&owner=grp&repo=proj&filePath=README.md&ref=main',
      );

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Connection refused');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to fetch README: Connection refused',
      );
    });
  });

  describe('Router setup', () => {
    it('should use express.json() middleware', async () => {
      const response = await request(app)
        .post('/aap/sync_orgs_users_teams')
        .send({ test: 'data' });

      // Should return 404 for POST request, but won't fail on JSON parsing
      expect(response.status).toBe(404);
    });

    it('should handle undefined routes', async () => {
      const response = await request(app).get('/nonexistent');

      expect(response.status).toBe(404);
    });
  });

  describe('Error handling with invalid dependencies', () => {
    it('should handle error when logger is not provided', async () => {
      const routerWithInvalidLogger = await createRouter({
        logger: undefined as any,
        config: mockConfig,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [mockPAHCollectionProvider],
      });

      const testApp = express().use(routerWithInvalidLogger);

      // The /health endpoint should fail when logger is undefined
      const response = await request(testApp).get('/health');
      expect(response.status).toBe(500);
    });

    it('should handle error when aapEntityProvider is not provided', async () => {
      const routerWithInvalidProvider = await createRouter({
        logger: mockLogger,
        config: mockConfig,
        aapEntityProvider: undefined as any,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [mockPAHCollectionProvider],
      });

      const testApp = express().use(routerWithInvalidProvider);

      // The sync endpoint should fail when aapEntityProvider is undefined
      const response = await request(testApp).get('/aap/sync_orgs_users_teams');
      expect(response.status).toBe(500);
    });

    it('should handle error when jobTemplateProvider is not provided', async () => {
      const routerWithInvalidProvider = await createRouter({
        logger: mockLogger,
        config: mockConfig,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: undefined as any,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [mockPAHCollectionProvider],
      });

      const testApp = express().use(routerWithInvalidProvider);

      // The sync endpoint should fail when jobTemplateProvider is undefined
      const response = await request(testApp).get('/aap/sync_job_templates');
      expect(response.status).toBe(500);
    });
  });

  describe('POST /ansible/sync/from-aap/content', () => {
    it('should return 202 when sync starts for all providers', async () => {
      mockPAHCollectionProvider.startSync.mockReturnValue({
        started: true,
        skipped: false,
      });

      const response = await request(app)
        .post('/ansible/sync/from-aap/content')
        .send({});

      expect(response.status).toBe(202);
      expect(response.body).toEqual({
        summary: {
          total: 1,
          sync_started: 1,
          already_syncing: 0,
          failed: 0,
          invalid: 0,
        },
        results: [
          {
            repositoryName: 'validated',
            providerName: 'PAHCollectionProvider:test',
            status: 'sync_started',
          },
        ],
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting PAH collections sync for repository name(s): validated',
      );
    });

    it('should return 202 when filters array is empty and all syncs start', async () => {
      mockPAHCollectionProvider.startSync.mockReturnValue({
        started: true,
        skipped: false,
      });

      const response = await request(app)
        .post('/ansible/sync/from-aap/content')
        .send({ filters: [] });

      expect(response.status).toBe(202);
      expect(response.body.summary.total).toBe(1);
      expect(response.body.summary.sync_started).toBe(1);
      expect(response.body.results[0].status).toBe('sync_started');
    });

    it('should return 202 when sync starts for specific repository', async () => {
      mockPAHCollectionProvider.startSync.mockReturnValue({
        started: true,
        skipped: false,
      });

      const response = await request(app)
        .post('/ansible/sync/from-aap/content')
        .send({ filters: [{ repository_name: 'validated' }] });

      expect(response.status).toBe(202);
      expect(response.body).toEqual({
        summary: {
          total: 1,
          sync_started: 1,
          already_syncing: 0,
          failed: 0,
          invalid: 0,
        },
        results: [
          {
            repositoryName: 'validated',
            providerName: 'PAHCollectionProvider:test',
            status: 'sync_started',
          },
        ],
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting PAH collections sync for repository name(s): validated',
      );
    });

    it('should return 400 when all requested repositories are invalid', async () => {
      const response = await request(app)
        .post('/ansible/sync/from-aap/content')
        .send({ filters: [{ repository_name: 'nonexistent' }] });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        summary: {
          total: 1,
          sync_started: 0,
          already_syncing: 0,
          failed: 0,
          invalid: 1,
        },
        results: [
          {
            repositoryName: 'nonexistent',
            status: 'invalid',
            error: {
              code: 'INVALID_REPOSITORY',
              message:
                "Repository 'nonexistent' not found in configured providers",
            },
          },
        ],
      });
    });

    it('should return 500 when provider fails to start', async () => {
      mockPAHCollectionProvider.startSync.mockReturnValue({
        started: false,
        skipped: false,
        error: 'Provider not connected',
      });

      const response = await request(app)
        .post('/ansible/sync/from-aap/content')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.summary.failed).toBe(1);
      expect(response.body.results[0].status).toBe('failed');
      expect(response.body.results[0].error).toEqual({
        code: 'SYNC_START_FAILED',
        message: 'Provider not connected',
      });
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should filter out invalid repository names from filters and return 202 when sync starts', async () => {
      mockPAHCollectionProvider.startSync.mockReturnValue({
        started: true,
        skipped: false,
      });

      const response = await request(app)
        .post('/ansible/sync/from-aap/content')
        .send({
          filters: [
            { repository_name: 'validated' },
            { repository_name: '' },
            { repository_name: null },
          ],
        });

      expect(response.status).toBe(202);
      expect(response.body.summary.sync_started).toBe(1);
      expect(response.body.results[0].status).toBe('sync_started');
    });

    it('should skip sync when already in progress', async () => {
      mockPAHCollectionProvider.startSync.mockReturnValue({
        started: false,
        skipped: true,
      });

      const response = await request(app)
        .post('/ansible/sync/from-aap/content')
        .send({ filters: [{ repository_name: 'validated' }] });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        summary: {
          total: 1,
          sync_started: 0,
          already_syncing: 1,
          failed: 0,
          invalid: 0,
        },
        results: [
          {
            repositoryName: 'validated',
            providerName: 'PAHCollectionProvider:test',
            status: 'already_syncing',
          },
        ],
      });
      expect(mockPAHCollectionProvider.run).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Skipping sync for validated: sync already in progress',
      );
    });

    it('should return 207 with valid results and invalid repositories mixed', async () => {
      mockPAHCollectionProvider.startSync.mockReturnValue({
        started: true,
        skipped: false,
      });

      const response = await request(app)
        .post('/ansible/sync/from-aap/content')
        .send({
          filters: [
            { repository_name: 'validated' },
            { repository_name: 'invalid-repo' },
          ],
        });

      expect(response.status).toBe(207);
      expect(response.body).toEqual({
        summary: {
          total: 2,
          sync_started: 1,
          already_syncing: 0,
          failed: 0,
          invalid: 1,
        },
        results: [
          {
            repositoryName: 'validated',
            providerName: 'PAHCollectionProvider:test',
            status: 'sync_started',
          },
          {
            repositoryName: 'invalid-repo',
            status: 'invalid',
            error: {
              code: 'INVALID_REPOSITORY',
              message:
                "Repository 'invalid-repo' not found in configured providers",
            },
          },
        ],
      });
    });

    it('should return 400 when no providers are configured and request has no filters', async () => {
      const routerWithNoProviders = await createRouter({
        logger: mockLogger,
        config: mockConfig,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
      });
      const appWithNoProviders = express().use(routerWithNoProviders);

      const response = await request(appWithNoProviders)
        .post('/ansible/sync/from-aap/content')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        summary: {
          total: 0,
          sync_started: 0,
          already_syncing: 0,
          failed: 0,
          invalid: 0,
        },
        results: [],
      });
    });
  });

  describe('POST /ansible/sync/from-aap/content with multiple providers', () => {
    let appWithMultipleProviders: express.Express;
    let mockProvider1: jest.Mocked<PAHCollectionProvider>;
    let mockProvider2: jest.Mocked<PAHCollectionProvider>;

    beforeEach(async () => {
      mockProvider1 = {
        run: jest.fn(),
        startSync: jest.fn(),
        getProviderName: jest
          .fn()
          .mockReturnValue('PAHCollectionProvider:test:repo1'),
        getPahRepositoryName: jest.fn().mockReturnValue('repo1'),
        connect: jest.fn(),
        getLastSyncTime: jest.fn().mockReturnValue(null),
        getLastFailedSyncTime: jest.fn().mockReturnValue(null),
        getLastSyncStatus: jest.fn().mockReturnValue(null),
        getCurrentCollectionsCount: jest.fn().mockReturnValue(0),
        getCollectionsDelta: jest.fn().mockReturnValue(0),
        getIsSyncing: jest.fn().mockReturnValue(false),
        getSourceId: jest.fn().mockReturnValue('test:pah:repo1'),
        isEnabled: jest.fn().mockReturnValue(true),
      } as unknown as jest.Mocked<PAHCollectionProvider>;

      mockProvider2 = {
        run: jest.fn(),
        startSync: jest.fn(),
        getProviderName: jest
          .fn()
          .mockReturnValue('PAHCollectionProvider:test:repo2'),
        getPahRepositoryName: jest.fn().mockReturnValue('repo2'),
        connect: jest.fn(),
        getLastSyncTime: jest.fn().mockReturnValue(null),
        getLastFailedSyncTime: jest.fn().mockReturnValue(null),
        getLastSyncStatus: jest.fn().mockReturnValue(null),
        getCurrentCollectionsCount: jest.fn().mockReturnValue(0),
        getCollectionsDelta: jest.fn().mockReturnValue(0),
        getIsSyncing: jest.fn().mockReturnValue(false),
        getSourceId: jest.fn().mockReturnValue('test:pah:repo2'),
        isEnabled: jest.fn().mockReturnValue(true),
      } as unknown as jest.Mocked<PAHCollectionProvider>;

      const router = await createRouter({
        logger: mockLogger,
        config: mockConfig,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [mockProvider1, mockProvider2],
      });

      appWithMultipleProviders = express().use(router);
    });

    it('should return 202 when all providers start sync successfully', async () => {
      mockProvider1.startSync.mockReturnValue({
        started: true,
        skipped: false,
      });
      mockProvider2.startSync.mockReturnValue({
        started: true,
        skipped: false,
      });

      const response = await request(appWithMultipleProviders)
        .post('/ansible/sync/from-aap/content')
        .send({});

      expect(response.status).toBe(202);
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.sync_started).toBe(2);
      expect(response.body.results).toHaveLength(2);
      expect(
        response.body.results.every(
          (r: { status: string }) => r.status === 'sync_started',
        ),
      ).toBe(true);
    });

    it('should return 200 when all providers are already syncing', async () => {
      mockProvider1.startSync.mockReturnValue({
        started: false,
        skipped: true,
      });
      mockProvider2.startSync.mockReturnValue({
        started: false,
        skipped: true,
      });

      const response = await request(appWithMultipleProviders)
        .post('/ansible/sync/from-aap/content')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.already_syncing).toBe(2);
      expect(response.body.results).toHaveLength(2);
      expect(
        response.body.results.every(
          (r: { status: string }) => r.status === 'already_syncing',
        ),
      ).toBe(true);
    });

    it('should return 207 when some providers start and some are skipped', async () => {
      mockProvider1.startSync.mockReturnValue({
        started: true,
        skipped: false,
      });
      mockProvider2.startSync.mockReturnValue({
        started: false,
        skipped: true,
      });

      const response = await request(appWithMultipleProviders)
        .post('/ansible/sync/from-aap/content')
        .send({});

      expect(response.status).toBe(207);
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.sync_started).toBe(1);
      expect(response.body.summary.already_syncing).toBe(1);
      expect(response.body.results).toHaveLength(2);
      expect(response.body.results[0].status).toBe('sync_started');
      expect(response.body.results[1].status).toBe('already_syncing');
    });

    it('should return 207 when some providers start and some fail', async () => {
      mockProvider1.startSync.mockReturnValue({
        started: true,
        skipped: false,
      });
      mockProvider2.startSync.mockReturnValue({
        started: false,
        skipped: false,
        error: 'Provider not connected',
      });

      const response = await request(appWithMultipleProviders)
        .post('/ansible/sync/from-aap/content')
        .send({});

      expect(response.status).toBe(207);
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.sync_started).toBe(1);
      expect(response.body.summary.failed).toBe(1);
      expect(response.body.results).toHaveLength(2);
      expect(response.body.results[0].status).toBe('sync_started');
      expect(response.body.results[1].status).toBe('failed');
      expect(response.body.results[1].error.code).toBe('SYNC_START_FAILED');
    });

    it('should return 500 when all providers fail to start', async () => {
      mockProvider1.startSync.mockReturnValue({
        started: false,
        skipped: false,
        error: 'Provider not connected',
      });
      mockProvider2.startSync.mockReturnValue({
        started: false,
        skipped: false,
        error: 'Provider not connected',
      });

      const response = await request(appWithMultipleProviders)
        .post('/ansible/sync/from-aap/content')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.failed).toBe(2);
      expect(response.body.results).toHaveLength(2);
      expect(
        response.body.results.every(
          (r: { status: string }) => r.status === 'failed',
        ),
      ).toBe(true);
    });

    it('should return 400 when mix of failed and invalid with no sync started (client error precedence)', async () => {
      mockProvider1.startSync.mockReturnValue({
        started: false,
        skipped: false,
        error: 'Provider not connected',
      });

      const response = await request(appWithMultipleProviders)
        .post('/ansible/sync/from-aap/content')
        .send({
          filters: [
            { repository_name: 'repo1' },
            { repository_name: 'nonexistent' },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.summary.failed).toBe(1);
      expect(response.body.summary.invalid).toBe(1);
      expect(response.body.results).toHaveLength(2);
    });

    it('should return 207 when mix of already_syncing and invalid', async () => {
      mockProvider1.startSync.mockReturnValue({
        started: false,
        skipped: true,
      });

      const response = await request(appWithMultipleProviders)
        .post('/ansible/sync/from-aap/content')
        .send({
          filters: [
            { repository_name: 'repo1' },
            { repository_name: 'nonexistent' },
          ],
        });

      expect(response.status).toBe(207);
      expect(response.body.summary.already_syncing).toBe(1);
      expect(response.body.summary.invalid).toBe(1);
      expect(response.body.results).toHaveLength(2);
    });
  });
});
