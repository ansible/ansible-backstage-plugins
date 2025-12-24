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
import Router from 'express-promise-router';

import { AAPJobTemplateProvider } from './providers/AAPJobTemplateProvider';
import { AAPEntityProvider } from './providers/AAPEntityProvider';
import { LoggerService } from '@backstage/backend-plugin-api';
import { EEEntityProvider } from './providers/EEEntityProvider';

export async function createRouter(options: {
  logger: LoggerService;
  aapEntityProvider: AAPEntityProvider;
  jobTemplateProvider: AAPJobTemplateProvider;
  eeEntityProvider: EEEntityProvider;
}): Promise<express.Router> {
  const { logger, aapEntityProvider, jobTemplateProvider, eeEntityProvider } =
    options;
  const router = Router();

  // Note: Don't apply express.json() globally to avoid conflicts with catalog backend
  // Instead, apply it only to specific routes that need it

  router.get('/health', (_, response) => {
    logger.info('PONG!');
    response.json({ status: 'ok' });
  });

  router.get('/aap/sync_orgs_users_teams', async (_, response) => {
    logger.info('Starting orgs, users and teams sync');
    const res = await aapEntityProvider.run();
    response.status(200).json(res);
  });

  router.get('/aap/sync_job_templates', async (_, response) => {
    logger.info('Starting job templates sync');
    const res = await jobTemplateProvider.run();
    response.status(200).json(res);
  });

  router.post('/aap/create_user', express.json(), async (request, response) => {
    const { username, userID } = request.body;
    if (!username || userID === undefined || userID === null) {
      response
        .status(400)
        .json({ error: 'Missing username and user id in request body.' });
      return;
    }

    logger.info(`Creating user ${username} in catalog`);
    try {
      const res = await aapEntityProvider.createSingleUser(username, userID);
      response
        .status(200)
        .json({ success: true, user: username, created: res });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create user ${username}: ${errorMessage}`);
      response
        .status(500)
        .json({ error: `Failed to create user: ${errorMessage}` });
    }
  });

  router.post('/register_ee', express.json(), async (request, response) => {
    const { entity } = request.body;

    if (!entity) {
      response.status(400).json({ error: 'Missing entity in request body.' });
      return;
    }

    try {
      await eeEntityProvider.registerExecutionEnvironment(entity);
      response.status(200).json({ success: true });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to register Execution Environment: ${errorMessage}`);
      response.status(500).json({
        error: `Failed to register Execution Environment: ${errorMessage}`,
      });
    }
  });

  return router;
}
