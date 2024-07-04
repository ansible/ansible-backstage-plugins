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
import { getVoidLogger } from '@backstage/backend-common';

// Mock node-fetch
jest.mock('node-fetch');
import fetch from 'node-fetch';

const { Response } = jest.requireActual('node-fetch');

describe('createRouter', () => {
  let app: express.Express;

  beforeAll(async () => {
    const router = await createRouter({
      logger: getVoidLogger(),
      config: new ConfigReader({
        ansible: {
          aap: {
            baseUrl: 'https://aap.example.com',
            token: 'test-token',
            checkSSL: false,
          },
        },
      }),
    });

    app = express().use(router);
  });

  beforeEach(() => {
    jest.resetAllMocks();
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
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce(
        new Response(JSON.stringify({ license_info: { license_type: 'enterprise' } }))
      );

      const response = await request(app).get('/aap/subscription');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok', valid: true });
    });

    it('returns invalid subscription status', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce(
        new Response(JSON.stringify({ license_info: { license_type: 'basic' } }))
      );

      const response = await request(app).get('/aap/subscription');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok', valid: false });
    });

    it('handles connection refused error', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        { code: 'ECONNREFUSED' }
      );

      const response = await request(app).get('/aap/subscription');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('handles certificate expired error', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        { code: 'CERT_HAS_EXPIRED' }
      );

      const response = await request(app).get('/aap/subscription');
      expect(response.status).toBe(495);
      expect(response.body).toHaveProperty('error');
    });

    it('handles generic error', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('Internal server error')
      );

      const response = await request(app).get('/aap/subscription');
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});
