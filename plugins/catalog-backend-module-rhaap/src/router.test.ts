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

const mockGetPipelines = jest.fn();

jest.mock('@ansible/backstage-rhaap-common', () => {
  const actual = jest.requireActual('@ansible/backstage-rhaap-common');
  const {
    ScmIntegrations,
    DefaultGithubCredentialsProvider,
  } = require('@backstage/integration');
  return {
    ...actual,
    ScmClientFactory: jest.fn().mockImplementation(opts => {
      let integrations;
      let githubCredentialsProvider;
      try {
        integrations = ScmIntegrations.fromConfig(opts.rootConfig);
        githubCredentialsProvider =
          DefaultGithubCredentialsProvider.fromIntegrations(integrations);
      } catch {
        integrations = {
          github: { byHost: () => undefined },
          gitlab: { byHost: () => undefined },
        };
        githubCredentialsProvider = {
          getCredentials: () =>
            Promise.resolve({ headers: {}, token: undefined }),
        };
      }
      return {
        createClient: jest.fn().mockResolvedValue({
          getFileContent: jest.fn().mockResolvedValue('# README content'),
        }),
        integrations,
        githubCredentialsProvider,
      };
    }),
    GitlabClient: jest.fn().mockImplementation(() => ({
      getPipelines: mockGetPipelines,
    })),
  };
});

import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import { clearCIActivityCache } from './helpers';
import { AAPEntityProvider } from './providers/AAPEntityProvider';
import { AAPJobTemplateProvider } from './providers/AAPJobTemplateProvider';
import { EEEntityProvider } from './providers/EEEntityProvider';
import { PAHCollectionProvider } from './providers/PAHCollectionProvider';
import {
  LoggerService,
  HttpAuthService,
  UserInfoService,
  AuthService,
  PermissionsService,
  SchedulerService,
} from '@backstage/backend-plugin-api';
import { ConflictError } from '@backstage/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { CatalogClient } from '@backstage/catalog-client';
import type { AnsibleGitContentsProvider } from './providers/AnsibleGitContentsProvider';
import { ConfigReader } from '@backstage/config';
import { SCM_INTEGRATION_AUTH_FAILED_CODE } from '@ansible/backstage-rhaap-common/constants';

function createMockGitContentsProvider(
  overrides: {
    sourceId?: string;
    taskId?: string | undefined;
  } = {},
): jest.Mocked<AnsibleGitContentsProvider> {
  const sourceId = overrides.sourceId ?? 'dev:github:github.com:my-org';
  const taskId =
    'taskId' in overrides
      ? overrides.taskId
      : `AnsibleGitContentsProvider:${sourceId}:run`;
  return {
    getSourceId: jest.fn().mockReturnValue(sourceId),
    getProviderName: jest.fn().mockReturnValue('Git Contents'),
    getTaskId: jest.fn().mockReturnValue(taskId),
    getIsSyncing: jest.fn().mockReturnValue(false),
    getLastSyncTime: jest.fn().mockReturnValue(null),
    getLastFailedSyncTime: jest.fn().mockReturnValue(null),
    getLastSyncStatus: jest.fn().mockReturnValue(null),
    getCurrentCollectionsCount: jest.fn().mockReturnValue(0),
    getCollectionsDelta: jest.fn().mockReturnValue(0),
    isEnabled: jest.fn().mockReturnValue(true),
  } as unknown as jest.Mocked<AnsibleGitContentsProvider>;
}

