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
import { SyncStatus } from './helpers';

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
  for (const provider of pahCollectionProviders) {
    _PAH_PROVIDERS.set(provider.getPahRepositoryName(), provider);
  }

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

  router.get('/ansible/sync/status', async (request, response) => {
    logger.info('Getting sync status');
    const aapEntities = request.query.aap_entities === 'true';
    const ansibleContents = request.query.ansible_contents === 'true';
    const noQueryParams =
      request.query.aap_entities === undefined &&
      request.query.ansible_contents === undefined;

    try {
      const result: {
        aap?: {
          orgsUsersTeams: { lastSync: string | null };
          jobTemplates: { lastSync: string | null };
        };
        content?: {
          syncInProgress: boolean;
          providers: Array<{
            sourceId: string;
            repository: string;
            providerName: string;
            enabled: boolean;
            syncInProgress: boolean;
            lastSyncTime: string | null;
            lastFailedSyncTime: string | null;
            lastSyncStatus: 'success' | 'failure' | null;
            collectionsFound: number;
            collectionsDelta: number;
          }>;
        };
      } = {};

      // Include aap block if aap_entities=true or no query params
      if (aapEntities || noQueryParams) {
        result.aap = {
          orgsUsersTeams: {
            lastSync: aapEntityProvider.getLastSyncTime(),
          },
          jobTemplates: {
            lastSync: jobTemplateProvider.getLastSyncTime(),
          },
        };
      }

      // Include content block if ansible_contents=true or no query params
      if (ansibleContents || noQueryParams) {
        // Return per-provider status
        const providers = pahCollectionProviders.map(provider => ({
          sourceId: provider.getSourceId(),
          repository: provider.getPahRepositoryName(),
          providerName: provider.getProviderName(),
          enabled: provider.isEnabled(),
          syncInProgress: provider.getIsSyncing(),
          lastSyncTime: provider.getLastSyncTime(),
          lastFailedSyncTime: provider.getLastFailedSyncTime(),
          lastSyncStatus: provider.getLastSyncStatus(),
          collectionsFound: provider.getCurrentCollectionsCount(),
          collectionsDelta: provider.getCollectionsDelta(),
        }));

        const anySyncInProgress = providers.some(p => p.syncInProgress);

        result.content = {
          syncInProgress: anySyncInProgress,
          providers,
        };
      }

      response.status(200).json(result);
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
        content: null,
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
    '/ansible/sync/from-aap/content',
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

      // Separate valid and invalid repository names
      const invalidRepositories: string[] = [];
      let providersToRun: PAHCollectionProvider[];

      if (repositoryNames.length > 0) {
        // Filter out invalid repositories but don't fail the request
        const validNames: string[] = [];
        for (const name of repositoryNames) {
          if (_PAH_PROVIDERS.has(name)) {
            validNames.push(name);
          } else {
            invalidRepositories.push(name);
          }
        }
        providersToRun = validNames.map(name => _PAH_PROVIDERS.get(name)!);
      } else {
        // if no filters provided, run all providers
        providersToRun = pahCollectionProviders;
      }

      logger.info(
        `Starting PAH collections sync for repository name(s): ${
          providersToRun.length > 0
            ? providersToRun.map(p => p.getPahRepositoryName()).join(', ')
            : 'none'
        }`,
      );

      type SyncResultStatus =
        | 'sync_started'
        | 'already_syncing'
        | 'failed'
        | 'invalid';
      interface SyncResult {
        repositoryName: string;
        providerName?: string;
        status: SyncResultStatus;
        error?: { code: string; message: string };
      }

      const results: SyncResult[] = providersToRun.map(provider => {
        const repositoryName = provider.getPahRepositoryName();
        const providerName = provider.getProviderName();

        const { started, skipped, error } = provider.startSync();

        if (skipped) {
          logger.info(
            `Skipping sync for ${repositoryName}: sync already in progress`,
          );
          return {
            repositoryName,
            providerName,
            status: 'already_syncing' as SyncResultStatus,
          };
        }

        if (!started) {
          logger.error(
            `Failed to start sync for ${repositoryName}: ${
              error ?? 'unknown error'
            }`,
          );
          return {
            repositoryName,
            providerName,
            status: 'failed' as SyncResultStatus,
            error: {
              code: 'SYNC_START_FAILED',
              message: error ?? 'Failed to initiate sync for provider',
            },
          };
        }

        return {
          repositoryName,
          providerName,
          status: 'sync_started' as SyncResultStatus,
        };
      });

      for (const invalidRepo of invalidRepositories) {
        results.push({
          repositoryName: invalidRepo,
          status: 'invalid' as SyncResultStatus,
          error: {
            code: 'INVALID_REPOSITORY',
            message: `Repository '${invalidRepo}' not found in configured providers`,
          },
        });
      }

      const summary: SyncStatus & { total: number } = {
        total: results.length,
        sync_started: results.filter(r => r.status === 'sync_started').length,
        already_syncing: results.filter(r => r.status === 'already_syncing')
          .length,
        failed: results.filter(r => r.status === 'failed').length,
        invalid: results.filter(r => r.status === 'invalid').length,
      };

      const hasFailures = results.some(r => r.status === 'failed');
      const hasStarted = results.some(r => r.status === 'sync_started');
      const hasInvalid = results.some(r => r.status === 'invalid');
      const allStarted =
        results.length > 0 && results.every(r => r.status === 'sync_started');
      const allSkipped =
        results.length > 0 &&
        results.every(r => r.status === 'already_syncing');
      const allFailed =
        results.length > 0 && results.every(r => r.status === 'failed');
      const allInvalid =
        results.length > 0 && results.every(r => r.status === 'invalid');
      const emptyRequest =
        repositoryNames.length === 0 && pahCollectionProviders.length === 0;

      let statusCode: number;
      if (
        allInvalid ||
        emptyRequest ||
        (hasInvalid && hasFailures && !hasStarted)
      ) {
        statusCode = 400;
      } else if (allFailed) {
        statusCode = 500;
      } else if (allStarted) {
        statusCode = 202;
      } else if (allSkipped) {
        statusCode = 200;
      } else {
        // Mixed results (e.g., some started + some skipped/failed/invalid)
        statusCode = 207;
      }

      response.status(statusCode).json({
        summary,
        results,
      });
    },
  );

  return router;
}
