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
import fs from 'fs-extra';
import fss from 'fs';

import { AAPJobTemplateProvider } from './providers/AAPJobTemplateProvider';
import { AAPEntityProvider } from './providers/AAPEntityProvider';
import { LoggerService } from '@backstage/backend-plugin-api';
import { DiscoveryService, AuthService } from '@backstage/backend-plugin-api';
import { EEEntityProvider } from './providers/EEEntityProvider';
import path from 'path';
import os from 'os';

export async function createRouter(options: {
  logger: LoggerService;
  aapEntityProvider: AAPEntityProvider;
  jobTemplateProvider: AAPJobTemplateProvider;
  eeEntityProvider: EEEntityProvider;
  discovery: DiscoveryService;
  auth: AuthService;
}): Promise<express.Router> {
  const {
    logger,
    aapEntityProvider,
    jobTemplateProvider,
    eeEntityProvider,
    discovery,
    auth,
  } = options;
  const router = Router();

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

  router.post('/aap/register_ee', express.json(), async (request, response) => {
    const { entity } = request.body;

    if (!entity) {
      response.status(400).json({ error: 'Missing entity in request body.' });
      return;
    }

    try {
      await eeEntityProvider.registerEntity(entity);
      response.status(200).json({ success: true });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to register EE: ${errorMessage}`);
      response
        .status(500)
        .json({ error: `Failed to register EE: ${errorMessage}` });
    }
  });

  router.get('/aap/download/ee/:uid/:resource', async (req, res) => {
    const uid = req.params.uid.trim();
    const resource = req.params.resource.trim().toLowerCase();
    logger.info(`EE definition requested for EE entity with uid: ${uid}`);

    // baseUrl and token required for querying the catalog backend
    const baseUrl = await discovery.getBaseUrl('catalog');
    const { token } = await auth.getPluginRequestToken({
      onBehalfOf: await auth.getOwnServiceCredentials(),
      targetPluginId: 'catalog',
    });

    const url = `${baseUrl}/entities/by-uid/${encodeURIComponent(uid)}`;
    logger.info(`Catalog URL: ${url}`);

    let entityResponse;
    try {
      entityResponse = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
    } catch (err: any) {
      logger.error(`Failed to reach catalog API: ${err.message}`);
      return res.status(503).json({ error: 'Catalog API unavailable' });
    }

    if (!entityResponse.ok) {
      logger.error(
        `Catalog responded with ${entityResponse.status} while fetching EE entity with UID ${uid}`,
      );

      if (entityResponse.status === 404) {
        return res
          .status(404)
          .json({ error: `EE entity with UID ${uid} not found` });
      }

      return res.status(entityResponse.status).json({
        error: `Unexpected catalog response while fetching EE entity with UID ${uid}`,
        status: entityResponse.status,
      });
    }

    let entity;
    try {
      entity = await entityResponse.json();
    } catch (err: any) {
      logger.error(
        `Failed parsing catalog API response while fetching EE entity with UID ${uid}: ${err.message}`,
      );
      return res.status(500).json({
        error:
          'Invalid catalog response format while fetching EE entity with UID ${uid}',
      });
    }

    let content = '';
    let fileName = '';
    if (resource === 'definition') {
      content = entity?.spec?.definition ?? '';
      fileName = `${entity?.spec?.name ?? ''}.yaml`;
    } else if (resource === 'readme') {
      content = entity?.spec?.readme ?? '';
      fileName = `README-${entity?.spec?.name ?? ''}.md`;
    }

    if (!content) {
      logger.warn(`EE Entity ${uid} has no ${resource}`);
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `ee-def-${uid}`));
    const filePath = path.join(tmpDir, fileName);

    try {
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (err: any) {
      logger.error(`Failed writing file: ${err.message}`);
      return res
        .status(500)
        .json({ error: 'Unable to prepare file for download' });
    }

    // Set download headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', (await fs.stat(filePath)).size);

    // Stream file and clean up afterward
    const readStream = fss.createReadStream(filePath);

    readStream.on('error', err => {
      logger.error(`File read error for ${uid}: ${err.message}`);
      return res
        .status(500)
        .json({ error: 'Error reading the generated temp file' });
    });

    readStream.on('close', async () => {
      try {
        await fs.unlink(filePath); // delete file
        await fs.rmdir(tmpDir); // delete temp dir
        logger.info(`Cleaned up temp file for UID ${uid}`);
      } catch (err: any) {
        logger.warn(
          `Failed cleaning up temp file ${filePath} for UID ${uid}: ${err.message}`,
        );
      }
    });

    // pipe to response
    readStream.pipe(res);

    // only to satisfy the return type of the function
    return;
  });

  return router;
}