describe('createRouter', () => {
  let app: express.Express;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockScheduler: jest.Mocked<SchedulerService>;
  let mockAAPEntityProvider: jest.Mocked<AAPEntityProvider>;
  let mockJobTemplateProvider: jest.Mocked<AAPJobTemplateProvider>;
  let mockEEEntityProvider: jest.Mocked<EEEntityProvider>;
  let mockPAHCollectionProvider: jest.Mocked<PAHCollectionProvider>;
  let mockHttpAuth: jest.Mocked<HttpAuthService>;
  let mockUserInfo: jest.Mocked<UserInfoService>;
  let mockAuth: jest.Mocked<AuthService>;
  let mockCatalogClient: jest.Mocked<CatalogClient>;
  let mockPermissions: jest.Mocked<PermissionsService>;

  const mockConfig = new ConfigReader({
    integrations: {
      github: [{ host: 'github.com', token: 'test-token' }],
      gitlab: [
        { host: 'gitlab.com', token: 'test-token' },
        // Declared host so header-only auth tests can target a non-SaaS hostname (SSRF allowlist)
        { host: 'gitlab.other.com' },
      ],
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

    mockScheduler = {
      triggerTask: jest.fn().mockResolvedValue(undefined),
      scheduleTask: jest.fn(),
      createScheduledTaskRunner: jest.fn(),
    } as unknown as jest.Mocked<SchedulerService>;

    mockAAPEntityProvider = {
      run: jest.fn(),
      getProviderName: jest.fn().mockReturnValue('AapEntityProvider:test'),
      connect: jest.fn(),
      getLastSyncTime: jest.fn(),
      getLastFailedSyncTime: jest.fn(),
      getLastSyncStatus: jest.fn(),
      getIsSyncing: jest.fn().mockReturnValue(false),
      getTaskId: jest.fn().mockReturnValue('AapEntityProvider:test:run'),
    } as unknown as jest.Mocked<AAPEntityProvider>;

    mockJobTemplateProvider = {
      run: jest.fn(),
      getProviderName: jest.fn().mockReturnValue('AAPJobTemplateProvider:test'),
      connect: jest.fn(),
      getLastSyncTime: jest.fn(),
      getLastFailedSyncTime: jest.fn(),
      getLastSyncStatus: jest.fn(),
      getIsSyncing: jest.fn().mockReturnValue(false),
      getTaskId: jest.fn().mockReturnValue('AAPJobTemplateProvider:test:run'),
    } as unknown as jest.Mocked<AAPJobTemplateProvider>;

    mockEEEntityProvider = {
      registerExecutionEnvironment: jest.fn(),
      getProviderName: jest.fn().mockReturnValue('EEEntityProvider:test'),
      connect: jest.fn(),
    } as unknown as jest.Mocked<EEEntityProvider>;

    mockPAHCollectionProvider = {
      run: jest.fn(),
      getProviderName: jest.fn().mockReturnValue('PAHCollectionProvider:test'),
      getTaskId: jest
        .fn()
        .mockReturnValue('PAHCollectionProvider:test:validated:run'),
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
    mockHttpAuth = {
      credentials: jest.fn().mockResolvedValue({}),
      issueUserCookie: jest.fn(),
    } as unknown as jest.Mocked<HttpAuthService>;

    mockUserInfo = {
      getUserInfo: jest.fn().mockResolvedValue({
        userEntityRef: 'user:default/test-user',
        ownershipEntityRefs: ['user:default/test-user'],
      }),
    } as unknown as jest.Mocked<UserInfoService>;

    mockAuth = {
      getPluginRequestToken: jest
        .fn()
        .mockResolvedValue({ token: 'mock-token' }),
      getOwnServiceCredentials: jest.fn(),
      isPrincipal: jest
        .fn()
        .mockImplementation((_: unknown, type: string) => type === 'user'),
      getNoneCredentials: jest.fn(),
      authenticate: jest.fn(),
      getLimitedUserToken: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    mockCatalogClient = {
      getEntityByRef: jest.fn().mockResolvedValue({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
          name: 'test-user',
          annotations: { 'aap.platform/is_superuser': 'true' },
        },
      }),
    } as unknown as jest.Mocked<CatalogClient>;

    mockPermissions = {
      authorize: jest
        .fn()
        .mockResolvedValue([
          { result: AuthorizeResult.ALLOW },
          { result: AuthorizeResult.ALLOW },
          { result: AuthorizeResult.ALLOW },
        ]),
      authorizeConditional: jest
        .fn()
        .mockResolvedValue([{ result: AuthorizeResult.ALLOW }]),
    } as unknown as jest.Mocked<PermissionsService>;

    const router = await createRouter({
      logger: mockLogger,
      config: mockConfig,
      scheduler: mockScheduler,
      aapEntityProvider: mockAAPEntityProvider,
      jobTemplateProvider: mockJobTemplateProvider,
      eeEntityProvider: mockEEEntityProvider,
      pahCollectionProviders: [mockPAHCollectionProvider],
      httpAuth: mockHttpAuth,
      userInfo: mockUserInfo,
      auth: mockAuth,
      catalogClient: mockCatalogClient,
      permissions: mockPermissions,
      ansibleGitContentsProviders: [],
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

  describe('POST /ansible/sync/from-aap/orgs_users_teams', () => {
    it('should trigger sync via scheduler and return 202', async () => {
      const response = await request(app)
        .post('/ansible/sync/from-aap/orgs_users_teams')
        .send();

      expect(response.status).toBe(202);
      expect(response.body).toEqual({ status: 'sync_started' });
      expect(mockScheduler.triggerTask).toHaveBeenCalledWith(
        'AapEntityProvider:test:run',
      );
    });

    it('should return 200 when sync is already in progress', async () => {
      mockScheduler.triggerTask.mockRejectedValueOnce(
        new ConflictError('Already running'),
      );

      const response = await request(app)
        .post('/ansible/sync/from-aap/orgs_users_teams')
        .send();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'already_syncing' });
    });

    it('should return 500 when provider is not initialized', async () => {
      mockAAPEntityProvider.getTaskId.mockReturnValueOnce(undefined);

      const response = await request(app)
        .post('/ansible/sync/from-aap/orgs_users_teams')
        .send();

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('failed');
    });
  });

  describe('POST /ansible/sync/from-aap/job_templates', () => {
    it('should trigger sync via scheduler and return 202', async () => {
      const response = await request(app)
        .post('/ansible/sync/from-aap/job_templates')
        .send();

      expect(response.status).toBe(202);
      expect(response.body).toEqual({ status: 'sync_started' });
      expect(mockScheduler.triggerTask).toHaveBeenCalledWith(
        'AAPJobTemplateProvider:test:run',
      );
    });

    it('should return 200 when sync is already in progress', async () => {
      mockScheduler.triggerTask.mockRejectedValueOnce(
        new ConflictError('Already running'),
      );

      const response = await request(app)
        .post('/ansible/sync/from-aap/job_templates')
        .send();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'already_syncing' });
    });

    it('should return 500 when provider is not initialized', async () => {
      mockJobTemplateProvider.getTaskId.mockReturnValueOnce(undefined);

      const response = await request(app)
        .post('/ansible/sync/from-aap/job_templates')
        .send();

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('failed');
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
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

  describe('POST /ansible/ee', () => {
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
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
        .post('/ansible/ee')
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
        }),
      );

      const response = await request(testApp)
        .post('/ansible/ee')
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
        }),
      );

      const response = await request(testApp)
        .post('/ansible/ee')
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
        }),
      );

      const mockEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'test-ee' },
      };

      const response = await request(testApp)
        .post('/ansible/ee')
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
        }),
      );

      const mockEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'test-ee' },
      };

      const response = await request(testApp)
        .post('/ansible/ee')
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

  describe('POST /ansible/ee/build', () => {
    const validBuildBody = {
      entityRef: 'component:default/my-ee',
      customRegistryUrl: 'quay.io/ansible',
      imageName: 'namespace/my-image',
      imageTag: 'latest',
      verifyTls: true,
    };

    async function createEeBuildTestApp(
      options: { allowedExternalAccessSubjects?: string[] } = {},
    ) {
      const testApp = express();
      testApp.use(express.json());
      testApp.use(
        '/',
        await createRouter({
          logger: mockLogger,
          config: mockConfig,
          aapEntityProvider: mockAAPEntityProvider,
          jobTemplateProvider: mockJobTemplateProvider,
          eeEntityProvider: mockEEEntityProvider,
          pahCollectionProviders: [mockPAHCollectionProvider],
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
          ansibleGitContentsProviders: [],
          allowedExternalAccessSubjects: options.allowedExternalAccessSubjects,
        }),
      );
      return testApp;
    }

    it('returns 400 when body is missing required fields', async () => {
      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .send({ entityRef: 'component:default/x' })
        .expect(400);
      expect(response.body.error).toContain('customRegistryUrl');
    });

    it('returns 401 when user credentials are missing', async () => {
      mockHttpAuth.credentials.mockRejectedValueOnce(new Error('unauthorized'));
      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .send(validBuildBody)
        .expect(401);
      expect(response.body.error).toMatch(/Authentication required/i);
    });

    it('returns 403 when external access subject is not allowlisted', async () => {
      const serviceCreds = {
        principal: { type: 'service', subject: 'wrong-subject' },
      };
      mockHttpAuth.credentials.mockResolvedValue(serviceCreds as any);
      mockAuth.isPrincipal.mockImplementation((c: any, t: string) => {
        if (t === 'service') return c?.principal?.type === 'service';
        if (t === 'user') return c?.principal?.type === 'user';
        return false;
      });
      const testApp = await createEeBuildTestApp({
        allowedExternalAccessSubjects: ['allowed-ci'],
      });
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .send(validBuildBody)
        .expect(403);
      expect(response.body.error).toMatch(/external access subject/i);
    });

    it('returns 404 when catalog returns no entity for user token', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockCatalogClient.getEntityByRef.mockResolvedValueOnce(undefined);
      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-pat-token')
        .send(validBuildBody)
        .expect(404);
      expect(response.body.error).toMatch(/not found|not visible/i);
    });

    it('returns 202 and dispatches workflow_dispatch with required inputs', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockCatalogClient.getEntityByRef.mockResolvedValueOnce({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'my-ee',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/acme/widgets/blob/main/my-ee/my-ee.yml',
          },
        },
        spec: { type: 'execution-environment' },
      });

      const dispatchBody = JSON.stringify({
        workflow_run_id: 99001,
        run_url: 'https://api.github.com/repos/acme/widgets/actions/runs/99001',
        html_url: 'https://github.com/acme/widgets/actions/runs/99001',
      });
      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => dispatchBody,
      } as Response);

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-pat-token')
        .send(validBuildBody)
        .expect(202);

      expect(response.body).toEqual({
        message: 'Build started',
        workflow_id: 99001,
        workflow_url: 'https://github.com/acme/widgets/actions/runs/99001',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/acme/widgets/actions/workflows/ee-build.yml/dispatches',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer gh-pat-token',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2026-03-10',
          }),
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              ee_dir: 'my-ee',
              ee_file_name: 'my-ee.yml',
              ee_registry: 'quay.io/ansible',
              ee_image_name: 'namespace/my-image',
              image_build_tag: 'latest',
              registry_tls_verify: 'true',
            },
          }),
        }),
      );
      mockFetch.mockRestore();
    });

    it('returns 202 for allowlisted service principal (external access)', async () => {
      const serviceCreds = {
        principal: { type: 'service', subject: 'allowed-ci' },
      };
      mockHttpAuth.credentials.mockResolvedValue(serviceCreds as any);
      mockAuth.isPrincipal.mockImplementation((c: any, t: string) => {
        if (t === 'service') return c?.principal?.type === 'service';
        if (t === 'user') return c?.principal?.type === 'user';
        return false;
      });
      mockCatalogClient.getEntityByRef.mockResolvedValueOnce({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'my-ee',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/acme/widgets/blob/main/my-ee/my-ee.yml',
          },
        },
        spec: { type: 'execution-environment' },
      });

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const testApp = await createEeBuildTestApp({
        allowedExternalAccessSubjects: ['allowed-ci'],
      });
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-pat-token')
        .send(validBuildBody)
        .expect(202);

      expect(response.body).toEqual({ message: 'Build started' });
      expect(mockFetch).toHaveBeenCalled();
      mockFetch.mockRestore();
    });

    it('returns 400 when X-Github-Token header is missing', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockCatalogClient.getEntityByRef.mockResolvedValueOnce({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'my-ee',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/acme/widgets/blob/main/my-ee/my-ee.yml',
          },
        },
        spec: { type: 'execution-environment' },
      });

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .send(validBuildBody)
        .expect(400);

      expect(response.body.error).toContain('X-Github-Token');
    });

    it('returns 400 when entityRef is missing (owner/repo only)', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-pat-direct')
        .send({
          owner: 'test-org',
          repo: 'test-repo',
          customRegistryUrl: 'quay.io/ansible',
          imageName: 'namespace/my-image',
          imageTag: 'latest',
          verifyTls: true,
        })
        .expect(400);

      expect(response.body.error).toContain('entityRef is required');
      expect(mockCatalogClient.getEntityByRef).not.toHaveBeenCalled();
    });

    it('returns 400 when entityRef is missing', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-tok')
        .send({
          customRegistryUrl: 'quay.io/org',
          imageName: 'img',
          imageTag: 'latest',
          verifyTls: true,
        })
        .expect(400);

      expect(response.body.error).toContain('entityRef is required');
    });

    it('derives ee_dir and ee_file_name from entity annotations', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockCatalogClient.getEntityByRef.mockResolvedValueOnce({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'my-ee',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/acme/widgets/blob/main/ee1/execution-environment.yml',
          },
        },
        spec: { type: 'execution-environment' },
      });

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-pat-derived')
        .send({
          entityRef: 'component:default/my-ee',
          customRegistryUrl: 'quay.io/ansible',
          imageName: 'namespace/my-image',
          imageTag: 'v2.0',
          verifyTls: false,
        })
        .expect(202);

      expect(response.body).toEqual({ message: 'Build started' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/acme/widgets/actions/workflows/ee-build.yml/dispatches',
        expect.objectContaining({
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              ee_dir: 'ee1',
              ee_file_name: 'execution-environment.yml',
              ee_registry: 'quay.io/ansible',
              ee_image_name: 'namespace/my-image',
              image_build_tag: 'v2.0',
              registry_tls_verify: 'false',
            },
          }),
        }),
      );
      mockFetch.mockRestore();
    });

    it('returns 400 when entity has no file path in annotations', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockCatalogClient.getEntityByRef.mockResolvedValueOnce({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'my-ee',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/acme/widgets/tree/main/',
          },
        },
        spec: { type: 'execution-environment' },
      });

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-pat-nopath')
        .send({
          entityRef: 'component:default/my-ee',
          customRegistryUrl: 'quay.io/ansible',
          imageName: 'namespace/my-image',
          imageTag: 'latest',
          verifyTls: true,
        })
        .expect(400);

      expect(response.body.error).toContain('ee_dir/ee_file_name');
    });

    it('returns 403 when permissions are denied', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockPermissions.authorize.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ] as any);
      mockPermissions.authorizeConditional.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ] as any);

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-tok')
        .send(validBuildBody)
        .expect(403);

      expect(response.body.error).toContain('insufficient permissions');
    });

    it('returns 400 when entity resolution throws (non-GitHub URL)', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockCatalogClient.getEntityByRef.mockResolvedValueOnce({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'ee1',
          annotations: {
            'backstage.io/source-location':
              'url:https://gitlab.com/group/project/-/blob/main/ee.yml',
          },
        },
        spec: { type: 'execution-environment' },
      });

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-tok')
        .send(validBuildBody)
        .expect(400);

      expect(response.body.error).toContain('GitHub');
    });

    it('returns 400 when entity kind is wrong', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockCatalogClient.getEntityByRef.mockResolvedValueOnce({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Template',
        metadata: {
          name: 'ee1',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/o/r/blob/main/ee.yml',
          },
        },
        spec: { type: 'execution-environment' },
      });

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-tok')
        .send(validBuildBody)
        .expect(400);

      expect(response.body.error).toContain('Component');
    });

    it('returns 400 when entity host is not safe', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockCatalogClient.getEntityByRef.mockResolvedValueOnce({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'ee1',
          annotations: {
            'backstage.io/source-location':
              'url:https://evil.com%00/acme/repo/blob/main/ee1/ee.yml',
          },
        },
        spec: { type: 'execution-environment' },
      });

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-tok')
        .send(validBuildBody)
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });

    it('returns 400 when entity host is not in integrations allowlist', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockCatalogClient.getEntityByRef.mockResolvedValueOnce({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'ee1',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.example.com/acme/repo/blob/main/ee1/ee.yml',
          },
        },
        spec: { type: 'execution-environment' },
      });

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-tok')
        .send(validBuildBody)
        .expect(400);

      expect(response.body.error).toContain('not allowed');
    });

    it('returns 422 when GitHub dispatch returns a client error', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockCatalogClient.getEntityByRef.mockResolvedValueOnce({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'my-ee',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/acme/widgets/blob/main/my-ee/my-ee.yml',
          },
        },
        spec: { type: 'execution-environment' },
      });

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: async () => '{"message":"Validation Failed"}',
      } as Response);

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-tok')
        .send(validBuildBody)
        .expect(422);

      expect(response.body.error).toContain('workflow_dispatch failed');
      mockFetch.mockRestore();
    });

    it('returns 502 when GitHub dispatch returns a server error', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockCatalogClient.getEntityByRef.mockResolvedValueOnce({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'my-ee',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/acme/widgets/blob/main/my-ee/my-ee.yml',
          },
        },
        spec: { type: 'execution-environment' },
      });

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => '',
      } as Response);

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-tok')
        .send(validBuildBody)
        .expect(502);

      expect(response.body.error).toContain('Internal Server Error');
      mockFetch.mockRestore();
    });

    it('returns 500 when an unexpected error occurs during dispatch', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockCatalogClient.getEntityByRef.mockResolvedValueOnce({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'my-ee',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/acme/widgets/blob/main/my-ee/my-ee.yml',
          },
        },
        spec: { type: 'execution-environment' },
      });

      const mockFetch = jest
        .spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('network timeout'));

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-tok')
        .send(validBuildBody)
        .expect(500);

      expect(response.body.error).toBe(
        'Internal error during EE build dispatch',
      );
      mockFetch.mockRestore();
    });

    it('returns 400 via outer catch when dispatch throws with known keyword', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockCatalogClient.getEntityByRef.mockResolvedValueOnce({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'my-ee',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/acme/widgets/blob/main/my-ee/my-ee.yml',
          },
        },
        spec: { type: 'execution-environment' },
      });

      const mockFetch = jest
        .spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('GitHub rate limit exceeded'));

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-tok')
        .send(validBuildBody)
        .expect(400);

      expect(response.body.error).toContain('GitHub rate limit exceeded');
      mockFetch.mockRestore();
    });

    it('returns 403 when catalog throws ResponseError with 403', async () => {
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      const respError = new Error('Forbidden') as any;
      respError.name = 'ResponseError';
      respError.response = { status: 403 };
      Object.setPrototypeOf(
        respError,
        Object.getPrototypeOf(
          (() => {
            try {
              const { ResponseError: RE } = require('@backstage/errors');
              return new RE({
                status: 403,
                statusText: 'Forbidden',
                ok: false,
              } as Response);
            } catch {
              return respError;
            }
          })(),
        ),
      );
      mockCatalogClient.getEntityByRef.mockRejectedValueOnce(respError);

      const testApp = await createEeBuildTestApp();
      const response = await request(testApp)
        .post('/ansible/ee/build')
        .set('X-Github-Token', 'gh-tok')
        .send(validBuildBody)
        .expect(403);

      expect(response.body.error).toContain('Not allowed');
    });
  });

  describe('POST /ansible/git/ci-activity (GitLab)', () => {
    beforeEach(() => {
      clearCIActivityCache();
      jest.clearAllMocks();
    });

    it('should return error in results when host is not a safe hostname', async () => {
      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/project',
              host: 'https://evil.com',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test.error).toContain('Invalid host');
    });

    it('should return error in results when host is not allowed (SSRF mitigation)', async () => {
      const configNoGitlab = new ConfigReader({});
      const routerNoGitlab = await createRouter({
        logger: mockLogger,
        config: configNoGitlab,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
      });
      const appNoGitlab = express().use(routerNoGitlab);

      const response = await request(appNoGitlab)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/project',
              host: '169.254.169.254',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test.error).toContain('not allowed');
    });

    it('should return error in results when projectPath is missing', async () => {
      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [{ key: 'test', provider: 'gitlab', host: 'gitlab.com' }],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test.error).toContain('projectPath');
    });

    it('should return error in results when host is not declared in integrations.gitlab', async () => {
      const configWithoutToken = new ConfigReader({});
      const routerWithoutToken = await createRouter({
        logger: mockLogger,
        config: configWithoutToken,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
      });
      const appWithoutToken = express().use(routerWithoutToken);

      const response = await request(appWithoutToken)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/project',
              host: 'gitlab.unknown.com',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test.error).toContain('not allowed');
    });

    it('should use token from config for matching host', async () => {
      mockGetPipelines.mockResolvedValue({
        ok: true,
        status: 200,
        data: [{ id: 1, status: 'success' }],
      });

      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/config-token-test',
              host: 'gitlab.com',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test).toEqual({
        status: 200,
        data: [{ id: 1, status: 'success' }],
      });
    });

    it('should return error when host has no token in config', async () => {
      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/other-host-test',
              host: 'gitlab.other.com',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test.error).toContain(
        'Missing GitLab authorization',
      );
    });

    it('should return pipelines data on success', async () => {
      const pipelines = [
        { id: 1, status: 'success', ref: 'main' },
        { id: 2, status: 'failed', ref: 'develop' },
      ];

      mockGetPipelines.mockResolvedValue({
        ok: true,
        status: 200,
        data: pipelines,
      });

      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/pipelines-test',
              host: 'gitlab.com',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test).toEqual({
        status: 200,
        data: pipelines,
      });
    });

    it('should return GitLab error status in results when API returns non-OK', async () => {
      mockGetPipelines.mockResolvedValue({
        ok: false,
        status: 404,
        data: { message: 'Project not found' },
      });

      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/nonexistent',
              host: 'gitlab.com',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test).toEqual({
        status: 404,
        data: { message: 'Project not found' },
      });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should return error in results when GitLab client throws error', async () => {
      mockGetPipelines.mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/network-error-test',
              host: 'gitlab.com',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test.error).toBe(
        'Failed to fetch GitLab pipelines',
      );
    });

    it('should default host to gitlab.com when not provided', async () => {
      mockGetPipelines.mockResolvedValue({
        ok: true,
        status: 200,
        data: [],
      });

      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/default-host-test',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test).toEqual({
        status: 200,
        data: [],
      });
    });

    it('should respect per_page parameter', async () => {
      mockGetPipelines.mockResolvedValue({
        ok: true,
        status: 200,
        data: [],
      });

      await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/per-page-50-test',
              host: 'gitlab.com',
              per_page: 50,
            },
          ],
        });

      expect(mockGetPipelines).toHaveBeenCalledWith('group/per-page-50-test', {
        perPage: 50,
      });
    });

    it('should cap per_page at 100', async () => {
      mockGetPipelines.mockResolvedValue({
        ok: true,
        status: 200,
        data: [],
      });

      await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/per-page-cap-test',
              host: 'gitlab.com',
              per_page: 200,
            },
          ],
        });

      expect(mockGetPipelines).toHaveBeenCalledWith('group/per-page-cap-test', {
        perPage: 100,
      });
    });

    it('should default per_page to 15', async () => {
      mockGetPipelines.mockResolvedValue({
        ok: true,
        status: 200,
        data: [],
      });

      await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/per-page-default-test',
              host: 'gitlab.com',
            },
          ],
        });

      expect(mockGetPipelines).toHaveBeenCalledWith(
        'group/per-page-default-test',
        { perPage: 15 },
      );
    });

    it('should disable SSL verification for hosts in skipTlsVerifyForHosts', async () => {
      const configWithSkipTls = new ConfigReader({
        integrations: {
          gitlab: [
            { host: 'gitlab.com', token: 'test-token' },
            { host: 'gitlab.insecure.com', token: 'token' },
          ],
        },
        catalog: {
          ansible: {
            skipTlsVerifyForHosts: ['gitlab.insecure.com'],
          },
        },
      });

      const routerWithSkipTls = await createRouter({
        logger: mockLogger,
        config: configWithSkipTls,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
      });

      const appWithSkipTls = express().use(routerWithSkipTls);

      mockGetPipelines.mockResolvedValue({
        ok: true,
        status: 200,
        data: [],
      });

      const { GitlabClient } = require('@ansible/backstage-rhaap-common');

      await request(appWithSkipTls)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/ssl-skip-test',
              host: 'gitlab.insecure.com',
            },
          ],
        });

      expect(GitlabClient).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            checkSSL: false,
          }),
        }),
      );
    });

    it('should enable SSL verification for hosts not in skipTlsVerifyForHosts', async () => {
      mockGetPipelines.mockResolvedValue({
        ok: true,
        status: 200,
        data: [],
      });

      const { GitlabClient } = require('@ansible/backstage-rhaap-common');

      await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/ssl-enabled-test',
              host: 'gitlab.com',
            },
          ],
        });

      expect(GitlabClient).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            checkSSL: true,
          }),
        }),
      );
    });

    it('should use apiBaseUrl from config when available', async () => {
      const configWithApiBase = new ConfigReader({
        integrations: {
          gitlab: [
            {
              host: 'gitlab.internal.com',
              token: 'internal-token',
              apiBaseUrl: 'https://gitlab.internal.com/api/v4',
            },
          ],
        },
      });

      const routerWithApiBase = await createRouter({
        logger: mockLogger,
        config: configWithApiBase,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
      });

      const appWithApiBase = express().use(routerWithApiBase);

      mockGetPipelines.mockResolvedValue({
        ok: true,
        status: 200,
        data: [],
      });

      const { GitlabClient } = require('@ansible/backstage-rhaap-common');

      await request(appWithApiBase)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/api-base-test',
              host: 'gitlab.internal.com',
            },
          ],
        });

      expect(GitlabClient).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://gitlab.internal.com/api/v4',
          }),
        }),
      );
    });

    it('should prefer config token over request header token', async () => {
      mockGetPipelines.mockResolvedValue({
        ok: true,
        status: 200,
        data: [],
      });

      const { GitlabClient } = require('@ansible/backstage-rhaap-common');

      await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'gitlab',
              projectPath: 'group/config-pref-test',
              host: 'gitlab.com',
            },
          ],
        });

      expect(GitlabClient).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            token: 'test-token',
          }),
        }),
      );
    });
  });

  describe('POST /ansible/git/ci-activity (permissions)', () => {
    beforeEach(() => {
      clearCIActivityCache();
      jest.clearAllMocks();
    });

    it('should return 403 when user lacks git-repositories view permission', async () => {
      mockPermissions.authorize.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ] as any);
      mockPermissions.authorizeConditional.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ] as any);

      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [{ key: 'test', provider: 'github', owner: 'o', repo: 'r' }],
        });
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden: insufficient permissions');
    });

    it('should return 403 when user lacks catalog entity read permission', async () => {
      mockPermissions.authorize.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ] as any);
      mockPermissions.authorizeConditional.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ] as any);

      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [{ key: 'test', provider: 'github', owner: 'o', repo: 'r' }],
        });
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden: insufficient permissions');
    });

    it('should allow access with both git-repo view and catalog entity read', async () => {
      mockPermissions.authorize.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ] as any);
      mockPermissions.authorizeConditional.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ] as any);

      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'github',
              owner: 'myorg',
              repo: 'myrepo',
              host: 'github.com',
            },
          ],
        });
      expect(response.status).not.toBe(403);
    });

    it('should allow access when catalog entity read returns CONDITIONAL', async () => {
      mockPermissions.authorize.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ] as any);
      mockPermissions.authorizeConditional.mockResolvedValueOnce([
        {
          result: AuthorizeResult.CONDITIONAL,
          pluginId: 'catalog',
          resourceType: 'catalog-entity',
          conditions: { rule: 'IS_ENTITY_OWNER', params: {} },
        },
      ] as any);

      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'github',
              owner: 'myorg',
              repo: 'myrepo',
              host: 'github.com',
            },
          ],
        });
      expect(response.status).not.toBe(403);
    });
  });

  describe('POST /ansible/git/ci-activity (batch validation)', () => {
    it('should return 400 when items array is missing', async () => {
      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('non-empty array');
    });

    it('should return 400 when items array is empty', async () => {
      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({ items: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('non-empty array');
    });

    it('should return error in results when provider is invalid', async () => {
      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'bitbucket',
              projectPath: 'group/project',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test.error).toContain(
        'Unknown provider: bitbucket',
      );
    });
  });

  describe('POST /ansible/git/ci-activity (GitHub)', () => {
    beforeEach(() => {
      clearCIActivityCache();
      jest.clearAllMocks();
    });

    it('should return error in results when owner is missing', async () => {
      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [{ key: 'test', provider: 'github', repo: 'my-repo' }],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test.error).toContain(
        'Missing required parameters for GitHub: owner, repo',
      );
    });

    it('should return error in results when repo is missing', async () => {
      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [{ key: 'test', provider: 'github', owner: 'my-owner' }],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test.error).toContain(
        'Missing required parameters for GitHub: owner, repo',
      );
    });

    it('should return error in results when host is not a safe hostname', async () => {
      const response = await request(app)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'github',
              owner: 'my-owner',
              repo: 'my-repo',
              host: 'https://evil.com',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test.error).toContain('Invalid host');
    });

    it('should return error in results when host is not allowed (SSRF mitigation)', async () => {
      const configNoGithub = new ConfigReader({});
      const routerNoGithub = await createRouter({
        logger: mockLogger,
        config: configNoGithub,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
      });
      const appNoGithub = express().use(routerNoGithub);

      const response = await request(appNoGithub)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'github',
              owner: 'my-owner',
              repo: 'my-repo',
              host: '169.254.169.254',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test.error).toContain('not allowed');
    });

    it('should return error in results when token is missing', async () => {
      const configWithoutToken = new ConfigReader({});
      const routerWithoutToken = await createRouter({
        logger: mockLogger,
        config: configWithoutToken,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
      });
      const appWithoutToken = express().use(routerWithoutToken);

      const response = await request(appWithoutToken)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'github',
              owner: 'my-owner',
              repo: 'my-repo',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test.error).toContain(
        'Missing GitHub authorization',
      );
    });

    it('should use token from config for matching host', async () => {
      const configWithGitHub = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'github-test-token' }],
        },
      });

      const routerWithGitHub = await createRouter({
        logger: mockLogger,
        config: configWithGitHub,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
      });

      const appWithGitHub = express().use(routerWithGitHub);

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          workflow_runs: [{ id: 1, conclusion: 'success' }],
        }),
      } as Response);

      const response = await request(appWithGitHub)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'github',
              owner: 'my-owner',
              repo: 'config-token-test',
              host: 'github.com',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.github.com'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer github-test-token',
          }),
        }),
      );

      mockFetch.mockRestore();
    });

    it('should return workflow runs on success', async () => {
      const configWithGitHub = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'github-test-token' }],
        },
      });

      const routerWithGitHub = await createRouter({
        logger: mockLogger,
        config: configWithGitHub,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
      });

      const appWithGitHub = express().use(routerWithGitHub);

      const workflowRuns = {
        total_count: 2,
        workflow_runs: [
          { id: 1, conclusion: 'success', name: 'CI' },
          { id: 2, conclusion: 'failure', name: 'Deploy' },
        ],
      };

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => workflowRuns,
      } as Response);

      const response = await request(appWithGitHub)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'github',
              owner: 'my-owner',
              repo: 'workflow-runs-test',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test).toEqual({
        status: 200,
        data: workflowRuns,
      });

      mockFetch.mockRestore();
    });

    it('should return error in results when GitHub API throws error', async () => {
      const configWithGitHub = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'github-test-token' }],
        },
      });

      const routerWithGitHub = await createRouter({
        logger: mockLogger,
        config: configWithGitHub,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
      });

      const appWithGitHub = express().use(routerWithGitHub);

      const mockFetch = jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('Network error'));

      const response = await request(appWithGitHub)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'github',
              owner: 'my-owner',
              repo: 'network-error-test',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results.test.error).toBe(
        'Failed to fetch GitHub workflow runs',
      );

      mockFetch.mockRestore();
    });

    it('should respect per_page parameter', async () => {
      const configWithGitHub = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'github-test-token' }],
        },
      });

      const routerWithGitHub = await createRouter({
        logger: mockLogger,
        config: configWithGitHub,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
      });

      const appWithGitHub = express().use(routerWithGitHub);

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ workflow_runs: [] }),
      } as Response);

      await request(appWithGitHub)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'github',
              owner: 'my-owner',
              repo: 'per-page-50-test',
              per_page: 50,
            },
          ],
        });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('per_page=50'),
        expect.any(Object),
      );

      mockFetch.mockRestore();
    });

    it('should cap per_page at 100', async () => {
      const configWithGitHub = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'github-test-token' }],
        },
      });

      const routerWithGitHub = await createRouter({
        logger: mockLogger,
        config: configWithGitHub,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
      });

      const appWithGitHub = express().use(routerWithGitHub);

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ workflow_runs: [] }),
      } as Response);

      await request(appWithGitHub)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'github',
              owner: 'my-owner',
              repo: 'per-page-cap-test',
              per_page: 200,
            },
          ],
        });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('per_page=100'),
        expect.any(Object),
      );

      mockFetch.mockRestore();
    });

    it('should use apiBaseUrl from config for GitHub Enterprise', async () => {
      const configWithGHE = new ConfigReader({
        integrations: {
          github: [
            {
              host: 'github.enterprise.com',
              token: 'ghe-token',
              apiBaseUrl: 'https://github.enterprise.com/api/v3',
            },
          ],
        },
      });

      const routerWithGHE = await createRouter({
        logger: mockLogger,
        config: configWithGHE,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
      });

      const appWithGHE = express().use(routerWithGHE);

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ workflow_runs: [] }),
      } as Response);

      await request(appWithGHE)
        .post('/ansible/git/ci-activity')
        .send({
          items: [
            {
              key: 'test',
              provider: 'github',
              owner: 'my-owner',
              repo: 'ghe-test',
              host: 'github.enterprise.com',
            },
          ],
        });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('github.enterprise.com/api/v3'),
        expect.any(Object),
      );

      mockFetch.mockRestore();
    });
  });

  describe('GET /ansible/sync/status', () => {
    it('should return 403 when user lacks catalog entity read permission', async () => {
      mockPermissions.authorizeConditional.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ]);

      const response = await request(app).get('/ansible/sync/status');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden: insufficient permissions');
    });

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
          orgsUsersTeams: expect.objectContaining({
            lastSync: '2024-01-15T10:00:00Z',
          }),
          jobTemplates: expect.objectContaining({
            lastSync: '2024-01-15T11:00:00Z',
          }),
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
          orgsUsersTeams: expect.objectContaining({
            lastSync: '2024-01-15T10:00:00Z',
          }),
          jobTemplates: expect.objectContaining({
            lastSync: '2024-01-15T11:00:00Z',
          }),
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
          orgsUsersTeams: expect.objectContaining({
            lastSync: '2024-01-15T10:00:00Z',
          }),
          jobTemplates: expect.objectContaining({
            lastSync: '2024-01-15T11:00:00Z',
          }),
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

    it('should handle sync status when thrown value is not an Error (stringifies in response)', async () => {
      mockAAPEntityProvider.getLastSyncTime.mockImplementation(() => {
        throw new Error('plain string error');
      });
      mockJobTemplateProvider.getLastSyncTime.mockReturnValue(null);

      const response = await request(app).get(
        '/ansible/sync/status?aap_entities=true',
      );

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('plain string error');
      expect(response.body.aap).toEqual({
        orgsUsersTeams: null,
        jobTemplates: null,
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
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
          httpAuth: mockHttpAuth,
          userInfo: mockUserInfo,
          auth: mockAuth,
          catalogClient: mockCatalogClient,
          scheduler: mockScheduler,
          permissions: mockPermissions,
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
      httpAuth: mockHttpAuth,
      userInfo: mockUserInfo,
      auth: mockAuth,
      catalogClient: mockCatalogClient,
      scheduler: mockScheduler,
      permissions: mockPermissions,
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

    it('should trigger all providers via scheduler when filters is empty', async () => {
      const mockProvider = createMockGitContentsProvider({
        sourceId: 'dev:github:github.com:acme',
      });

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
      expect(mockScheduler.triggerTask).toHaveBeenCalledWith(
        'AnsibleGitContentsProvider:dev:github:github.com:acme:run',
      );
      expect(response.body.summary.sync_started).toBe(1);
      expect(response.body.results[0].status).toBe('sync_started');
    });

    it('should return already_syncing when task is already running', async () => {
      const mockProvider = createMockGitContentsProvider({
        sourceId: 'dev:gitlab:gitlab.com:mygroup',
      });
      mockScheduler.triggerTask.mockRejectedValue(
        new ConflictError('Task already running'),
      );

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

    it('should return failed when provider getTaskId returns undefined', async () => {
      const mockProvider = createMockGitContentsProvider({
        sourceId: 'dev:github:github.com:fail-org',
        taskId: undefined,
      });

      const testApp = await createAppWithSyncProviders([mockProvider]);

      const response = await request(testApp)
        .post('/ansible/sync/from-scm/content')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.results[0].status).toBe('failed');
      expect(response.body.results[0].error?.code).toBe('SYNC_START_FAILED');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Cannot trigger sync'),
      );
    });

    it('should use getProvidersFromFilters when valid filters match providers', async () => {
      const mockProvider = createMockGitContentsProvider({
        sourceId: 'dev:github:github.com:matched',
      });

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

    it('should return 202 when all providers trigger successfully', async () => {
      const provider1 = createMockGitContentsProvider({
        sourceId: 'dev:github:github.com:org1',
      });
      const provider2 = createMockGitContentsProvider({
        sourceId: 'dev:github:github.com:org2',
      });

      const testApp = await createAppWithSyncProviders([provider1, provider2]);

      const response = await request(testApp)
        .post('/ansible/sync/from-scm/content')
        .send({});

      expect(response.status).toBe(202);
      expect(response.body.summary).toMatchObject({
        total: 2,
        sync_started: 2,
      });
      expect(mockScheduler.triggerTask).toHaveBeenCalledTimes(2);
    });

    it('should return 207 when one provider triggers and one is already syncing', async () => {
      const provider1 = createMockGitContentsProvider({
        sourceId: 'dev:github:github.com:one',
      });
      const provider2 = createMockGitContentsProvider({
        sourceId: 'dev:github:github.com:two',
      });
      mockScheduler.triggerTask
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new ConflictError('Task already running'));

      const testApp = await createAppWithSyncProviders([provider1, provider2]);

      const response = await request(testApp)
        .post('/ansible/sync/from-scm/content')
        .send({});

      expect(response.status).toBe(207);
      expect(response.body.summary).toMatchObject({
        total: 2,
        sync_started: 1,
        already_syncing: 1,
      });
      expect(
        response.body.results.some(
          (r: { status: string }) => r.status === 'sync_started',
        ),
      ).toBe(true);
      expect(
        response.body.results.some(
          (r: { status: string }) => r.status === 'already_syncing',
        ),
      ).toBe(true);
    });
  });

  describe('GET /ansible/git/file-content', () => {
    it('should return 400 when required query parameters are missing', async () => {
      const response = await request(app).get('/ansible/git/file-content');

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Missing required query parameters/);
    });

    it('should return 400 for unsupported SCM provider', async () => {
      const response = await request(app).get(
        '/ansible/git/file-content?scmProvider=bitbucket&host=h&owner=o&repo=r&filePath=README.md&ref=main',
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Unsupported SCM provider/);
    });

    it('should log fetch message, call createClient and getFileContent, and return 200 with text/markdown', async () => {
      const response = await request(app).get(
        '/ansible/git/file-content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=README.md&ref=main',
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
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
        ansibleGitContentsProviders: [],
      });
      const testApp = express().use(router);

      const response = await request(testApp).get(
        '/ansible/git/file-content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=README.md&ref=main',
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to fetch README: not found',
      );
    });

    it('should return 401 with INTEGRATION_AUTH_FAILED when getFileContent throws auth error', async () => {
      const { ScmClientFactory } = require('@ansible/backstage-rhaap-common');
      ScmClientFactory.mockImplementationOnce(() => ({
        createClient: jest.fn().mockResolvedValue({
          getFileContent: jest
            .fn()
            .mockRejectedValue(new Error('Bad credentials')),
        }),
      }));

      const router = await createRouter({
        logger: mockLogger,
        config: mockConfig,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
        ansibleGitContentsProviders: [],
      });
      const testApp = express().use(router);

      const response = await request(testApp).get(
        '/ansible/git/file-content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=README.md&ref=main',
      );

      expect(response.status).toBe(401);
      expect(response.body.code).toBe(SCM_INTEGRATION_AUTH_FAILED_CODE);
      expect(response.body.error).toBe(
        'Unable to authenticate with the configured GitHub or GitLab integration.',
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to fetch README: Bad credentials',
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
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
        ansibleGitContentsProviders: [],
      });
      const testApp = express().use(router);

      const response = await request(testApp).get(
        '/ansible/git/file-content?scmProvider=gitlab&host=gitlab.com&owner=grp&repo=proj&filePath=README.md&ref=main',
      );

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Connection refused');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to fetch README: Connection refused',
      );
    });

    it('should set content-type application/yaml for .yaml file', async () => {
      const response = await request(app).get(
        '/ansible/git/file-content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=ansible.yaml&ref=main',
      );
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/yaml/);
    });

    it('should set content-type application/yaml for .yml file', async () => {
      const response = await request(app).get(
        '/ansible/git/file-content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=config.yml&ref=main',
      );
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/yaml/);
    });

    it('should set content-type application/json for .json file', async () => {
      const { ScmClientFactory } = require('@ansible/backstage-rhaap-common');
      ScmClientFactory.mockImplementationOnce(() => ({
        createClient: jest.fn().mockResolvedValue({
          getFileContent: jest.fn().mockResolvedValue('{"key": "value"}'),
        }),
      }));
      const router = await createRouter({
        logger: mockLogger,
        config: mockConfig,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
        ansibleGitContentsProviders: [],
      });
      const testApp = express().use(router);
      const response = await request(testApp).get(
        '/ansible/git/file-content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=data.json&ref=main',
      );
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.text).toBe('{"key": "value"}');
    });

    it('should set content-type text/plain for .txt file', async () => {
      const response = await request(app).get(
        '/ansible/git/file-content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=notes.txt&ref=main',
      );
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/plain/);
    });

    it('should set content-type text/plain for unknown or missing extension', async () => {
      const response = await request(app).get(
        '/ansible/git/file-content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=README&ref=main',
      );
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/plain/);
    });

    it('should return 403 when user has no ansible permissions', async () => {
      mockPermissions.authorize.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
        { result: AuthorizeResult.DENY },
        { result: AuthorizeResult.DENY },
      ] as any);
      mockPermissions.authorizeConditional.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ] as any);

      const response = await request(app).get(
        '/ansible/git/file-content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=README.md&ref=main',
      );
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden: insufficient permissions');
    });

    it('should return 403 when user lacks catalog entity read permission', async () => {
      mockPermissions.authorize.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
        { result: AuthorizeResult.ALLOW },
        { result: AuthorizeResult.ALLOW },
      ] as any);
      mockPermissions.authorizeConditional.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ] as any);

      const response = await request(app).get(
        '/ansible/git/file-content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=README.md&ref=main',
      );
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden: insufficient permissions');
    });

    it('should allow access with git-repo view and catalog entity read', async () => {
      mockPermissions.authorize.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
        { result: AuthorizeResult.DENY },
        { result: AuthorizeResult.DENY },
      ] as any);
      mockPermissions.authorizeConditional.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ] as any);

      const response = await request(app).get(
        '/ansible/git/file-content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=README.md&ref=main',
      );
      expect(response.status).toBe(200);
    });

    it('should allow access with ee view and catalog entity read', async () => {
      mockPermissions.authorize.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
        { result: AuthorizeResult.ALLOW },
        { result: AuthorizeResult.DENY },
      ] as any);
      mockPermissions.authorizeConditional.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ] as any);

      const response = await request(app).get(
        '/ansible/git/file-content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=README.md&ref=main',
      );
      expect(response.status).toBe(200);
    });

    it('should allow access with collections view and catalog entity read', async () => {
      mockPermissions.authorize.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
        { result: AuthorizeResult.DENY },
        { result: AuthorizeResult.ALLOW },
      ] as any);
      mockPermissions.authorizeConditional.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ] as any);

      const response = await request(app).get(
        '/ansible/git/file-content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=README.md&ref=main',
      );
      expect(response.status).toBe(200);
    });

    it('should allow access when catalog entity read returns CONDITIONAL', async () => {
      mockPermissions.authorize.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
        { result: AuthorizeResult.DENY },
        { result: AuthorizeResult.DENY },
      ] as any);
      mockPermissions.authorizeConditional.mockResolvedValueOnce([
        {
          result: AuthorizeResult.CONDITIONAL,
          pluginId: 'catalog',
          resourceType: 'catalog-entity',
          conditions: { rule: 'IS_ENTITY_OWNER', params: {} },
        },
      ] as any);

      const response = await request(app).get(
        '/ansible/git/file-content?scmProvider=github&host=github.com&owner=myorg&repo=myrepo&filePath=README.md&ref=main',
      );
      expect(response.status).toBe(200);
    });
  });

  describe('Router setup', () => {
    it('should use express.json() middleware', async () => {
      const response = await request(app)
        .post('/ansible/sync/from-aap/orgs_users_teams')
        .send({ test: 'data' });

      // Should return 404 for POST request, but won't fail on JSON parsing
      expect(response.status).toBe(404);
    });

    it('should handle undefined routes', async () => {
      const response = await request(app).get('/nonexistent');

      expect(response.status).toBe(404);
    });

    it('should work when ansibleGitContentsProviders is omitted (defaults to empty array)', async () => {
      const opts = {
        logger: mockLogger,
        config: mockConfig,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        pahCollectionProviders: [mockPAHCollectionProvider],
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
        ansibleGitContentsProviders: [] as AnsibleGitContentsProvider[],
      };
      const { ansibleGitContentsProviders: _omit, ...rest } = opts;
      const router = await createRouter(
        rest as Parameters<typeof createRouter>[0],
      );
      const testApp = express().use(router);
      const response = await request(testApp).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
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
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
        ansibleGitContentsProviders: [],
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
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
        ansibleGitContentsProviders: [],
      });

      const testApp = express().use(routerWithInvalidProvider);

      // The sync endpoint should fail when aapEntityProvider is undefined
      const response = await request(testApp).get(
        '/ansible/sync/from-aap/orgs_users_teams',
      );
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
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
        ansibleGitContentsProviders: [],
      });

      const testApp = express().use(routerWithInvalidProvider);

      // The sync endpoint should fail when jobTemplateProvider is undefined
      const response = await request(testApp).get(
        '/ansible/sync/from-aap/job_templates',
      );
      expect(response.status).toBe(500);
    });
  });

  describe('POST /ansible/sync/from-aap/content', () => {
    it('should trigger sync via scheduler and return 202 for all providers', async () => {
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
      expect(mockScheduler.triggerTask).toHaveBeenCalledWith(
        'PAHCollectionProvider:test:validated:run',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting PAH collections sync for repository name(s): validated',
      );
    });

    it('should trigger sync via scheduler when filters array is empty', async () => {
      const response = await request(app)
        .post('/ansible/sync/from-aap/content')
        .send({ filters: [] });

      expect(response.status).toBe(202);
      expect(response.body.summary.total).toBe(1);
      expect(response.body.summary.sync_started).toBe(1);
      expect(mockScheduler.triggerTask).toHaveBeenCalledTimes(1);
    });

    it('should trigger sync via scheduler for specific repository', async () => {
      const response = await request(app)
        .post('/ansible/sync/from-aap/content')
        .send({ filters: [{ repository_name: 'validated' }] });

      expect(response.status).toBe(202);
      expect(response.body.summary.sync_started).toBe(1);
      expect(mockScheduler.triggerTask).toHaveBeenCalledWith(
        'PAHCollectionProvider:test:validated:run',
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

    it('should return 500 when provider getTaskId returns undefined', async () => {
      mockPAHCollectionProvider.getTaskId.mockReturnValue(undefined);

      const response = await request(app)
        .post('/ansible/sync/from-aap/content')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.summary.failed).toBe(1);
      expect(response.body.results[0].status).toBe('failed');
      expect(response.body.results[0].error.code).toBe('SYNC_START_FAILED');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should filter out invalid repository names from filters and return 202', async () => {
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

    it('should return already_syncing when task is already running', async () => {
      mockScheduler.triggerTask.mockRejectedValue(
        new ConflictError('Task already running'),
      );

      const response = await request(app)
        .post('/ansible/sync/from-aap/content')
        .send({ filters: [{ repository_name: 'validated' }] });

      expect(response.status).toBe(200);
      expect(response.body.summary.already_syncing).toBe(1);
      expect(response.body.results[0].status).toBe('already_syncing');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Skipping sync for validated: sync already in progress',
      );
    });

    it('should return 207 with valid results and invalid repositories mixed', async () => {
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
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
        ansibleGitContentsProviders: [],
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
      mockHttpAuth.credentials.mockResolvedValue({} as any);
      mockUserInfo.getUserInfo.mockResolvedValue({
        userEntityRef: 'user:default/test-user',
        ownershipEntityRefs: ['user:default/test-user'],
      });
      mockAuth.getPluginRequestToken.mockResolvedValue({ token: 'mock-token' });
      mockCatalogClient.getEntityByRef.mockResolvedValue({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
          name: 'test-user',
          annotations: { 'aap.platform/is_superuser': 'true' },
        },
      });

      mockProvider1 = {
        run: jest.fn(),
        getProviderName: jest
          .fn()
          .mockReturnValue('PAHCollectionProvider:test:repo1'),
        getTaskId: jest
          .fn()
          .mockReturnValue('PAHCollectionProvider:test:repo1:run'),
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
        getProviderName: jest
          .fn()
          .mockReturnValue('PAHCollectionProvider:test:repo2'),
        getTaskId: jest
          .fn()
          .mockReturnValue('PAHCollectionProvider:test:repo2:run'),
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
        httpAuth: mockHttpAuth,
        userInfo: mockUserInfo,
        auth: mockAuth,
        catalogClient: mockCatalogClient,
        scheduler: mockScheduler,
        permissions: mockPermissions,
        ansibleGitContentsProviders: [],
      });

      appWithMultipleProviders = express().use(router);
    });

    it('should trigger both providers via scheduler and return 202', async () => {
      const response = await request(appWithMultipleProviders)
        .post('/ansible/sync/from-aap/content')
        .send({});

      expect(response.status).toBe(202);
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.sync_started).toBe(2);
      expect(mockScheduler.triggerTask).toHaveBeenCalledTimes(2);
    });

    it('should return 200 when all providers are already syncing', async () => {
      mockScheduler.triggerTask.mockRejectedValue(
        new ConflictError('Task already running'),
      );

      const response = await request(appWithMultipleProviders)
        .post('/ansible/sync/from-aap/content')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.already_syncing).toBe(2);
    });

    it('should return 207 when one succeeds and one is already syncing', async () => {
      mockScheduler.triggerTask
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new ConflictError('Task already running'));

      const response = await request(appWithMultipleProviders)
        .post('/ansible/sync/from-aap/content')
        .send({});

      expect(response.status).toBe(207);
      expect(response.body.summary.sync_started).toBe(1);
      expect(response.body.summary.already_syncing).toBe(1);
    });

    it('should return 500 when all providers have no taskId', async () => {
      mockProvider1.getTaskId.mockReturnValue(undefined);
      mockProvider2.getTaskId.mockReturnValue(undefined);

      const response = await request(appWithMultipleProviders)
        .post('/ansible/sync/from-aap/content')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.summary.failed).toBe(2);
    });

    it('should return 400 when mix of failed and invalid with no sync started', async () => {
      mockProvider1.getTaskId.mockReturnValue(undefined);

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
    });

    it('should return 207 when mix of sync_started and invalid', async () => {
      const response = await request(appWithMultipleProviders)
        .post('/ansible/sync/from-aap/content')
        .send({
          filters: [
            { repository_name: 'repo1' },
            { repository_name: 'nonexistent' },
          ],
        });

      expect(response.status).toBe(207);
      expect(response.body.summary.sync_started).toBe(1);
      expect(response.body.summary.invalid).toBe(1);
    });
  });
});
