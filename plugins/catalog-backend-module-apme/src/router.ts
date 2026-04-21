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

import { Router } from 'express';
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

  return router as unknown as Router;
}
