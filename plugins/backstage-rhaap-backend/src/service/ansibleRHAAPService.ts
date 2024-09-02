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

import { DEFAULT_SCHEDULE, VALID_LICENSE_TYPES } from './constant';
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

class AAPSubscriptionCheckError extends Error {
  public status: number | null = null;
  public message: string = '';

  constructor(status: number, message: string) {
    super();
    this.status = status;
    this.message = message;
  }
}

export class RHAAPService {
  private hasValidSubscription: boolean = false;
  private isAAPCompliant: boolean = false;
  private statusCode: number = 500;
  private readonly scheduleFn: () => Promise<void> = async () => {};
  private static _instance: RHAAPService;
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

    this.logger.info(`[backstage-rhaap-backend] Setting up the scheduler`);

    let schedule: TaskScheduleDefinition = DEFAULT_SCHEDULE;
    if (this.config.has('ansible.rhaap.schedule')) {
      schedule = readTaskScheduleDefinitionFromConfig(
        this.config.getConfig('ansible.rhaap.schedule'),
      );
    }

    if (scheduler) {
      const taskRunner = scheduler.createScheduledTaskRunner(schedule);
      this.scheduleFn = this.createFn(taskRunner);
      const clearSubscriptionCheckTimeout = setTimeout(async () => {
        this.scheduleFn();
        await this.checkSubscription();
        clearTimeout(clearSubscriptionCheckTimeout);
      }, 500);
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
    return {
      status: this.statusCode,
      isValid: this.hasValidSubscription,
      isCompliant: this.isAAPCompliant,
    };
  }

  private createFn(taskRunner: TaskRunner) {
    return async () =>
      taskRunner.run({
        id: 'backstage-rhaap-subscription-check',
        fn: () => this.checkSubscription(),
      });
  }

  private async isAAP25Instance(
    baseUrl: string,
    reqHeaders: fetch.RequestInit,
  ) {
    try {
      const res = await fetch(`${baseUrl}/api/gateway/v1/ping/`, reqHeaders);
      if(!res.ok) {
        return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  private async checkSubscription() {
    let baseUrl;
    try {
      const ansibleConfig = this.config.getConfig('ansible');
      const rhaapConfig = ansibleConfig.getConfig('rhaap');
      baseUrl = rhaapConfig.getString('baseUrl');
      const token = rhaapConfig.getString('token');
      const checkSSL = rhaapConfig.getBoolean('checkSSL') ?? true;
      const agent = new https.Agent({
        rejectUnauthorized: checkSSL,
      });
      const reqHeaders = {
        headers: { Authorization: `Bearer ${token}` },
        agent,
      };

      // check if AAP >=2.5 instance
      let aapResponse: fetch.Response;
      const isAAP25 = await this.isAAP25Instance(baseUrl, reqHeaders);
      if (isAAP25) {
        // Send request to AAP
        this.logger.info(
          `[backstage-rhaap-backend] Checking AAP subscription at ${baseUrl}/api/controller/v2/config/`,
        );

        // subscription check for AAP >=2.5
        aapResponse = await fetch(
          `${baseUrl}/api/controller/v2/config`,
          reqHeaders,
        );
      } else {
        // Send request to AAP
        this.logger.info(
          `[backstage-rhaap-backend] Checking AAP subscription at ${baseUrl}/api/v2/config/`,
        );
        // subscription check for AAP <2.5
        aapResponse = await fetch(`${baseUrl}/api/v2/config`, reqHeaders);
      }

      const data = await aapResponse.json();
      if (!aapResponse.ok) {
        // make the promise be rejected if we didn't get a 2xx response
        throw new AAPSubscriptionCheckError(aapResponse.status, data.detail);
      } else {
        this.statusCode = aapResponse.status;
        this.hasValidSubscription = VALID_LICENSE_TYPES.includes(
          data?.license_info?.license_type,
        );
        this.isAAPCompliant = data?.license_info?.compliant ?? false;
      }
    } catch (error: any) {
      this.logger.error(
        `[backstage-rhaap-backend] AAP subscription Check failed for ${baseUrl}/api/v2/config/`,
      );
      if (error instanceof AAPSubscriptionCheckError) {
        this.statusCode = error.status ?? 404;
      } else if (error.code === 'CERT_HAS_EXPIRED') {
        this.statusCode = 495;
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        this.statusCode = 404;
      } else {
        this.statusCode =
          Number.isInteger(error.code) && error.code >= 100 && error.code < 600
            ? error.code
            : 500;
      }
      this.logger.error(
        `[backstage-rhaap-backend] Error: ${this.statusCode}: ${error.message}`,
      );
      this.hasValidSubscription = false;
      this.isAAPCompliant = false;
    }
  }
}
