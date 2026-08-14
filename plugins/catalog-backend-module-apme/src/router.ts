/*
 * Copyright Red Hat
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

import { assertSafeAbbenayProviderId, assertSafeHttpUrl } from './urlSafety';
import { listApmeInferenceModels, resolveApmeAiStatus } from './aiResolution';
import PromiseRouter from 'express-promise-router';
import type { Router } from 'express';
import type { IncomingHttpHeaders } from 'http';
import {
  HttpAuthService,
  LoggerService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import {
  IApmeService,
  getApmeConfig,
  isAllowedAnsibleCoreVersion,
  mergeActivityPortalOutcomes,
  normalizeApmeAiProviders,
  resolveScanTarget,
} from '@ansible/backstage-apme-common';
import { ApmePortalSettingsStore } from './apmePortalSettingsStore';
import { validateRepoBranch } from './branchLookup';
import { jsonBody } from './jsonBody';
import { resolveIntegrationScmToken } from './resolveIntegrationScmToken';
import { proxyProjectOperation } from './gatewayOperationProxy';
import { createRequireSettingsManageMiddleware } from './requireSettingsManage';
import { createRequireSettingsViewMiddleware } from './requireSettingsView';

const GALAXY_SERVER_NAME_RE = /^[A-Za-z0-9_-]+$/;

/** Headers + optional body — avoids dual `@types/express` Request mismatches. */
type ApmeHttpRequest = {
  headers: IncomingHttpHeaders;
  body?: unknown;
};

export interface RouterOptions {
  apmeService: IApmeService;
  logger: LoggerService;
  httpAuth: HttpAuthService;
  rootConfig: Config;
  portalSettingsStore?: ApmePortalSettingsStore;
  permissions: PermissionsService;
}

function scmTokenFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const raw = (body as { scm_token?: unknown }).scm_token;
  if (typeof raw !== 'string') {
    return undefined;
  }
  const token = raw.trim();
  return token || undefined;
}

function scmTokenFromRequest(req: ApmeHttpRequest): string | undefined {
  const raw =
    (req.headers['x-scm-token'] as string | undefined) ??
    (req.headers['x-github-token'] as string | undefined) ??
    (req.headers['x-gitlab-token'] as string | undefined);
  const token = raw?.trim();
  return token || undefined;
}

