/*
 * Copyright 2024 The Ansible plugin Authors
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

import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { Config } from '@backstage/config';
import { LoggerService, SchedulerService } from '@backstage/backend-plugin-api';

import { RHAAPService } from './ansibleRHAAPService';

export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  scheduler?: SchedulerService;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config, scheduler } = options;
  const middleware = MiddlewareFactory.create({ config, logger });
  const instance = RHAAPService.getInstance(config, logger, scheduler);

  const router = Router();
  router.use(middleware.helmet());
  router.use(express.json());
  router.use(middleware.error());

  router.get('/health', (_, response) => {
    logger.info('PONG!');
    response.json({ status: 'ok' });
  });

  router.get('/aap/subscription', async (_, response) => {
    // Return the subscription status
    const res = instance.getSubscriptionStatus();
    response.status(res.status).json(res);
  });

  return router;
}
