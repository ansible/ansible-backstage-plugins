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

import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import { AAPEntityProvider } from './providers/AAPEntityProvider';
import { AAPJobTemplateProvider } from './providers/AAPJobTemplateProvider';
import { LoggerService } from '@backstage/backend-plugin-api';
import { EEEntityProvider } from './providers/EEEntityProvider';
import { DiscoveryService, AuthService } from '@backstage/backend-plugin-api';

describe('createRouter', () => {
  let app: express.Express;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockAAPEntityProvider: jest.Mocked<AAPEntityProvider>;
  let mockJobTemplateProvider: jest.Mocked<AAPJobTemplateProvider>;
  let mockEEEntityProvider: jest.Mocked<EEEntityProvider>;
  let mockDiscovery: jest.Mocked<DiscoveryService>;
  let mockAuth: jest.Mocked<AuthService>;

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
    } as unknown as jest.Mocked<AAPEntityProvider>;

    mockJobTemplateProvider = {
      run: jest.fn(),
      getProviderName: jest.fn().mockReturnValue('AAPJobTemplateProvider:test'),
      connect: jest.fn(),
    } as unknown as jest.Mocked<AAPJobTemplateProvider>;

    mockEEEntityProvider = {
      run: jest.fn(),
      getProviderName: jest.fn().mockReturnValue('EEEntityProvider:test'),
      connect: jest.fn(),
    } as unknown as jest.Mocked<EEEntityProvider>;

    mockDiscovery = {
      getBaseUrl: jest
        .fn()
        .mockResolvedValue('http://localhost:7007/api/catalog'),
    } as unknown as jest.Mocked<DiscoveryService>;

    mockAuth = {
      getOwnServiceCredentials: jest
        .fn()
        .mockResolvedValue({ principal: { type: 'service' } }),
      getPluginRequestToken: jest
        .fn()
        .mockResolvedValue({ token: 'mock-service-token' }),
    } as unknown as jest.Mocked<AuthService>;

    const router = await createRouter({
      logger: mockLogger,
      aapEntityProvider: mockAAPEntityProvider,
      jobTemplateProvider: mockJobTemplateProvider,
      eeEntityProvider: mockEEEntityProvider,
      discovery: mockDiscovery,
      auth: mockAuth,
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
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          discovery: mockDiscovery,
          auth: mockAuth,
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
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          discovery: mockDiscovery,
          auth: mockAuth,
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
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          discovery: mockDiscovery,
          auth: mockAuth,
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
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          discovery: mockDiscovery,
          auth: mockAuth,
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
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          discovery: mockDiscovery,
          auth: mockAuth,
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
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          discovery: mockDiscovery,
          auth: mockAuth,
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
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          discovery: mockDiscovery,
          auth: mockAuth,
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
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          discovery: mockDiscovery,
          auth: mockAuth,
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
          aapEntityProvider: mockProvider as any,
          jobTemplateProvider: {} as any,
          eeEntityProvider: mockEEEntityProvider,
          discovery: mockDiscovery,
          auth: mockAuth,
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
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        discovery: mockDiscovery,
        auth: mockAuth,
      });

      const testApp = express().use(routerWithInvalidLogger);

      // The /health endpoint should fail when logger is undefined
      const response = await request(testApp).get('/health');
      expect(response.status).toBe(500);
    });

    it('should handle error when aapEntityProvider is not provided', async () => {
      const routerWithInvalidProvider = await createRouter({
        logger: mockLogger,
        aapEntityProvider: undefined as any,
        jobTemplateProvider: mockJobTemplateProvider,
        eeEntityProvider: mockEEEntityProvider,
        discovery: mockDiscovery,
        auth: mockAuth,
      });

      const testApp = express().use(routerWithInvalidProvider);

      // The sync endpoint should fail when aapEntityProvider is undefined
      const response = await request(testApp).get('/aap/sync_orgs_users_teams');
      expect(response.status).toBe(500);
    });

    it('should handle error when jobTemplateProvider is not provided', async () => {
      const routerWithInvalidProvider = await createRouter({
        logger: mockLogger,
        aapEntityProvider: mockAAPEntityProvider,
        jobTemplateProvider: undefined as any,
        eeEntityProvider: mockEEEntityProvider,
        discovery: mockDiscovery,
        auth: mockAuth,
      });

      const testApp = express().use(routerWithInvalidProvider);

      // The sync endpoint should fail when jobTemplateProvider is undefined
      const response = await request(testApp).get('/aap/sync_job_templates');
      expect(response.status).toBe(500);
    });
  });
});
