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
import { AnsibleGitContentsProvider } from './providers/ansible-collections';
import {
  SyncFilter,
  parseSourceId,
  buildSourcesTree,
  findMatchingProviders,
  buildFilterDescription,
} from './helpers';

export async function createRouter(options: {
  logger: LoggerService;
  aapEntityProvider: AAPEntityProvider;
  jobTemplateProvider: AAPJobTemplateProvider;
  eeEntityProvider: EEEntityProvider;
  ansibleGitContentsProviders?: AnsibleGitContentsProvider[];
}): Promise<express.Router> {
  const {
    logger,
    aapEntityProvider,
    jobTemplateProvider,
    eeEntityProvider,
    ansibleGitContentsProviders = [],
  } = options;
  const router = Router();

  // Note: Don't apply express.json() globally to avoid conflicts with catalog backend
  // Instead, apply it only to specific routes that need it

  const _GIT_CONTENTS_PROVIDERS = new Map<string, AnsibleGitContentsProvider>();
  for (const provider of ansibleGitContentsProviders) {
    _GIT_CONTENTS_PROVIDERS.set(provider.getSourceId(), provider);
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
    logger.info('Getting Ansible Git Contents sync status');
    try {
      const sources = ansibleGitContentsProviders.map(provider => {
        const syncStatus = provider.getSyncStatus();
        const providerInfo = parseSourceId(provider.getSourceId());
        return {
          ...syncStatus,
          scmProvider: providerInfo.scmProvider,
          host: providerInfo.host,
          organization: providerInfo.organization,
        };
      });

      const sourcesTree = buildSourcesTree(ansibleGitContentsProviders);

      response.status(200).json({
        sources,
        sourcesTree,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to get Ansible Git Contents sync status: ${errorMessage}`,
      );
      response.status(500).json({
        error: `Failed to get sync status: ${errorMessage}`,
        sources: [],
        sourcesTree: {},
      });
    }
  });

  // sync endpoint with flexible hierarchical filtering
  // supports UI tree selection:
  //  - all sources (no filters or empty body)
  //  - by scmProvider (e.g., all github sources)
  //  - by host (e.g., all sources from github.com)
  //  - by organization (e.g., specific org)
  //
  // request body examples:
  //  {} or { "filters": [] } -> sync all sources
  //  { "filters": [{ "scmProvider": "github" }] } -> all github sources
  //  { "filters": [{ "host": "github.com" }] } -> all sources with host github.com
  //  { "filters": [{ "organization": "ansible-collections" }] } -> specific org (across all providers/hosts)
  //  { "filters": [{ "scmProvider": "github", "host": "github.com" }] } -> host github.com in scmProvider github
  //  { "filters": [
  //      { "scmProvider": "github", "host": "github.com", "organization": "ansible-collections" },
  //      { "scmProvider": "gitlab" }
  //    ]
  //  } -> multiple selections
  router.post(
    '/ansible-collections/sync',
    express.json(),
    async (request, response) => {
      const { filters = [] } = request.body as { filters?: SyncFilter[] };

      logger.info(
        `Triggering Ansible Git Contents sync for ${buildFilterDescription(filters)}`,
      );

      try {
        const providersToSync =
          filters.length === 0
            ? ansibleGitContentsProviders
            : getProvidersFromFilters(filters);

        if (providersToSync.length === 0) {
          response.status(404).json({
            success: false,
            error: 'No sources match the provided filters',
            filters,
            availableSources: buildSourcesTree(ansibleGitContentsProviders),
          });
          return;
        }

        const settledResults = await Promise.allSettled(
          providersToSync.map(provider => provider.run()),
        );

        const results = buildSyncResults(providersToSync, settledResults);
        const successCount = results.filter(r => r.success).length;

        response.status(200).json({
          success: successCount === results.length,
          providersRun: results.length,
          successCount,
          failureCount: results.length - successCount,
          results,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(`Failed to sync Ansible Git Contents: ${errorMessage}`);
        response.status(500).json({
          success: false,
          error: `Failed to sync Ansible Git Contents: ${errorMessage}`,
        });
      }
    },
  );

  function getProvidersFromFilters(
    filters: SyncFilter[],
  ): AnsibleGitContentsProvider[] {
    const matchedIds = findMatchingProviders(
      ansibleGitContentsProviders,
      filters,
    );
    return Array.from(matchedIds).map(id => _GIT_CONTENTS_PROVIDERS.get(id)!);
  }

  function buildSyncResults(
    providers: AnsibleGitContentsProvider[],
    settledResults: PromiseSettledResult<boolean>[],
  ) {
    return settledResults.map((result, index) => {
      const provider = providers[index];
      const providerInfo = parseSourceId(provider.getSourceId());
      const baseResult = {
        sourceId: provider.getSourceId(),
        scmProvider: providerInfo.scmProvider,
        host: providerInfo.host,
        organization: providerInfo.organization,
      };

      if (result.status === 'fulfilled') {
        return { ...baseResult, success: result.value };
      }

      return {
        ...baseResult,
        success: false,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      };
    });
  }

  return router;
}
