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
import { AnsibleCollectionProvider } from './providers/ansible-collections';

export async function createRouter(options: {
  logger: LoggerService;
  aapEntityProvider: AAPEntityProvider;
  jobTemplateProvider: AAPJobTemplateProvider;
  eeEntityProvider: EEEntityProvider;
  ansibleCollectionProviders?: AnsibleCollectionProvider[];
}): Promise<express.Router> {
  const {
    logger,
    aapEntityProvider,
    jobTemplateProvider,
    eeEntityProvider,
    ansibleCollectionProviders = [],
  } = options;
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

  router.get('/aap/sync_status', async (_, response) => {
    logger.info('Getting sync status');
    try {
      const orgsUsersTeamsLastSync = aapEntityProvider.getLastSyncTime();
      const jobTemplatesLastSync = jobTemplateProvider.getLastSyncTime();

      response.status(200).json({
        orgsUsersTeams: { lastSync: orgsUsersTeamsLastSync },
        jobTemplates: { lastSync: jobTemplatesLastSync },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get sync status: ${errorMessage}`);
      response.status(500).json({
        error: `Failed to get sync status: ${errorMessage}`,
        orgsUsersTeams: { lastSync: null },
        jobTemplates: { lastSync: null },
      });
    }
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

  router.get('/ansible-collections/sync_status', async (_, response) => {
    logger.info('Getting Ansible collections sync status');
    try {
      const status = ansibleCollectionProviders.map(provider =>
        provider.getSyncStatus(),
      );
      response.status(200).json({ sources: status });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to get Ansible collections sync status: ${errorMessage}`,
      );
      response.status(500).json({
        error: `Failed to get sync status: ${errorMessage}`,
        sources: [],
      });
    }
  });

  // TO-DO: refactor this sync till orgs level deep
  router.post(
    '/ansible-collections/sync',
    express.json(),
    async (request, response) => {
      const { sourceId } = request.body;
      logger.info(
        `Starting Ansible collections sync${sourceId ? ` for source: ${sourceId}` : ' for all sources'}`,
      );

      try {
        const results: Array<{
          sourceId: string;
          success: boolean;
          error?: string;
        }> = [];

        const providersToSync = sourceId
          ? ansibleCollectionProviders.filter(p => p.getSourceId() === sourceId)
          : ansibleCollectionProviders;

        if (sourceId && providersToSync.length === 0) {
          response.status(404).json({
            error: `Source not found: ${sourceId}`,
            availableSources: ansibleCollectionProviders.map(p =>
              p.getSourceId(),
            ),
          });
          return;
        }

        for (const provider of providersToSync) {
          try {
            const success = await provider.run();
            results.push({
              sourceId: provider.getSourceId(),
              success,
            });
          } catch (syncError) {
            const errorMessage =
              syncError instanceof Error
                ? syncError.message
                : String(syncError);
            results.push({
              sourceId: provider.getSourceId(),
              success: false,
              error: errorMessage,
            });
          }
        }

        response.status(200).json({ results });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(`Failed to sync Ansible collections: ${errorMessage}`);
        response.status(500).json({
          error: `Failed to sync Ansible collections: ${errorMessage}`,
        });
      }
    },
  );

  return router;
}
