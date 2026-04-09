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
import type { Config } from '@backstage/config';

import { AAPJobTemplateProvider } from './providers/AAPJobTemplateProvider';
import { AAPEntityProvider } from './providers/AAPEntityProvider';
import {
  LoggerService,
  HttpAuthService,
  UserInfoService,
  AuthService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { catalogEntityReadPermission } from '@backstage/plugin-catalog-common/alpha';
import {
  gitRepositoriesViewPermission,
  executionEnvironmentsViewPermission,
  collectionsViewPermission,
} from '@ansible/backstage-rhaap-common/permissions';
import { CatalogClient } from '@backstage/catalog-client';
import { PAHCollectionProvider } from './providers/PAHCollectionProvider';
import { AnsibleGitContentsProvider } from './providers/AnsibleGitContentsProvider';
import {
  SyncFilter,
  parseSourceId,
  findMatchingProviders,
  validateSyncFilter,
  SyncStatus,
  SyncResultStatus,
  SCMSyncResult,
  getSyncResponseStatusCode,
  buildInvalidRepositoryResults,
  resolveProvidersToRun,
  createRequireSuperuserMiddleware,
  createRequireUserOrExternalAccessMiddleware,
  createPermissionCheckMiddleware,
  handleGitHubCIActivity,
  handleGitLabCIActivity,
  parseEeBuildRequestBody,
  validateGitHubHost,
  isKnownEeBuildError,
  resolveEntityAndRepo,
  dispatchEeBuild,
  isScmIntegrationAuthFailure,
} from './helpers';
import { SCM_INTEGRATION_AUTH_FAILED_CODE } from '@ansible/backstage-rhaap-common/constants';
import { ScmClientFactory } from '@ansible/backstage-rhaap-common';
import { EEEntityProvider } from './providers/EEEntityProvider';

export async function createRouter(options: {
  logger: LoggerService;
  config: Config;
  aapEntityProvider: AAPEntityProvider;
  jobTemplateProvider: AAPJobTemplateProvider;
  eeEntityProvider: EEEntityProvider;
  pahCollectionProviders: PAHCollectionProvider[];
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  auth: AuthService;
  catalogClient: CatalogClient;
  permissions: PermissionsService;
  ansibleGitContentsProviders?: AnsibleGitContentsProvider[];
  allowedExternalAccessSubjects?: string[];
}): Promise<express.Router> {
  const {
    logger,
    config,
    aapEntityProvider,
    jobTemplateProvider,
    eeEntityProvider,
    pahCollectionProviders,
    httpAuth,
    userInfo,
    auth,
    catalogClient,
    permissions,
    ansibleGitContentsProviders = [],
    allowedExternalAccessSubjects,
  } = options;
  const router = Router();
  const scmClientFactory = new ScmClientFactory({ rootConfig: config, logger });

  // Note: Don't apply express.json() globally to avoid conflicts with catalog backend.
  // Apply it only to specific routes that need JSON body parsing (e.g. POST handlers).

  // 1:1 mapping repository name -> PAHCollectionProvider (built once at router creation)
  const _PAH_PROVIDERS = new Map<string, PAHCollectionProvider>();
  for (const provider of pahCollectionProviders) {
    _PAH_PROVIDERS.set(provider.getPahRepositoryName(), provider);
  }

  const _GIT_CONTENTS_PROVIDERS = new Map<string, AnsibleGitContentsProvider>();
  for (const provider of ansibleGitContentsProviders) {
    _GIT_CONTENTS_PROVIDERS.set(provider.getSourceId(), provider);
  }

  const requireSuperuserMiddleware = createRequireSuperuserMiddleware({
    httpAuth,
    userInfo,
    auth,
    catalogClient,
    logger,
    allowedExternalAccessSubjects,
  });

  const requireUserOrExternalAccessForEeBuild =
    createRequireUserOrExternalAccessMiddleware({
      httpAuth,
      auth,
      logger,
      allowedExternalAccessSubjects,
    });

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

  router.get(
    '/ansible/sync/status',
    requireSuperuserMiddleware,
    async (request, response) => {
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
              repository?: string;
              scmProvider?: string;
              hostName?: string;
              organization?: string;
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

        if (ansibleContents || noQueryParams) {
          const pahProviders = pahCollectionProviders.map(provider => ({
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
          const scmProviders = ansibleGitContentsProviders.map(provider => {
            const providerInfo = parseSourceId(provider.getSourceId());
            return {
              sourceId: provider.getSourceId(),
              scmProvider: providerInfo.scmProvider,
              hostName: providerInfo.hostName,
              organization: providerInfo.organization,
              providerName: provider.getProviderName(),
              enabled: provider.isEnabled(),
              syncInProgress: provider.getIsSyncing(),
              lastSyncTime: provider.getLastSyncTime(),
              lastFailedSyncTime: provider.getLastFailedSyncTime(),
              lastSyncStatus: provider.getLastSyncStatus(),
              collectionsFound: provider.getCurrentCollectionsCount(),
              collectionsDelta: provider.getCollectionsDelta(),
            };
          });
          const providers = [...pahProviders, ...scmProviders];
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
    },
  );

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

  router.post('/ansible/ee', express.json(), async (request, response) => {
    // Only allow backend service calls (for example, scaffolder to catalog), not user requests
    await httpAuth.credentials(
      // Express Request (express-promise-router) vs Backstage's `credentials` param use incompatible Express generics; runtime value is valid.
      // @ts-expect-error Avoid double assertion flagged by Sonar; types do not overlap per TS (e.g. `param` on Request).
      request,
      {
        allow: ['service'],
      },
    );

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

  /**
   * Triggers GitHub Actions `ee-build.yml` via workflow_dispatch.
   * Authenticated Backstage user or allowlisted external-access (service) token; loads the EE entity
   * with that principal's catalog token so RBAC applies.
   */
  router.post(
    '/ansible/ee/build',
    express.json(),
    requireUserOrExternalAccessForEeBuild,
    createPermissionCheckMiddleware({ httpAuth, permissions }, [
      executionEnvironmentsViewPermission,
      catalogEntityReadPermission,
    ]),
    async (request, response) => {
      const perms = response.locals.permissions as Record<string, boolean>;
      if (!Object.values(perms).every(Boolean)) {
        response
          .status(403)
          .json({ error: 'Forbidden: insufficient permissions' });
        return;
      }

      let parsedBody;
      try {
        parsedBody = parseEeBuildRequestBody(request.body);
      } catch (e) {
        response.status(400).json({
          error: e instanceof Error ? e.message : String(e),
        });
        return;
      }

      const resolved = await resolveEntityAndRepo(
        response,
        auth,
        catalogClient,
        parsedBody.entityRef,
      );
      if (!resolved) return;
      const { gh, eeDir, eeFileName } = resolved;

      if (!eeDir || !eeFileName) {
        response.status(400).json({
          error:
            'Could not determine ee_dir/ee_file_name from entity annotations.',
        });
        return;
      }

      const hostErr = validateGitHubHost(config, gh.host);
      if (hostErr) {
        response.status(400).json({ error: hostErr });
        return;
      }

      const githubToken = request.headers['x-github-token'] as string;
      if (!githubToken) {
        response.status(400).json({
          error:
            'No GitHub token available to dispatch the workflow. Send X-Github-Token header.',
        });
        return;
      }

      try {
        await dispatchEeBuild({
          response,
          logger,
          config,
          gh,
          eeDir,
          eeFileName,
          githubToken,
          parsedBody,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (isKnownEeBuildError(msg)) {
          logger.debug(`[ansible/ee/build] Bad request: ${msg}`);
          response.status(400).json({ error: msg });
          return;
        }
        logger.error(`[ansible/ee/build] ${msg}`);
        response
          .status(500)
          .json({ error: 'Internal error during EE build dispatch' });
      }
    },
  );

  router.post(
    '/ansible/sync/from-aap/content',
    express.json(),
    requireSuperuserMiddleware,
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

      const { providersToRun, invalidRepositories } = resolveProvidersToRun(
        repositoryNames,
        _PAH_PROVIDERS,
        pahCollectionProviders,
      );

      logger.info(
        `Starting PAH collections sync for repository name(s): ${
          providersToRun.length > 0
            ? providersToRun.map(p => p.getPahRepositoryName()).join(', ')
            : 'none'
        }`,
      );

      interface PAHSyncResult {
        repositoryName: string;
        providerName?: string;
        status: SyncResultStatus;
        error?: { code: string; message: string };
      }

      const results: PAHSyncResult[] = providersToRun.map(provider => {
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

      results.push(...buildInvalidRepositoryResults(invalidRepositories));

      const summary: SyncStatus & { total: number } = {
        total: results.length,
        sync_started: results.filter(r => r.status === 'sync_started').length,
        already_syncing: results.filter(r => r.status === 'already_syncing')
          .length,
        failed: results.filter(r => r.status === 'failed').length,
        invalid: results.filter(r => r.status === 'invalid').length,
      };

      const emptyRequest =
        repositoryNames.length === 0 && pahCollectionProviders.length === 0;

      const statusCode = getSyncResponseStatusCode({ results, emptyRequest });

      response.status(statusCode).json({
        summary,
        results,
      });
    },
  );

  // sync endpoint using POST with hierarchical filtering
  // filter hierarchy: scmProvider -> hostName -> organization
  //  - scmProvider can come alone (syncs all hosts and orgs for that provider)
  //  - hostName requires scmProvider
  //  - organization requires both scmProvider and hostName
  //
  // request body examples:
  //  {} or { "filters": [] } -> sync all sources
  //  { "filters": [{ "scmProvider": "github" }] } -> all github sources
  //  { "filters": [{ "scmProvider": "github", "hostName": "my-source-1" }] } -> all orgs in my-source-1
  //  { "filters": [{ "scmProvider": "gitlab", "hostName": "my-source-2", "organization": "ansible-team" }] } -> particular org sync
  //  { "filters": [
  //      { "scmProvider": "github", "hostName": "my-source-1", "organization": "ansible-collections" },
  //      { "scmProvider": "gitlab" }
  //    ]
  //  } -> multiple selections
  router.post(
    '/ansible/sync/from-scm/content',
    express.json(),
    requireSuperuserMiddleware,
    async (request, response) => {
      const { filters = [] } = request.body as { filters?: SyncFilter[] };
      const invalidFilters: Array<{ filter: SyncFilter; error: string }> = [];
      for (const filter of filters) {
        const validationError = validateSyncFilter(filter);
        if (validationError) {
          invalidFilters.push({ filter, error: validationError });
        }
      }

      const validFilters = filters.filter(
        f => !invalidFilters.some(inv => inv.filter === f),
      );
      const providersToSync =
        filters.length === 0
          ? ansibleGitContentsProviders
          : getProvidersFromFilters(validFilters);

      logger.info(
        `Starting Ansible Git Contents sync for ${
          providersToSync.length > 0
            ? providersToSync.map(p => p.getSourceId()).join(', ')
            : 'none'
        }`,
      );

      const results: SCMSyncResult[] = providersToSync.map(provider => {
        const sourceId = provider.getSourceId();
        const providerName = provider.getProviderName();
        const { scmProvider, hostName, organization } = parseSourceId(sourceId);

        const { started, skipped, error } = provider.startSync();

        if (skipped) {
          logger.info(
            `Skipping sync for ${sourceId}: sync already in progress`,
          );
          return {
            scmProvider,
            hostName,
            organization,
            providerName,
            status: 'already_syncing' as SyncResultStatus,
          };
        }

        if (!started) {
          logger.error(
            `Failed to start sync for ${sourceId}: ${error ?? 'unknown error'}`,
          );
          return {
            scmProvider,
            hostName,
            organization,
            providerName,
            status: 'failed' as SyncResultStatus,
            error: {
              code: 'SYNC_START_FAILED',
              message: error ?? 'Failed to initiate sync for provider',
            },
          };
        }

        return {
          scmProvider,
          hostName,
          organization,
          providerName,
          status: 'sync_started' as SyncResultStatus,
        };
      });

      for (const { filter, error } of invalidFilters) {
        results.push({
          scmProvider: filter.scmProvider || '',
          hostName: filter.hostName || '',
          organization: filter.organization || '',
          status: 'invalid' as SyncResultStatus,
          error: {
            code: 'INVALID_FILTER',
            message: error,
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

      const emptyRequest =
        filters.length === 0 && ansibleGitContentsProviders.length === 0;
      const statusCode = getSyncResponseStatusCode({ results, emptyRequest });

      response.status(statusCode).json({
        summary,
        results,
      });
    },
  );

  function getProvidersFromFilters(
    filters: SyncFilter[],
  ): AnsibleGitContentsProvider[] {
    const matchedIds = findMatchingProviders(
      ansibleGitContentsProviders,
      filters,
    );
    return Array.from(matchedIds).flatMap(id => {
      const provider = _GIT_CONTENTS_PROVIDERS.get(id);
      return provider === undefined ? [] : [provider];
    });
  }

  router.get('/ansible/git/file-content', async (request, response) => {
    const credentials = await httpAuth.credentials(request as any);

    const [basicDecisions, [catalogReadDecision]] = await Promise.all([
      permissions.authorize(
        [
          { permission: gitRepositoriesViewPermission },
          { permission: executionEnvironmentsViewPermission },
          { permission: collectionsViewPermission },
        ],
        { credentials },
      ),
      permissions.authorizeConditional(
        [{ permission: catalogEntityReadPermission }],
        { credentials },
      ),
    ]);

    const hasAnyAnsiblePermission = basicDecisions.some(
      d => d.result === AuthorizeResult.ALLOW,
    );
    const hasCatalogRead = catalogReadDecision.result !== AuthorizeResult.DENY;

    if (!hasAnyAnsiblePermission || !hasCatalogRead) {
      response
        .status(403)
        .json({ error: 'Forbidden: insufficient permissions' });
      return;
    }

    const { scmProvider, host, owner, repo, filePath, ref } = request.query;

    const required = [
      'scmProvider',
      'host',
      'owner',
      'repo',
      'filePath',
      'ref',
    ];
    const missing = required.filter(p => !request.query[p]);
    if (missing.length > 0) {
      response.status(400).json({
        error: `Missing required query parameters: ${missing.join(', ')}`,
      });
      return;
    }

    const scm = (scmProvider as string).toLowerCase();
    const hostUrl = host as string;
    const ownerName = owner as string;
    const repoName = repo as string;
    const path = filePath as string;
    const refName = ref as string;

    if (!['github', 'gitlab'].includes(scm)) {
      response.status(400).json({
        error: `Unsupported SCM provider '${scm}'. Supported: github, gitlab`,
      });
      return;
    }

    logger.info(
      `Fetching README from ${scm}://${hostUrl}/${ownerName}/${repoName}/${path}@${refName}`,
    );

    try {
      const scmClient = await scmClientFactory.createClient({
        scmProvider: scm as 'github' | 'gitlab',
        host: hostUrl,
        organization: ownerName,
        ...(scm === 'github' ? { repository: repoName } : {}),
      });

      const content = await scmClient.getFileContent(
        {
          name: repoName,
          fullPath: `${ownerName}/${repoName}`,
          defaultBranch: refName,
          url: `https://${hostUrl}/${ownerName}/${repoName}`,
        },
        refName,
        path,
      );

      const ext = path.split('.').pop()?.toLowerCase();
      const contentTypeMap: Record<string, string> = {
        md: 'text/markdown',
        yaml: 'application/yaml',
        yml: 'application/yaml',
        json: 'application/json',
        txt: 'text/plain',
      };
      response.type(contentTypeMap[ext ?? ''] ?? 'text/plain');
      response.send(content);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to fetch README: ${errorMessage}`);

      if (errorMessage.toLowerCase().includes('not found')) {
        response.status(404).json({
          error: `Failed to fetch README: ${errorMessage}`,
        });
        return;
      }

      if (isScmIntegrationAuthFailure(errorMessage)) {
        response.status(401).json({
          code: SCM_INTEGRATION_AUTH_FAILED_CODE,
          error:
            'Unable to authenticate with the configured GitHub or GitLab integration.',
        });
        return;
      }

      response.status(500).json({
        error: `Failed to fetch README: ${errorMessage}`,
      });
    }
  });

  // Unified CI activity proxy for GitHub and GitLab
  // Query params:
  //   - provider: 'github' | 'gitlab' (required)
  //   - host: hostname (optional, defaults based on provider)
  //   - per_page: number of results (optional)
  //   GitHub-specific: owner, repo
  //   GitLab-specific: projectPath
  router.get('/ansible/git/ci-activity', async (request, response) => {
    const credentials = await httpAuth.credentials(request as any);

    const [[gitRepoDecision], [catalogReadDecision]] = await Promise.all([
      permissions.authorize([{ permission: gitRepositoriesViewPermission }], {
        credentials,
      }),
      permissions.authorizeConditional(
        [{ permission: catalogEntityReadPermission }],
        { credentials },
      ),
    ]);

    const hasGitRepoView = gitRepoDecision.result === AuthorizeResult.ALLOW;
    const hasCatalogRead = catalogReadDecision.result !== AuthorizeResult.DENY;

    if (!hasGitRepoView || !hasCatalogRead) {
      response
        .status(403)
        .json({ error: 'Forbidden: insufficient permissions' });
      return;
    }

    const provider = (request.query.provider as string)?.toLowerCase();
    const perPage = Math.min(Number(request.query.per_page) || 15, 100);
    const ciActivityDeps = {
      config,
      logger,
      scmIntegrations: scmClientFactory.integrations,
      githubCredentialsProvider: scmClientFactory.githubCredentialsProvider,
    };

    if (!provider || !['github', 'gitlab'].includes(provider)) {
      response.status(400).json({
        error:
          "Missing or invalid 'provider' query parameter. Must be 'github' or 'gitlab'.",
      });
      return;
    }

    if (provider === 'github') {
      await handleGitHubCIActivity(ciActivityDeps, request, response, perPage);
    } else {
      await handleGitLabCIActivity(ciActivityDeps, request, response, perPage);
    }
  });

  return router;
}
