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

import { Config } from '@backstage/config';
import fetch from 'node-fetch';
import https from 'https';

import { DEFAULT_SCHEDULE } from './constant';
import { Logger } from 'winston';
import {
  PluginTaskScheduler,
  readTaskScheduleDefinitionFromConfig,
  TaskRunner,
  TaskScheduleDefinition,
} from '@backstage/backend-tasks';

export interface AAPSubscriptionCheck {
  status: number;
  isValid: boolean;
  isCompliant: boolean;
}

export class RHAAPService {
  private hasValidSubscription: boolean = false;
  private isAAPCompliant: boolean = false;
  private statusCode: number = 500;
  private static _instance: RHAAPService;
  private readonly scheduleFn!: () => Promise<void>;
  private config!: Config;
  private logger!: Logger;

  private constructor(
    config: Config,
    logger: Logger,
    scheduler?: PluginTaskScheduler,
  ) {
    if (RHAAPService._instance) return RHAAPService._instance;

    this.config = config;
    this.logger = logger;

    this.logger.info(`In RHAAP Service`);

    let schedule: TaskScheduleDefinition = DEFAULT_SCHEDULE;
    if (this.config.has('ansible.rhaap.schedule')) {
      schedule = readTaskScheduleDefinitionFromConfig(
        this.config.getConfig('ansible.rhaap.schedule'),
      );
    }

    if (scheduler) {
      const taskRunner = scheduler.createScheduledTaskRunner(schedule);
      this.scheduleFn = this.createFn(taskRunner);
      this.scheduleFn();
    }
    RHAAPService._instance = this;
  }

  static getInstance(
    config: Config,
    logger: Logger,
    scheduler?: PluginTaskScheduler,
  ): RHAAPService {
    return new RHAAPService(config, logger, scheduler);
  }

  getSubscriptionStatus(): AAPSubscriptionCheck {
    return { status: this.statusCode, isValid: this.hasValidSubscription, isCompliant: this.isAAPCompliant };
  }

  private createFn(taskRunner: TaskRunner) {
    return async () =>
      taskRunner.run({
        id: 'backstage-rhaap-subscription-check',
        fn: () => this.checkSubscription(),
      });
  }

  private async checkSubscription() {
    const ansibleConfig = this.config.getConfig('ansible');
    const rhaapConfig = ansibleConfig.getConfig('rhaap');
    const baseUrl = rhaapConfig.getString('baseUrl');
    const token = rhaapConfig.getString('token');
    const checkSSL = rhaapConfig.getBoolean('checkSSL') ?? true;
    try {
      const agent = new https.Agent({
        rejectUnauthorized: checkSSL,
      });

      // Send request to AAP
      const aapResponse = await fetch(`${baseUrl}/api/v2/config/`, {
        headers: { Authorization: `Bearer ${token}` },
        agent,
      });
      this.logger.info(
        `[backstage-rhaap-backend] Checking AAP subscription at ${baseUrl}/api/v2/config/`,
      );
      const data = await aapResponse.json();
      this.statusCode = aapResponse.status;
      this.hasValidSubscription =
        data?.license_info?.license_type === 'enterprise';
      this.isAAPCompliant = data?.license_info?.compliant ?? false;
    } catch (error: any) {
      this.logger.error(
        `[backstage-rhaap-backend] AAP subscription Check failed at ${baseUrl}/api/v2/config/`,
      );
      this.logger.error(
        `[backstage-rhaap-backend] ${error.message}`,
      );
      if (error.code === 'CERT_HAS_EXPIRED') {
        this.statusCode = 495;
      } else if (error.code === 'ECONNREFUSED') {
        this.statusCode = 404;
      }
      else {
        this.statusCode = Number.isInteger(error.code) && error.code >= 100 && error.code < 600 ? error.code : 500;
      }
      this.hasValidSubscription = false;
    }
  }
}