async function ensureRepoBranchValid(
  rootConfig: Config,
  logger: LoggerService,
  repoUrl: string,
  branch: string | undefined,
  scmToken?: string,
): Promise<void> {
  const resolvedBranch = branch?.trim();
  if (!resolvedBranch) {
    throw new InputError('branch is required');
  }
  await validateRepoBranch({
    rootConfig,
    repoUrl,
    branch: resolvedBranch,
    scmToken,
    logger,
  });
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const {
    apmeService,
    logger,
    httpAuth,
    rootConfig,
    portalSettingsStore = new ApmePortalSettingsStore(),
    permissions,
  } = options;
  const router = PromiseRouter();

  const configSnapshot = getApmeConfig(rootConfig);

  const requireApmeSettingsManage = createRequireSettingsManageMiddleware({
    httpAuth,
    permissions,
  });

  const requireApmeSettingsView = createRequireSettingsViewMiddleware({
    httpAuth,
    permissions,
  });

  const resolveScmTokenForProject = async (
    req: ApmeHttpRequest,
    projectId: string,
  ): Promise<string | undefined> => {
    let scmToken = scmTokenFromRequest(req) ?? scmTokenFromBody(req.body);
    if (scmToken) {
      return scmToken;
    }
    const project = await apmeService.getProject(projectId);
    scmToken = await resolveIntegrationScmToken({
      rootConfig,
      logger,
      repoUrl: project.repo_url,
    });
    if (scmToken) {
      logger.info(
        `APME using integration/GitHub App token for project ${projectId}`,
      );
    }
    return scmToken;
  };

  const mergedPortalSettings = async () => {
    const store = await portalSettingsStore.read();
    const resolved = resolveScanTarget({
      store,
      configTargetAnsibleCoreVersion: configSnapshot.targetAnsibleCoreVersion,
    });
    return {
      enableAi: configSnapshot.enableAi,
      publishViaGateway: configSnapshot.publishViaGateway,
      targetAnsibleCoreVersion: resolved.effective,
      defaultAiModelId: store.global?.defaultAiModelId,
    };
  };

  // Body parsing: use route-level `jsonBody` only (see ./jsonBody.ts). Never
  // `router.use(jsonBody)` — this router shares the catalog HTTP stack.

  const ensureUser = async (req: unknown) => {
    return httpAuth.credentials(
      req as Parameters<HttpAuthService['credentials']>[0],
      {
        allow: ['user'],
      },
    );
  };

  const outboundUrlOptions = () => ({
    allowHttp:
      rootConfig.getOptionalBoolean('ansible.apme.allowHttpOutboundUrls') ??
      false,
    allowPrivateHosts:
      rootConfig.getOptionalBoolean('ansible.apme.allowPrivateOutboundUrls') ??
      false,
  });

  router.get('/apme/health', async (req, res) => {
    await ensureUser(req);
    logger.debug('APME health check requested');
    const health = await apmeService.getHealth();
    res.json(health);
  });

  router.get('/apme/settings', async (req, res) => {
    await ensureUser(req);
    res.json(await mergedPortalSettings());
  });

  router.put(
    '/apme/settings',
    jsonBody,
    requireApmeSettingsManage,
    async (req, res) => {
      const { targetAnsibleCoreVersion, defaultAiModelId } = req.body ?? {};
      const updates: {
        targetAnsibleCoreVersion?: string;
        defaultAiModelId?: string | null;
      } = {};

      if (targetAnsibleCoreVersion !== undefined) {
        if (
          typeof targetAnsibleCoreVersion !== 'string' ||
          !targetAnsibleCoreVersion.trim()
        ) {
          throw new InputError(
            'targetAnsibleCoreVersion must be a non-empty string',
          );
        }
        if (!isAllowedAnsibleCoreVersion(targetAnsibleCoreVersion)) {
          throw new InputError(
            `Unsupported ansible-core version: ${targetAnsibleCoreVersion}`,
          );
        }
        updates.targetAnsibleCoreVersion = targetAnsibleCoreVersion.trim();
      }

      if (defaultAiModelId !== undefined) {
        if (defaultAiModelId !== null && typeof defaultAiModelId !== 'string') {
          throw new InputError('defaultAiModelId must be a string or null');
        }
        updates.defaultAiModelId =
          typeof defaultAiModelId === 'string' ? defaultAiModelId : null;
      }

      if (
        updates.targetAnsibleCoreVersion === undefined &&
        updates.defaultAiModelId === undefined
      ) {
        throw new InputError(
          'At least one of targetAnsibleCoreVersion or defaultAiModelId is required',
        );
      }

      await portalSettingsStore.updateGlobalSettings(updates);
      res.json(await mergedPortalSettings());
    },
  );

  router.get(
    '/apme/settings/galaxy-servers',
    requireApmeSettingsView,
    async (_req, res) => {
      const servers = await apmeService.listGalaxyServers();
      res.json(servers);
    },
  );

  router.post(
    '/apme/settings/galaxy-servers',
    jsonBody,
    requireApmeSettingsManage,
    async (req, res) => {
      const { name, url, token, auth_url } = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        throw new InputError('name is required');
      }
      if (!GALAXY_SERVER_NAME_RE.test(name.trim())) {
        throw new InputError('name must match [A-Za-z0-9_-]+');
      }
      if (typeof url !== 'string' || !url.trim()) {
        throw new InputError('url is required');
      }
      assertSafeHttpUrl(url, 'url', outboundUrlOptions());
      if (typeof auth_url === 'string' && auth_url.trim()) {
        assertSafeHttpUrl(auth_url, 'auth_url', outboundUrlOptions());
      }
      const server = await apmeService.createGalaxyServer({
        name: name.trim(),
        url: url.trim(),
        token: typeof token === 'string' ? token : undefined,
        auth_url: typeof auth_url === 'string' ? auth_url : undefined,
      });
      res.status(201).json(server);
    },
  );

  router.patch(
    '/apme/settings/galaxy-servers/:serverId',
    jsonBody,
    requireApmeSettingsManage,
    async (req, res) => {
      const serverId = Number.parseInt(req.params.serverId, 10);
      if (!Number.isFinite(serverId)) {
        throw new InputError('serverId must be a number');
      }
      const { name, url, token, auth_url } = req.body ?? {};
      const body: Record<string, string> = {};
      if (typeof name === 'string') {
        if (!GALAXY_SERVER_NAME_RE.test(name.trim())) {
          throw new InputError('name must match [A-Za-z0-9_-]+');
        }
        body.name = name.trim();
      }
      if (typeof url === 'string') {
        assertSafeHttpUrl(url, 'url', outboundUrlOptions());
        body.url = url.trim();
      }
      if (typeof token === 'string') body.token = token;
      if (typeof auth_url === 'string') {
        if (auth_url.trim()) {
          assertSafeHttpUrl(auth_url, 'auth_url', outboundUrlOptions());
        }
        body.auth_url = auth_url;
      }
      if (Object.keys(body).length === 0) {
        throw new InputError('At least one field is required');
      }
      const server = await apmeService.updateGalaxyServer(serverId, body);
      res.json(server);
    },
  );

  router.delete(
    '/apme/settings/galaxy-servers/:serverId',
    requireApmeSettingsManage,
    async (req, res) => {
      const serverId = Number.parseInt(req.params.serverId, 10);
      if (!Number.isFinite(serverId)) {
        throw new InputError('serverId must be a number');
      }
      await apmeService.deleteGalaxyServer(serverId);
      res.status(204).send();
    },
  );

  router.get('/apme/projects/:projectId/scan-target', async (req, res) => {
    await ensureUser(req);
    const { projectId } = req.params;
    const store = await portalSettingsStore.read();
    res.json(
      resolveScanTarget({
        projectId,
        store,
        configTargetAnsibleCoreVersion: configSnapshot.targetAnsibleCoreVersion,
      }),
    );
  });

  router.put(
    '/apme/projects/:projectId/scan-target',
    jsonBody,
    async (req, res) => {
      await ensureUser(req);
      const { projectId } = req.params;
      const { targetAnsibleCoreVersion } = req.body ?? {};
      if (
        targetAnsibleCoreVersion !== null &&
        (typeof targetAnsibleCoreVersion !== 'string' ||
          !targetAnsibleCoreVersion.trim())
      ) {
        throw new InputError(
          'targetAnsibleCoreVersion must be a version string or null',
        );
      }
      if (
        typeof targetAnsibleCoreVersion === 'string' &&
        !isAllowedAnsibleCoreVersion(targetAnsibleCoreVersion)
      ) {
        throw new InputError(
          `Unsupported ansible-core version: ${targetAnsibleCoreVersion}`,
        );
      }
      await portalSettingsStore.updateProjectTarget(
        projectId,
        targetAnsibleCoreVersion === null
          ? null
          : targetAnsibleCoreVersion.trim(),
      );
      const store = await portalSettingsStore.read();
      res.json(
        resolveScanTarget({
          projectId,
          store,
          configTargetAnsibleCoreVersion:
            configSnapshot.targetAnsibleCoreVersion,
        }),
      );
    },
  );

  router.get('/apme/ai/status', async (req, res) => {
    await ensureUser(req);
    const { enableAi } = getApmeConfig(rootConfig);
    const status = await resolveApmeAiStatus(apmeService, logger);
    res.json({
      enableAi,
      connected: status.connected,
      modelCount: status.modelCount,
      configuredModelCount: status.configuredModelCount,
    });
  });

  // @apme/ui-workflow CheckOptionsForm → GET /ai/models (via catalog proxy apiBase).
  // Inference list only — do not synthesize from admin config (avoids "Connected" lies).
  router.get('/apme/ai/models', async (req, res) => {
    await ensureUser(req);
    const models = await listApmeInferenceModels(apmeService);
    res.json(models);
  });

  // US-016: Abbenay AI provider CRUD (portal → Gateway ADR-070 → Abbenay).
  router.get('/apme/ai/config', requireApmeSettingsView, async (_req, res) => {
    const config = await apmeService.getAiConfig();
    res.json(config);
  });

  router.post(
    '/apme/ai/config',
    jsonBody,
    requireApmeSettingsManage,
    async (req, res) => {
      const result = await apmeService.updateAiConfig(req.body);
      res.json(result);
    },
  );

  router.get('/apme/ai/providers', async (req, res) => {
    await ensureUser(req);
    const raw = await apmeService.getAiProviders();
    res.json(normalizeApmeAiProviders(raw));
  });

  router.get('/apme/ai/engines', requireApmeSettingsView, async (_req, res) => {
    const result = await apmeService.getAiEngines();
    res.json(result);
  });

  router.post(
    '/apme/ai/providers',
    jsonBody,
    requireApmeSettingsManage,
    async (req, res) => {
      const body = req.body ?? {};
      const name = typeof body.name === 'string' ? body.name : '';
      if (!name) {
        throw new InputError('Provider name is required');
      }
      assertSafeAbbenayProviderId(name);
      const result = await apmeService.createAiProvider({
        name,
        engine: body.engine,
        apiKey: body.apiKey ?? body.api_key,
        baseUrl: body.baseUrl ?? body.base_url,
        models: body.models,
      });
      res.status(201).json(result);
    },
  );

  router.patch(
    '/apme/ai/providers/:id',
    jsonBody,
    requireApmeSettingsManage,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        throw new InputError('Provider id must be a positive number');
      }
      const body = req.body ?? {};
      if (typeof body.name === 'string' && body.name) {
        assertSafeAbbenayProviderId(body.name);
      }
      const result = await apmeService.updateAiProvider(id, {
        name: body.name,
        engine: body.engine,
        apiKey: body.apiKey ?? body.api_key,
        baseUrl: body.baseUrl ?? body.base_url,
        models: body.models,
      });
      res.json(result);
    },
  );

  router.delete(
    '/apme/ai/providers/:id',
    requireApmeSettingsManage,
    async (req, res) => {
      const id = req.params.id;
      if (!id) {
        throw new InputError('Provider id is required');
      }
      await apmeService.deleteAiProvider(id);
      res.status(204).send();
    },
  );

  // Legacy configure/delete-by-name paths (Abbenay HTTP proxy era).
  router.post(
    '/apme/ai/provider/:id/configure',
    jsonBody,
    requireApmeSettingsManage,
    async (req, res) => {
      const { id } = req.params;
      if (!id) {
        throw new InputError('Provider id is required');
      }
      assertSafeAbbenayProviderId(id);
      const body = req.body ?? {};
      const result = await apmeService.createAiProvider({
        name: id,
        engine: body.engine,
        apiKey: body.apiKey ?? body.api_key,
        baseUrl: body.baseUrl ?? body.base_url,
        models: body.models,
      });
      res.json(result);
    },
  );

  router.delete(
    '/apme/ai/provider/:id',
    requireApmeSettingsManage,
    async (req, res) => {
      const { id } = req.params;
      if (id) {
        assertSafeAbbenayProviderId(id);
      }
      // Resolve name → numeric id when legacy clients pass provider name.
      const raw = await apmeService.getAiProviders();
      const providers = normalizeApmeAiProviders(raw);
      const match = providers.find(p => p.name === id || String(p.id) === id);
      if (!match) {
        res.status(404).json({ error: 'AI provider not found' });
        return;
      }
      await apmeService.deleteAiProvider(match.id);
      res.status(204).send();
    },
  );

  router.get('/apme/projects', async (req, res) => {
    await ensureUser(req);
    logger.debug('APME projects list requested');
    const projects = await apmeService.getProjects();
    res.json({ items: projects });
  });

  router.get('/apme/projects/:projectId', async (req, res) => {
    await ensureUser(req);
    const { projectId } = req.params;
    logger.debug(`APME project ${projectId} requested`);
    const project = await apmeService.getProject(projectId);
    res.json(project);
  });

  router.get('/apme/projects/:projectId/violations', async (req, res) => {
    await ensureUser(req);
    const { projectId } = req.params;
    logger.debug(`APME violations for project ${projectId} requested`);
    const limitRaw = req.query.limit;
    const offsetRaw = req.query.offset;
    const limit =
      typeof limitRaw === 'string' ? parseInt(limitRaw, 10) : undefined;
    const offset =
      typeof offsetRaw === 'string' ? parseInt(offsetRaw, 10) : undefined;
    const violationOptions =
      (limit !== undefined && !Number.isNaN(limit)) ||
      (offset !== undefined && !Number.isNaN(offset))
        ? {
            ...(limit !== undefined && !Number.isNaN(limit) ? { limit } : {}),
            ...(offset !== undefined && !Number.isNaN(offset)
              ? { offset }
              : {}),
          }
        : undefined;
    const violations = await apmeService.getViolations(
      projectId,
      violationOptions,
    );
    res.json(violations);
  });

  router.get('/apme/projects/:projectId/dependencies', async (req, res) => {
    await ensureUser(req);
    const { projectId } = req.params;
    logger.debug(`APME dependencies for project ${projectId} requested`);
    const dependencies = await apmeService.getProjectDependencies(projectId);
    res.json(dependencies);
  });

  // Transparent Gateway proxy for @apme/ui-workflow operation surface
  // (GET/POST/PATCH/SSE under /operation*). ADR-056: no file_overrides.
  // Skip jsonBody on GET/HEAD — SSE /operation/events must not hit the
  // body parser (keeps the streaming path lean).
  const jsonBodyUnlessGet: typeof jsonBody = (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      next();
      return;
    }
    jsonBody(req, res, next);
  };

  router.all(
    '/apme/projects/:projectId/operation',
    jsonBodyUnlessGet,
    async (req, res) => {
      await ensureUser(req);
      const { projectId } = req.params;
      const scmToken = await resolveScmTokenForProject(req, projectId);
      await proxyProjectOperation({
        req,
        res,
        rootConfig,
        logger,
        projectId,
        operationSuffix: '',
        scmToken,
      });
    },
  );

  router.all(
    '/apme/projects/:projectId/operation/*',
    jsonBodyUnlessGet,
    async (req, res) => {
      await ensureUser(req);
      const { projectId } = req.params;
      const scmToken = await resolveScmTokenForProject(req, projectId);
      // Express splat (`*`) is exposed as params[0] at runtime.
      const splat = (req.params as { projectId: string; 0?: string })[0];
      const rest = splat ? `/${splat}` : '';
      await proxyProjectOperation({
        req,
        res,
        rootConfig,
        logger,
        projectId,
        operationSuffix: rest,
        scmToken,
      });
    },
  );

  router.get('/apme/rules', async (req, res) => {
    await ensureUser(req);
    logger.debug('APME rules list requested');
    const rules = await apmeService.getRules();
    res.json({ items: rules });
  });

  router.put(
    '/apme/rules/:ruleId/config',
    jsonBody,
    requireApmeSettingsManage,
    async (req, res) => {
      const { ruleId } = req.params;
      const body = req.body;
      if (!body || typeof body !== 'object') {
        throw new InputError('Request body must be an object');
      }
      const hasValidField =
        'severity_override' in body ||
        'enabled_override' in body ||
        'enforced' in body;
      if (!hasValidField) {
        throw new InputError(
          'At least one of severity_override, enabled_override, or enforced is required',
        );
      }
      logger.info(`APME rule config update for ${ruleId}`);
      const rule = await apmeService.updateRuleConfig(ruleId, body);
      res.json(rule);
    },
  );

  router.delete(
    '/apme/rules/:ruleId/config',
    requireApmeSettingsManage,
    async (req, res) => {
      const { ruleId } = req.params;
      logger.info(`APME rule config reset for ${ruleId}`);
      await apmeService.deleteRuleConfig(ruleId);
      res.status(204).send();
    },
  );

  router.post('/apme/suppressions', jsonBody, async (req, res) => {
    await ensureUser(req);
    const { rule_id, scope } = req.body ?? {};
    if (!rule_id || typeof rule_id !== 'string') {
      throw new InputError('rule_id is required in request body');
    }
    if (!scope || typeof scope !== 'string') {
      throw new InputError('scope is required in request body');
    }
    logger.info('APME suppression create requested');
    const suppression = await apmeService.createSuppression(req.body);
    res.status(201).json(suppression);
  });

  router.get('/apme/suppressions', async (req, res) => {
    await ensureUser(req);
    const scope = req.query.scope as string | undefined;
    logger.debug(`APME suppressions list requested scope=${scope ?? 'all'}`);
    const suppressions = await apmeService.getSuppressions(scope);
    res.json(suppressions);
  });

  router.delete('/apme/suppressions/:suppressionId', async (req, res) => {
    await ensureUser(req);
    const suppressionId = parseInt(req.params.suppressionId, 10);
    if (Number.isNaN(suppressionId)) {
      res.status(400).json({ error: 'Invalid suppression id' });
      return;
    }
    logger.info(`APME suppression delete ${suppressionId}`);
    await apmeService.deleteSuppression(suppressionId);
    res.status(204).send();
  });

  router.get('/apme/lookup', async (req, res) => {
    await ensureUser(req);
    const repoUrl = req.query.repo_url as string;
    const branch = req.query.branch as string | undefined;
    if (!repoUrl) {
      res.status(400).json({ error: 'repo_url query parameter is required' });
      return;
    }
    logger.debug(
      `APME project lookup by repo URL: ${repoUrl}${branch ? ` branch=${branch}` : ''}`,
    );
    const project = await apmeService.getProjectByRepoUrl(repoUrl, branch);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  });

  router.get('/apme/repos/branch-check', async (req, res) => {
    await ensureUser(req);
    const repoUrl = req.query.repo_url;
    const branch = req.query.branch;
    if (typeof repoUrl !== 'string' || !repoUrl.trim()) {
      throw new InputError('repo_url query parameter is required');
    }
    if (typeof branch !== 'string' || !branch.trim()) {
      throw new InputError('branch query parameter is required');
    }
    const scmToken = scmTokenFromRequest(req);
    await ensureRepoBranchValid(rootConfig, logger, repoUrl, branch, scmToken);
    res.json({ valid: true });
  });

  router.post('/apme/projects', jsonBody, async (req, res) => {
    await ensureUser(req);
    const { name, repo_url, branch } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      throw new InputError('name is required in request body');
    }
    if (!repo_url || typeof repo_url !== 'string') {
      throw new InputError('repo_url is required in request body');
    }
    const scmToken = scmTokenFromRequest(req) ?? scmTokenFromBody(req.body);
    await ensureRepoBranchValid(rootConfig, logger, repo_url, branch, scmToken);
    logger.info('APME create project requested');
    const project = await apmeService.createProject(req.body);
    res.status(201).json(project);
  });

  router.delete('/apme/projects/:projectId', async (req, res) => {
    await ensureUser(req);
    const { projectId } = req.params;
    logger.info(`APME delete project ${projectId} requested`);
    await apmeService.deleteProject(projectId);
    res.status(204).send();
  });

  router.get('/apme/projects/:projectId/activity', async (req, res) => {
    await ensureUser(req);
    const { projectId } = req.params;
    logger.debug(`APME activity for project ${projectId} requested`);
    const activity = await apmeService.getActivity(projectId);
    const store = await portalSettingsStore.read();
    res.json(mergeActivityPortalOutcomes(activity, store.activities));
  });

  router.get('/apme/activity/:activityId', async (req, res) => {
    await ensureUser(req);
    const { activityId } = req.params;
    logger.debug(`APME activity detail ${activityId} requested`);
    const detail = await apmeService.getActivityDetail(activityId);
    res.json(detail);
  });

  // Legacy portal path — Gateway-only submit (ADR-056). Prefer
  // POST …/operation/submit via the transparent proxy above.
  router.post(
    '/apme/projects/:projectId/submit',
    jsonBody,
    async (req, res) => {
      await ensureUser(req);
      const { projectId } = req.params;
      const {
        activity_id: activityId,
        branch_name: branchName,
        create_pr: createPr,
        title,
        body: prBody,
        file_overrides: fileOverrides,
      } = req.body as {
        activity_id?: string;
        branch_name?: string;
        create_pr?: boolean;
        title?: string;
        body?: string;
        file_overrides?: unknown;
      };

      if (fileOverrides !== undefined) {
        throw new InputError(
          'file_overrides are not supported; APME Gateway owns SCM commit/push (ADR-056)',
        );
      }

      if (!activityId || typeof activityId !== 'string') {
        throw new InputError('activity_id is required in request body');
      }

      logger.info(
        `APME SCM submit for project ${projectId} activity ${activityId}`,
      );

      const token = await resolveScmTokenForProject(req, projectId);
      const result = await apmeService.submitRemediation(projectId, {
        activity_id: activityId,
        branch_name: branchName,
        create_pr: createPr,
        title,
        body: prBody,
        scm_token: token,
      });

      await portalSettingsStore.updateActivityOutcome(activityId, {
        branch_name: result.branch_name,
        pr_url: result.pr_url ?? null,
      });

      res.status(200).json(result);
    },
  );

  return router as unknown as Router;
}
