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
import {
  IApmeService,
  getApmeConfig,
  isApmePublishViaGateway,
} from '@ansible/backstage-apme-common';
import { RemediationPublisher } from './remediationPublisher';

export interface RouterOptions {
  apmeService: IApmeService;
  logger: LoggerService;
  httpAuth: HttpAuthService;
  rootConfig: Config;
}

function githubTokenFromRequest(
  req: Pick<Request, 'headers'>,
): string | undefined {
  const raw =
    (req.headers['x-github-token'] as string | undefined) ??
    (req.headers['x-gitlab-token'] as string | undefined);
  const token = raw?.trim();
  return token || undefined;
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { apmeService, logger, httpAuth, rootConfig } = options;
  const router = PromiseRouter();
  const publishViaGateway = isApmePublishViaGateway(rootConfig);
  const remediationPublisher = RemediationPublisher.fromConfig({
    rootConfig,
    logger,
  });

  router.use(json());

  const ensureUser = async (req: unknown) => {
    await httpAuth.credentials(
      req as Parameters<HttpAuthService['credentials']>[0],
      {
        allow: ['user'],
      },
    );
  };

  router.get('/apme/health', async (_req, res) => {
    logger.debug('APME health check requested');
    const health = await apmeService.getHealth();
    res.json(health);
  });

  router.get('/apme/settings', async (_req, res) => {
    const { enableAi, publishViaGateway: settingsPublishViaGateway } =
      getApmeConfig(rootConfig);
    res.json({ enableAi, publishViaGateway: settingsPublishViaGateway });
  });

  router.get('/apme/ai/status', async (_req, res) => {
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

  router.get('/apme/projects', async (_req, res) => {
    logger.debug('APME projects list requested');
    const projects = await apmeService.getProjects();
    res.json({ items: projects });
  });

  router.get('/apme/projects/:projectId', async (req, res) => {
    const { projectId } = req.params;
    logger.debug(`APME project ${projectId} requested`);
    const project = await apmeService.getProject(projectId);
    res.json(project);
  });

  router.get('/apme/projects/:projectId/violations', async (req, res) => {
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

  router.post('/apme/projects/:projectId/operation', async (req, res) => {
    await ensureUser(req);
    const { projectId } = req.params;
    logger.info(`APME operation triggered for project ${projectId}`);
    const result = await apmeService.triggerScan(projectId);
    res.status(201).json({ operation_id: result.scanId });
  });

  router.get('/apme/rules', async (_req, res) => {
    logger.debug('APME rules list requested');
    const rules = await apmeService.getRules();
    res.json({ items: rules });
  });

  router.get('/apme/lookup', async (req, res) => {
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
    const { projectId } = req.params;
    logger.debug(`APME activity for project ${projectId} requested`);
    const activity = await apmeService.getActivity(projectId);
    res.json(activity);
  });

  router.get('/apme/projects/:projectId/operation/state', async (req, res) => {
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

  router.get(
    '/apme/activity/:activityId/remediation-bundle',
    async (req, res) => {
      const { activityId } = req.params;
      logger.debug(`APME remediation bundle for activity ${activityId}`);
      const bundle = await apmeService.getRemediationBundle(activityId);
      res.json(bundle);
    },
  );

  router.post('/apme/activity/:activityId/push-branch', async (req, res) => {
    await ensureUser(req);
    const { activityId } = req.params;
    const { branch_name: branchName } = req.body as { branch_name?: string };
    logger.info(`APME push remediation branch for activity ${activityId}`);

    if (publishViaGateway) {
      throw new InputError(
        'push-branch requires ansible.apme.publishViaGateway: false (portal SCM publish path)',
      );
    }

    const bundle = await apmeService.getRemediationBundle(activityId);
    if (bundle.pr_url) {
      res.status(409).json({
        error: `PR already created for this activity: ${bundle.pr_url}`,
      });
      return;
    }

    const userToken = githubTokenFromRequest(req);
    const result = await remediationPublisher.pushBranch(
      bundle,
      userToken,
      branchName,
    );
    res.status(201).json(result);
  });

  router.post('/apme/activity/:activityId/pull-request', async (req, res) => {
    await ensureUser(req);
    const { activityId } = req.params;
    const {
      projectId,
      scm_token: scmToken,
      branch_name: branchName,
    } = req.body as {
      projectId?: string;
      scm_token?: string;
      branch_name?: string;
    };

    if (!projectId || typeof projectId !== 'string') {
      throw new InputError('projectId is required in request body');
    }

    logger.info(`APME create PR for activity ${activityId}`);

    if (publishViaGateway) {
      const result = await apmeService.createPullRequest(
        projectId,
        activityId,
        scmToken,
      );
      res.status(201).json(result);
      return;
    }

    const bundle = await apmeService.getRemediationBundle(activityId);
    if (bundle.pr_url) {
      res.status(200).json({
        pr_url: bundle.pr_url,
        branch_name: branchName ?? bundle.branch_name,
        provider: bundle.scm_provider,
      });
      return;
    }

    const targetBranch = branchName ?? bundle.branch_name;
    const userToken = scmToken ?? githubTokenFromRequest(req);

    if (!branchName) {
      await remediationPublisher.pushBranch(bundle, userToken, targetBranch);
    }

    const prResult = await remediationPublisher.createPullRequest(
      bundle,
      userToken,
      targetBranch,
    );
    const recorded = await apmeService.recordPullRequest(activityId, prResult);
    res.status(201).json(recorded);
  });

  return router as unknown as Router;
}
