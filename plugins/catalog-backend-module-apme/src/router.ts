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

import { Router, json, Request } from 'express';
import PromiseRouter from 'express-promise-router';
import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import { IApmeService, getApmeConfig } from '@ansible/backstage-apme-common';

export interface RouterOptions {
  apmeService: IApmeService;
  logger: LoggerService;
  httpAuth: HttpAuthService;
  rootConfig: Config;
}

function scmTokenFromRequest(
  req: Pick<Request, 'headers'>,
): string | undefined {
  const raw =
    (req.headers['x-scm-token'] as string | undefined) ??
    (req.headers['x-github-token'] as string | undefined) ??
    (req.headers['x-gitlab-token'] as string | undefined);
  const token = raw?.trim();
  return token || undefined;
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { apmeService, logger, httpAuth, rootConfig } = options;
  const router = PromiseRouter();

  router.use(json());

  const ensureUser = async (req: unknown) => {
    await httpAuth.credentials(
      req as Parameters<HttpAuthService['credentials']>[0],
      {
        allow: ['user'],
      },
    );
  };

  router.get('/apme/health', async (req, res) => {
    await ensureUser(req);
    logger.debug('APME health check requested');
    const health = await apmeService.getHealth();
    res.json(health);
  });

  router.get('/apme/settings', async (req, res) => {
    await ensureUser(req);
    const {
      enableAi,
      publishViaGateway: settingsPublishViaGateway,
      targetAnsibleCoreVersion,
    } = getApmeConfig(rootConfig);
    res.json({
      enableAi,
      publishViaGateway: settingsPublishViaGateway,
      targetAnsibleCoreVersion,
    });
  });

  router.get('/apme/ai/status', async (req, res) => {
    await ensureUser(req);
    const { enableAi } = getApmeConfig(rootConfig);
    let connected = false;
    let modelCount = 0;
    try {
      const models = await apmeService.getAiModels();
      modelCount = models.length;
      connected = modelCount > 0;
    } catch (err) {
      logger.debug(`APME AI models check failed: ${String(err)}`);
    }
    if (!connected) {
      try {
        const health = await apmeService.getHealth();
        const abbenay = health.components?.find(c => c.name === 'Abbenay AI');
        connected = abbenay?.status === 'ok' || abbenay?.status === 'healthy';
      } catch (err) {
        logger.debug(`APME health check for AI status failed: ${String(err)}`);
      }
    }
    res.json({ enableAi, connected, modelCount });
  });

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
    const limit =
      typeof limitRaw === 'string' ? parseInt(limitRaw, 10) : undefined;
    const violations = await apmeService.getViolations(
      projectId,
      limit !== undefined && !Number.isNaN(limit) ? { limit } : undefined,
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

  router.post('/apme/projects/:projectId/operation', async (req, res) => {
    await ensureUser(req);
    const { projectId } = req.params;
    logger.info(`APME operation triggered for project ${projectId}`);
    const result = await apmeService.triggerScan(projectId);
    res.status(201).json({ operation_id: result.scanId });
  });

  router.get('/apme/rules', async (req, res) => {
    await ensureUser(req);
    logger.debug('APME rules list requested');
    const rules = await apmeService.getRules();
    res.json({ items: rules });
  });

  router.put('/apme/rules/:ruleId/config', async (req, res) => {
    await ensureUser(req);
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
  });

  router.delete('/apme/rules/:ruleId/config', async (req, res) => {
    await ensureUser(req);
    const { ruleId } = req.params;
    logger.info(`APME rule config reset for ${ruleId}`);
    await apmeService.deleteRuleConfig(ruleId);
    res.status(204).send();
  });

  router.post('/apme/suppressions', async (req, res) => {
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

  router.post('/apme/projects', async (req, res) => {
    await ensureUser(req);
    const { name, repo_url } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      throw new InputError('name is required in request body');
    }
    if (!repo_url || typeof repo_url !== 'string') {
      throw new InputError('repo_url is required in request body');
    }
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
    res.json(activity);
  });

  router.get('/apme/activity/:activityId', async (req, res) => {
    await ensureUser(req);
    const { activityId } = req.params;
    logger.debug(`APME activity detail ${activityId} requested`);
    const detail = await apmeService.getActivityDetail(activityId);
    res.json(detail);
  });

  router.get('/apme/projects/:projectId/operation/state', async (req, res) => {
    await ensureUser(req);
    const { projectId } = req.params;
    logger.debug(`APME operation state for project ${projectId} requested`);
    const state = await apmeService.getOperationState(projectId);
    if (!state) {
      res.status(404).json({ error: 'No active operation' });
      return;
    }
    res.json(state);
  });

  router.post('/apme/projects/:projectId/remediate', async (req, res) => {
    await ensureUser(req);
    const { projectId } = req.params;
    logger.info(`APME remediate triggered for project ${projectId}`);
    const result = await apmeService.triggerRemediate(
      projectId,
      req.body?.violation_ids,
    );
    res.status(201).json({ operation_id: result.scanId });
  });

  router.post(
    '/apme/projects/:projectId/operation/approve',
    async (req, res) => {
      await ensureUser(req);
      const { projectId } = req.params;
      const { approved_ids } = req.body;
      logger.info(`APME approve proposals for project ${projectId}`);
      await apmeService.approveProposals(projectId, approved_ids || []);
      res.status(200).json({ success: true });
    },
  );

  router.post('/apme/projects/:projectId/submit', async (req, res) => {
    await ensureUser(req);
    const { projectId } = req.params;
    const {
      activity_id: activityId,
      branch_name: branchName,
      create_pr: createPr,
      title,
      body: prBody,
    } = req.body as {
      activity_id?: string;
      branch_name?: string;
      create_pr?: boolean;
      title?: string;
      body?: string;
    };

    if (!activityId || typeof activityId !== 'string') {
      throw new InputError('activity_id is required in request body');
    }

    logger.info(
      `APME SCM submit for project ${projectId} activity ${activityId}`,
    );

    const token = scmTokenFromRequest(req);
    const result = await apmeService.submitRemediation(projectId, {
      activity_id: activityId,
      branch_name: branchName,
      create_pr: createPr,
      title,
      body: prBody,
      scm_token: token,
    });
    res.status(200).json(result);
  });

  return router as unknown as Router;
}
