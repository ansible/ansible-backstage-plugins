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
  SchedulerService,
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
import { IAAPService } from '@ansible/backstage-rhaap-common';
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
  fetchGitHubCIActivityData,
  fetchGitLabCIActivityData,
  parseEeBuildRequestBody,
  validateGitHubHost,
  isKnownEeBuildError,
  resolveEntityAndRepo,
  dispatchEeBuild,
  isScmIntegrationAuthFailure,
} from './helpers';
import { ConflictError } from '@backstage/errors';
import { SCM_INTEGRATION_AUTH_FAILED_CODE } from '@ansible/backstage-rhaap-common/constants';
import { ScmClientFactory } from '@ansible/backstage-rhaap-common';
import { EEEntityProvider } from './providers/EEEntityProvider';
import type { SyncStatus as ProviderSyncStatus } from './providers/SyncStateTracker';

export async function createRouter(options: {
  logger: LoggerService;
  config: Config;
  scheduler: SchedulerService;
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
  ansibleService: IAAPService;
}): Promise<express.Router> {
  const {
    logger,
    config,
    scheduler,
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
    ansibleService,
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

  /**
   * Helper to get user's AAP OAuth token from request.
   * Token should be passed from frontend in Authorization header or request body.
   * Respects AAP RBAC by using user's token instead of service account.
   */
  async function getUserAAPToken(request: express.Request): Promise<string> {
    // Check custom AAP-Token header
    const aapToken = request.headers['aap-token'] as string;
    if (aapToken) return aapToken;

    // Check request body for token (for POST requests)
    const bodyToken = (request.body as any)?.token;
    if (bodyToken) return bodyToken;

    throw new Error(
      'AAP OAuth token required. Please include AAP-Token header or token in request body.',
    );
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

  const createAsyncSyncHandler = (
    provider: { getTaskId(): string | undefined },
    label: string,
  ) => {
    return async (_: express.Request, response: express.Response) => {
      const taskId = provider.getTaskId();
      if (!taskId) {
        response.status(500).json({
          status: 'failed',
          error: 'Provider not yet initialized. Retry after startup.',
        });
        return;
      }
      try {
        await scheduler.triggerTask(taskId);
        logger.info(`Triggered ${label} sync via scheduler`);
        response.status(202).json({ status: 'sync_started' });
      } catch (err) {
        if (err instanceof ConflictError) {
          logger.info(`Skipping ${label} sync: already in progress`);
          response.status(200).json({ status: 'already_syncing' });
          return;
        }
        throw err;
      }
    };
  };

  router.post(
    '/ansible/sync/from-aap/orgs_users_teams',
    express.json(),
    requireSuperuserMiddleware,
    createAsyncSyncHandler(aapEntityProvider, 'orgs, users and teams'),
  );

  router.post(
    '/ansible/sync/from-aap/job_templates',
    express.json(),
    requireSuperuserMiddleware,
    createAsyncSyncHandler(jobTemplateProvider, 'job templates'),
  );

  router.get(
    '/ansible/sync/status',
    createPermissionCheckMiddleware({ httpAuth, permissions }, [
      catalogEntityReadPermission,
    ]),
    async (request, response) => {
      const perms = response.locals.permissions as Record<string, boolean>;
      if (!perms[catalogEntityReadPermission.name]) {
        response
          .status(403)
          .json({ error: 'Forbidden: insufficient permissions' });
        return;
      }

      logger.info('Getting sync status');
      const aapEntities = request.query.aap_entities === 'true';
      const ansibleContents = request.query.ansible_contents === 'true';
      const noQueryParams =
        request.query.aap_entities === undefined &&
        request.query.ansible_contents === undefined;

      try {
        const result: {
          aap?: {
            orgsUsersTeams: {
              lastSync: string | null;
              syncInProgress: boolean;
              lastFailedSyncTime: string | null;
              lastSyncStatus: ProviderSyncStatus;
            };
            jobTemplates: {
              lastSync: string | null;
              syncInProgress: boolean;
              lastFailedSyncTime: string | null;
              lastSyncStatus: ProviderSyncStatus;
            };
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
              lastSyncStatus: ProviderSyncStatus;
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
              syncInProgress: aapEntityProvider.getIsSyncing(),
              lastFailedSyncTime: aapEntityProvider.getLastFailedSyncTime(),
              lastSyncStatus: aapEntityProvider.getLastSyncStatus(),
            },
            jobTemplates: {
              lastSync: jobTemplateProvider.getLastSyncTime(),
              syncInProgress: jobTemplateProvider.getIsSyncing(),
              lastFailedSyncTime: jobTemplateProvider.getLastFailedSyncTime(),
              lastSyncStatus: jobTemplateProvider.getLastSyncStatus(),
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

      const results: PAHSyncResult[] = await Promise.all(
        providersToRun.map(async provider => {
          const repositoryName = provider.getPahRepositoryName();
          const providerName = provider.getProviderName();
          const taskId = provider.getTaskId();

          if (!taskId) {
            logger.error(
              `Cannot trigger sync for ${repositoryName}: provider not yet initialized`,
            );
            return {
              repositoryName,
              providerName,
              status: 'failed' as SyncResultStatus,
              error: {
                code: 'SYNC_START_FAILED',
                message: 'Provider not yet initialized. Retry after startup.',
              },
            };
          }

          try {
            await scheduler.triggerTask(taskId);
          } catch (err) {
            if (err instanceof ConflictError) {
              logger.info(
                `Skipping sync for ${repositoryName}: sync already in progress`,
              );
              return {
                repositoryName,
                providerName,
                status: 'already_syncing' as SyncResultStatus,
              };
            }
            throw err;
          }
          logger.info(`Triggered sync for ${repositoryName} via scheduler`);
          return {
            repositoryName,
            providerName,
            status: 'sync_started' as SyncResultStatus,
          };
        }),
      );

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

      const results: SCMSyncResult[] = await Promise.all(
        providersToSync.map(async provider => {
          const sourceId = provider.getSourceId();
          const providerName = provider.getProviderName();
          const { scmProvider, hostName, organization } =
            parseSourceId(sourceId);
          const taskId = provider.getTaskId();

          if (!taskId) {
            logger.error(
              `Cannot trigger sync for ${sourceId}: provider not yet initialized`,
            );
            return {
              scmProvider,
              hostName,
              organization,
              providerName,
              status: 'failed' as SyncResultStatus,
              error: {
                code: 'SYNC_START_FAILED',
                message: 'Provider not yet initialized. Retry after startup.',
              },
            };
          }

          try {
            await scheduler.triggerTask(taskId);
          } catch (err) {
            if (err instanceof ConflictError) {
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
            throw err;
          }
          logger.info(`Triggered sync for ${sourceId} via scheduler`);
          return {
            scmProvider,
            hostName,
            organization,
            providerName,
            status: 'sync_started' as SyncResultStatus,
          };
        }),
      );

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

  // Batch CI activity proxy for GitHub Actions and GitLab Pipelines.
  // POST body: { items: [{ key, provider, owner?, repo?, host?, projectPath?, per_page? }] }
  //   - provider: 'github' | 'gitlab' (required)
  //   - host: SCM hostname (optional, defaults to github.com / gitlab.com)
  //   - per_page: max results per repo (optional, default 15, max 100)
  //   GitHub-specific: owner, repo
  //   GitLab-specific: projectPath
  // Response: { results: { [key]: { status, data } | { error } } }
  router.post(
    '/ansible/git/ci-activity',
    express.json(),
    async (request, response) => {
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
      const hasCatalogRead =
        catalogReadDecision.result !== AuthorizeResult.DENY;

      if (!hasGitRepoView || !hasCatalogRead) {
        response
          .status(403)
          .json({ error: 'Forbidden: insufficient permissions' });
        return;
      }

      const { items } = request.body as {
        items?: Array<{
          key: string;
          provider: string;
          owner?: string;
          repo?: string;
          host?: string;
          projectPath?: string;
          per_page?: number;
        }>;
      };

      if (!Array.isArray(items) || items.length === 0) {
        response
          .status(400)
          .json({ error: "'items' must be a non-empty array" });
        return;
      }

      if (items.length > 100) {
        response
          .status(400)
          .json({ error: 'Maximum 100 items per batch request' });
        return;
      }

      const seenKeys = new Set<string>();
      for (const item of items) {
        if (!item.key || typeof item.key !== 'string') {
          response
            .status(400)
            .json({ error: "Each item must have a non-empty 'key'" });
          return;
        }
        if (seenKeys.has(item.key)) {
          response.status(400).json({ error: `Duplicate key: '${item.key}'` });
          return;
        }
        seenKeys.add(item.key);
      }

      logger.info(`[ci-activity] Batch request: ${items.length} items`);

      const ciActivityDeps = {
        config,
        logger,
        scmIntegrations: scmClientFactory.integrations,
        githubCredentialsProvider: scmClientFactory.githubCredentialsProvider,
      };

      const CONCURRENCY_LIMIT = 5;
      const results: Record<
        string,
        { status: number; data: unknown } | { error: string }
      > = {};

      const processItem = async (
        item: (typeof items)[number],
      ): Promise<{ status: number; data: unknown } | { error: string }> => {
        const prov = item.provider?.toLowerCase();
        const perPage = Math.min(Number(item.per_page) || 15, 100);

        if (prov === 'github') {
          const result = await fetchGitHubCIActivityData(ciActivityDeps, {
            owner: item.owner ?? '',
            repo: item.repo ?? '',
            host: item.host ?? 'github.com',
            perPage,
          });
          return 'error' in result
            ? { error: result.error }
            : { status: result.status, data: result.data };
        }
        if (prov === 'gitlab') {
          const result = await fetchGitLabCIActivityData(ciActivityDeps, {
            projectPath: item.projectPath ?? '',
            host: item.host ?? 'gitlab.com',
            perPage,
          });
          return 'error' in result
            ? { error: result.error }
            : { status: result.status, data: result.data };
        }
        return { error: `Unknown provider: ${prov}` };
      };

      let index = 0;
      const processNext = async (): Promise<void> => {
        while (index < items.length) {
          // safe: single-threaded JS, ++ completes before await
          const currentIndex = index++;
          const item = items[currentIndex];
          try {
            results[item.key] = await processItem(item);
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : 'Unknown error occurred';
            logger.warn(`[ci-activity] Item '${item.key}' failed: ${msg}`);
            results[item.key] = { error: msg };
          }
        }
      };

      const workers = Array.from(
        { length: Math.min(CONCURRENCY_LIMIT, items.length) },
        () => processNext(),
      );
      await Promise.all(workers);

      const errorCount = Object.values(results).filter(
        r => 'error' in r,
      ).length;
      if (errorCount > 0) {
        logger.warn(`[ci-activity] ${errorCount}/${items.length} items failed`);
      }

      response.status(200).json({ results });
    },
  );

  /**
   * GET /ansible/jobs/:jobId
   * Fetch AAP job status by job ID
   * Uses service account token from config
   */
  router.get(
    '/ansible/jobs/:jobId',
    createPermissionCheckMiddleware({ httpAuth, permissions }, [
      catalogEntityReadPermission,
    ]),
    async (request, response) => {
      const perms = response.locals.permissions as Record<string, boolean>;
      if (!perms[catalogEntityReadPermission.name]) {
        response
          .status(403)
          .json({ error: 'Forbidden: insufficient permissions' });
        return;
      }

      // Validate jobId is a positive integer (reject "123abc", "1.5", etc.)
      const jobIdParam = request.params.jobId;
      if (!/^\d+$/.test(jobIdParam)) {
        response.status(400).json({ error: 'Invalid job ID' });
        return;
      }
      const jobId = parseInt(jobIdParam, 10);

      // Require taskId query parameter for ownership validation
      const taskId = request.query.taskId as string | undefined;
      if (!taskId) {
        response.status(400).json({
          error: 'taskId query parameter is required for job status requests',
        });
        return;
      }

      // Get user identity to log access
      try {
        const credentials = await httpAuth.credentials(request as any);
        const { ownershipEntityRefs } = await userInfo.getUserInfo(credentials);
        logger.info(
          `User ${ownershipEntityRefs?.[0] || 'unknown'} fetching AAP job status for job ${jobId} (task ${taskId})`,
        );
      } catch (err) {
        // Service-to-service calls not allowed for job status
        logger.warn(
          `Rejecting service-to-service job status request for job ${jobId}`,
        );
        response.status(403).json({
          error: 'Job status requests require user authentication',
        });
        return;
      }

      try {
        // Get user's AAP OAuth token from Authorization header
        const aapToken = await getUserAAPToken(request);
        const jobStatus = await ansibleService.getJobStatus(jobId, aapToken);
        response.status(200).json(jobStatus);
      } catch (error: any) {
        logger.error(
          `Failed to fetch job status for ${jobId}: ${error.message}`,
        );
        // Check for 404 or 403 (not found / no access)
        if (
          error.message?.includes('404') ||
          error.message?.includes('403') ||
          error.message?.toLowerCase().includes('not found')
        ) {
          response.status(404).json({
            error: 'Job not found or insufficient permissions',
            id: jobId,
            status: 'unknown',
          });
        } else if (error.message?.includes('not configured')) {
          response.status(503).json({
            error: 'AAP service account not configured',
          });
        } else {
          response.status(500).json({
            error: 'Failed to fetch job status',
            details: error.message,
          });
        }
      }
    },
  );

  /**
   * POST /ansible/jobs/batch
   * Fetch multiple job statuses (for task list)
   * Body: { jobIds: number[] }
   */
  router.post(
    '/ansible/jobs/batch',
    express.json(),
    createPermissionCheckMiddleware({ httpAuth, permissions }, [
      catalogEntityReadPermission,
    ]),
    async (request, response) => {
      const perms = response.locals.permissions as Record<string, boolean>;
      if (!perms[catalogEntityReadPermission.name]) {
        response
          .status(403)
          .json({ error: 'Forbidden: insufficient permissions' });
        return;
      }

      const { jobs: jobRequests } = request.body as {
        jobs?: Array<{ taskId: string; jobId: number }>;
      };

      if (!Array.isArray(jobRequests)) {
        response.status(400).json({ error: 'jobs must be an array' });
        return;
      }

      // Validate all entries have taskId and jobId
      const invalidEntries = jobRequests.filter(
        req =>
          !req.taskId ||
          typeof req.taskId !== 'string' ||
          typeof req.jobId !== 'number' ||
          !Number.isInteger(req.jobId) ||
          req.jobId <= 0,
      );

      if (invalidEntries.length > 0) {
        response.status(400).json({
          error:
            'All entries must have taskId (string) and jobId (positive integer)',
          invalidEntries: invalidEntries,
        });
        return;
      }

      if (jobRequests.length === 0) {
        response.status(200).json({ jobs: {} });
        return;
      }

      // Get user identity to log access
      try {
        const credentials = await httpAuth.credentials(request as any);
        const { ownershipEntityRefs } = await userInfo.getUserInfo(credentials);
        logger.info(
          `User ${ownershipEntityRefs?.[0] || 'unknown'} fetching batch AAP job status for ${jobRequests.length} jobs`,
        );
      } catch (err) {
        // Service-to-service calls not allowed
        logger.warn(`Rejecting service-to-service batch job status request`);
        response.status(403).json({
          error: 'Job status requests require user authentication',
        });
        return;
      }

      const jobIds = jobRequests.map(req => req.jobId);

      try {
        // Get user's AAP OAuth token from Authorization header
        const aapToken = await getUserAAPToken(request);
        logger.info(`Fetching batch job status for ${jobIds.length} jobs`);
        const jobStatuses = await ansibleService.getJobStatusBatch(
          jobIds,
          aapToken,
        );

        const result = Object.fromEntries(jobStatuses);
        response.status(200).json({ jobs: result });
      } catch (error: any) {
        logger.error(`Failed to fetch batch job statuses: ${error.message}`);
        response.status(500).json({
          error: 'Failed to fetch job statuses',
          details: error.message,
        });
      }
    },
  );

  return router;
}
