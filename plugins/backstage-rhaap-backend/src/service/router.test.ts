/*
 * Copyright 2024 The Ansible plugin Authors
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
import { ConfigReader } from '@backstage/config';
import { mockServices } from '@backstage/backend-test-utils';

import { RHAAPService } from './ansibleRHAAPService';

describe('createRouter', () => {
  let app: express.Express;
  let getSubscriptionStatusMock: any;
  const logger = mockServices.logger.mock();
  const config = new ConfigReader({
    ansible: {
      rhaap: {
        baseUrl: 'https://aap.example.com',
        token: 'test-token',
        checkSSL: false,
        schedule: {
          frequency: {
            minutes: 1
          },
          timeout: {
            minutes: 1
          }
        }
      },
    },
  });

  beforeAll(async () => {
    const router = await createRouter({logger, config});

    app = express().use(router);
    getSubscriptionStatusMock = jest
      .spyOn(RHAAPService.prototype, 'getSubscriptionStatus')
      .mockImplementationOnce(() => {
        return {status: 200, isValid: true, isCompliant: false}
      })
      .mockImplementationOnce(() => {
        return {status: 200, isValid: false, isCompliant: false}
      })
      .mockImplementationOnce(() => {
        return {status: 404, isValid: false, isCompliant: false}
      })
      .mockImplementationOnce(() => {
        return {status: 495, isValid: false, isCompliant: false}
      })
      .mockImplementationOnce(() => {
        return {status: 500, isValid: false, isCompliant: false}
      })
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('returns ok status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /aap/subscription', () => {
    it('returns valid subscription status', async () => {
      const response = await request(app).get('/aap/subscription');
      expect(getSubscriptionStatusMock).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
      expect(response.body.isValid).toEqual(true);
    });

    it('returns invalid subscription status', async () => {
      const response = await request(app).get('/aap/subscription');
      expect(getSubscriptionStatusMock).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
      expect(response.body.isValid).toEqual(false);
    });

    it('handles connection refused error', async () => {
      const response = await request(app).get('/aap/subscription');
      expect(getSubscriptionStatusMock).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(404);
    });

    it('handles certificate expired error', async () => {
      const response = await request(app).get('/aap/subscription');
      expect(getSubscriptionStatusMock).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(495);
    });

    it('handles generic error', async () => {
      const response = await request(app).get('/aap/subscription');
      expect(response.status).toBe(500);
    });
  });
});
