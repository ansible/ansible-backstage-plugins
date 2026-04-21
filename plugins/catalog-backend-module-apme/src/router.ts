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

import { Router, json } from 'express';
import Router__default from 'express-promise-router';
import { LoggerService } from '@backstage/backend-plugin-api';
import { IApmeService } from '@ansible/backstage-apme-common';

export interface RouterOptions {
  apmeService: IApmeService;
  logger: LoggerService;
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { apmeService, logger } = options;
  const router = Router__default();

  // Parse JSON request bodies
  router.use(json());

  router.get('/apme/health', async (_req, res) => {
    logger.debug('APME health check requested');
    const health = await apmeService.getHealth();
    res.json(health);
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
    const violations = await apmeService.getViolations(projectId);
    res.json(violations);
  });

  router.post('/apme/projects/:projectId/operation', async (req, res) => {
    const { projectId } = req.params;
    logger.info(`APME operation triggered for project ${projectId}`);
    const result = await apmeService.triggerScan(projectId);
    res.status(201).json(result);
  });

  router.get('/apme/rules', async (_req, res) => {
    logger.debug('APME rules list requested');
    const rules = await apmeService.getRules();
    res.json({ items: rules });
  });

  router.get('/apme/lookup', async (req, res) => {
    const repoUrl = req.query.repo_url as string;
    if (!repoUrl) {
      res.status(400).json({ error: 'repo_url query parameter is required' });
      return;
    }
    logger.debug(`APME project lookup by repo URL: ${repoUrl}`);
    const project = await apmeService.getProjectByRepoUrl(repoUrl);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  });

  router.post('/apme/projects', async (req, res) => {
    logger.info('APME create project requested');
    const project = await apmeService.createProject(req.body);
    res.status(201).json(project);
  });

  router.delete('/apme/projects/:projectId', async (req, res) => {
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
    const { projectId } = req.params;
    logger.info(`APME remediate triggered for project ${projectId}`);
    const result = await apmeService.triggerRemediate(projectId);
    res.status(201).json(result);
  });

  router.post('/apme/projects/:projectId/operation/approve', async (req, res) => {
    const { projectId } = req.params;
    const { approved_ids } = req.body;
    logger.info(`APME approve proposals for project ${projectId}`);
    await apmeService.approveProposals(projectId, approved_ids || []);
    res.status(200).json({ success: true });
  });

  router.post('/apme/activity/:activityId/pull-request', async (req, res) => {
    const { activityId } = req.params;
    const { projectId } = req.body;
    logger.info(`APME create PR for activity ${activityId}`);
    const result = await apmeService.createPullRequest(projectId, activityId);
    res.status(201).json(result);
  });

  return router as unknown as Router;
}
