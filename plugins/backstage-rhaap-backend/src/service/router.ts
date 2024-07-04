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
import { errorHandler } from '@backstage/backend-common';
import { Config } from '@backstage/config';

import express from 'express';
import Router from 'express-promise-router';
import { Logger } from 'winston';
import fetch from 'node-fetch';
import https from 'https';

export interface RouterOptions {
  logger: Logger;
  config: Config
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config } = options;

  const router = Router();
  router.use(express.json());

  router.get('/health', (_, response) => {
    logger.info('PONG!');
    response.json({ status: 'ok' });
  });
  router.use(errorHandler());

  router.get('/aap/subscription', async (_, response) => {
    try {
      // Read configuration
      const ansibleConfig = config.getConfig('ansible');
      const aapConfig = ansibleConfig.getConfig('aap');
      const baseUrl = aapConfig.getString('baseUrl');
      const token = aapConfig.getString('token');
      const checkSSL = aapConfig.getBoolean('checkSSL') ?? true;
      const agent = new https.Agent({
        rejectUnauthorized: checkSSL,
      });

      // Send request to AAP
      const aapResponse = await fetch(`${baseUrl}/api/v2/config/`, {
        headers: { 'Authorization': `Bearer ${token}` },
        agent,
      });
      logger.info(`[backstage-rhaap-backend] Checking AAP subscription at ${baseUrl}/api/v2/config/`)
      const data = await aapResponse.json();
      const hasValidSubscription = data?.license_info?.license_type === 'enterprise';

      // Return the subscription status
      response.json({ status: 'ok', valid: hasValidSubscription });
    } catch (error: any) {
      logger.error(`[backstage-rhaap-backend] Error checking AAP subscription: ${error}`);
      let statusCode;
      if (error.code === 'CERT_HAS_EXPIRED') {
        statusCode = 495;
      } else if (error.code === 'ECONNREFUSED') {
        statusCode = 404;
      }
      else {
        statusCode = Number.isInteger(error.code) && error.code >= 100 && error.code < 600 ? error.code : 500;
      }
      response.status(statusCode).json({ error: error.message || 'Internal server error' });
    }
  });

  return router;
}
