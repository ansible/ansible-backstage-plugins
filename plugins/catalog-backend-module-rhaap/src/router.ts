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
import { PAHCollectionProvider } from './providers/PAHCollectionProvider';

export async function createRouter(options: {
  logger: LoggerService;
  aapEntityProvider: AAPEntityProvider;
  jobTemplateProvider: AAPJobTemplateProvider;
  eeEntityProvider: EEEntityProvider;
  pahCollectionProviders: PAHCollectionProvider[];
}): Promise<express.Router> {
  const {
    logger,
    aapEntityProvider,
    jobTemplateProvider,
    eeEntityProvider,
    pahCollectionProviders,
  } = options;
  const router = Router();

  // 1:1 mapping repository name -> PAHCollectionProvider (built once at router creation)
  const _PAH_PROVIDERS = new Map<string, PAHCollectionProvider>();
  logger.info(
    `[RHAAP Router]: Initializing with ${pahCollectionProviders.length} PAH collection provider(s)`,
  );
  for (const provider of pahCollectionProviders) {
    const repoName = provider.getPahRepositoryName();
    logger.info(
      `[RHAAP Router]: Registering PAH provider for repository: ${repoName}`,
    );
    _PAH_PROVIDERS.set(repoName, provider);
  }
  logger.info(
    `[RHAAP Router]: Available PAH repositories: ${Array.from(_PAH_PROVIDERS.keys()).join(', ') || 'none'}`,
  );

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

  router.get('/aap/sync_status', async (request, response) => {
    logger.info('Getting sync status');
    const aapEntities = request.query.aap_entities === 'true';

    try {
      const orgsUsersTeamsLastSync = aapEntityProvider.getLastSyncTime();
      const jobTemplatesLastSync = jobTemplateProvider.getLastSyncTime();

      if (aapEntities) {
        response.status(200).json({
          aap: {
            orgsUsersTeams: { lastSync: orgsUsersTeamsLastSync },
            jobTemplates: { lastSync: jobTemplatesLastSync },
          },
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get sync status: ${errorMessage}`);

      response.status(500).json({
        error: `Failed to get sync status: ${errorMessage}`,
        aap: {
          orgsUsersTeams: null,
          jobTemplates: null,
        },
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

  router.post(
    '/collections/sync/from-pah',
    express.json(),
    async (request, response) => {
      // Extract repository names from request body
      // Expected format: { "filters": [{ "repository_name": "rh-certified" }, { "repository_name": "validated" }] }
      const { filters } = request.body as {
        filters?: Array<{ repository_name: string }>;
      };

      let repositoryNames: string[];
      if (!filters || filters.length === 0) {
        // if no filters provided, assume all repositories should be synced
        repositoryNames = [];
      } else {
        // extract repository_name from each filter object
        repositoryNames = filters
          .map(f => f.repository_name)
          .filter(
            (name): name is string =>
              typeof name === 'string' && name.length > 0,
          );
      }

      let providersToRun: PAHCollectionProvider[];
      if (repositoryNames.length > 0) {
        // if filters are provided, sync only the repositories specified
        const notFound = repositoryNames.filter(n => !_PAH_PROVIDERS.has(n));
        if (notFound.length > 0) {
          response.status(400).json({
            success: false,
            error: `No provider found for repository name(s): ${notFound.join(', ')}`,
            notFound,
          });
          return;
        }
        // build a list of providers to run based on the repository names provided
        providersToRun = repositoryNames.map(name => _PAH_PROVIDERS.get(name)!);
      } else {
        // if no filters provided, run all providers
        providersToRun = pahCollectionProviders;
      }

      logger.info(
        `Starting PAH collections sync for repository name(s): ${repositoryNames.length > 0 ? repositoryNames.join(', ') : 'all'}`,
      );
      const results = await Promise.all(
        providersToRun.map(async provider => {
          const { success, collectionsCount } = await provider.run();
          return {
            repositoryName: provider.getPahRepositoryName(),
            providerName: provider.getProviderName(),
            success,
            collectionsCount,
          };
        }),
      );

      const allSucceeded = results.every(r => r.success);
      const failedProviders = results.filter(r => !r.success);

      if (allSucceeded) {
        response.status(200).json({
          success: true,
          providersRun: providersToRun.length,
          results,
        });
      } else {
        logger.error(
          `PAH collections sync failed for: ${failedProviders.map(r => r.repositoryName).join(', ')}`,
        );
        response.status(207).json({
          success: false,
          providersRun: providersToRun.length,
          results,
          failedRepositories: failedProviders.map(r => r.repositoryName),
        });
      }
    },
  );

  return router;
}
