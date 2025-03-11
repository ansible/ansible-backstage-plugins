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

import { HostDiscovery } from '@backstage/backend-common';
import { Config } from '@backstage/config';
import * as fs from 'fs';
import fetch, { Response } from 'node-fetch';
import { Logger } from 'winston';
import https from 'https';
import { AuthService } from '@backstage/backend-plugin-api';

export interface AAPSubscriptionCheck {
  status: number;
  isValid: boolean;
  isCompliant: boolean;
}

export interface AnsibleApi {
  isValidSubscription(): Promise<AAPSubscriptionCheck>;
}

export class BackendServiceAPI {
  static pluginLogName = 'plugin-scaffolder-backend-module-backstage-rhaap';

  private async sendPostRequest(url: string, data: any): Promise<Response> {
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    };

    try {
      const response = await fetch(url, requestOptions);
      if (!response.ok) {
        throw new Error(`Failed to fetch data`);
      }
      return response;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to send POST request: ${error.message}`);
      } else {
        throw new Error(`Failed to send POST request`);
      }
    }
  }

  private async downloadFile(
    response: Response,
    logger: Logger,
    workspacePath: string,
    tarName: string,
  ) {
    try {
      const fileStream = fs.createWriteStream(`${workspacePath}/${tarName}`);
      await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on('error', (err: any) => {
          reject(err);
        });
        fileStream.on('finish', () => {
          resolve(true);
        });
      });
      logger.debug(
        `[${BackendServiceAPI.pluginLogName}] Project tar file downloaded successfully`,
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to download file: ${error.message}`);
      }
    }
  }

  public async downloadPlaybookProject(
    workspacePath: string,
    logger: Logger,
    creatorServiceUrl: string,
    collectionOrgName: string,
    collectionName: string,
    tarName: string,
  ) {
    try {
      const playbookUrl = 'v2/creator/playbook';
      const postData = {
        namespace: collectionOrgName,
        project: 'ansible-project',
        collection_name: collectionName,
      };
      logger.info(
        `${BackendServiceAPI.pluginLogName}] Request for ansible playbook-project: ${collectionOrgName} using ${playbookUrl}`,
      );

      const response = await this.sendPostRequest(
        `${creatorServiceUrl}${playbookUrl}`,
        postData,
      );
      await this.downloadFile(response, logger, workspacePath, tarName);
    } catch (error) {
      try {
        logger.info(
          `${BackendServiceAPI.pluginLogName}] [DEPRECATION WARNING] Older versions of ansible-creator is not recommended. Please upgrade to the recent version of ansible-creator to get the latest support.`,
        );
        const playbookUrlV1 = 'v1/creator/playbook';
        const postDataV1 = {
          scm_org: collectionOrgName,
          project: 'ansible-project',
          scm_project: collectionName,
        };

        logger.info(
          `${BackendServiceAPI.pluginLogName}] Request for ansible playbook-project: ${collectionOrgName} using ${playbookUrlV1}`,
        );

        const responseV1 = await this.sendPostRequest(
          `${creatorServiceUrl}${playbookUrlV1}`,
          postDataV1,
        );
        await this.downloadFile(responseV1, logger, workspacePath, tarName);
      } catch (fallbackError) {
        logger.error(
          `${BackendServiceAPI.pluginLogName}] Failed. Please ensure your ansible-creator version is supported.`,
        );
        throw new Error(`:downloadPlaybookProject:`);
      }
    }
  }

  public async downloadCollectionProject(
    workspacePath: string,
    logger: Logger,
    creatorServiceUrl: string,
    collectionOrgName: string,
    collectionName: string,
    tarName: string,
  ) {
    try {
      const collectionUrl = 'v2/creator/collection';
      const postData = {
        collection: `${collectionOrgName}.${collectionName}`,
        project: 'collection',
      };

      logger.debug(
        `${BackendServiceAPI.pluginLogName}] Request for ansible collection-project: ${collectionOrgName} using ${collectionUrl}`,
      );

      const response = await this.sendPostRequest(
        `${creatorServiceUrl}${collectionUrl}`,
        postData,
      );
      await this.downloadFile(response, logger, workspacePath, tarName);
    } catch (error) {
      try {
        logger.info(
          `${BackendServiceAPI.pluginLogName}] [DEPRECATION WARNING] Older versions of ansible-creator is not recommended. Please upgrade to the recent version of ansible-creator to get the latest support.`,
        );
        const collectionUrlV1 = 'v1/creator/collection';
        const postDataV1 = {
          collection: `${collectionOrgName}.${collectionName}`,
          project: 'collection',
        };

        logger.debug(
          `${BackendServiceAPI.pluginLogName}] Request for ansible collection-project: ${collectionOrgName} using ${collectionUrlV1}`,
        );

        const responseV1 = await this.sendPostRequest(
          `${creatorServiceUrl}${collectionUrlV1}`,
          postDataV1,
        );
        await this.downloadFile(responseV1, logger, workspacePath, tarName);
      } catch (fallbackError) {
        logger.error(
          `${BackendServiceAPI.pluginLogName}] Failed. Please ensure your ansible-creator version is supported.`,
        );
        throw new Error(`:downloadCollectionProject:`);
      }
    }
  }

  public async downloadDevfileProject(
    workspacePath: string,
    logger: Logger,
    creatorServiceUrl: string,
    tarName: string,
  ) {
    try {
      const devfileUrl = 'v2/creator/devfile';
      const postData = {};

      logger.info(
        `${BackendServiceAPI.pluginLogName}] Request for ansible devfile`,
      );

      const response = await this.sendPostRequest(
        `${creatorServiceUrl}${devfileUrl}`,
        postData,
      );

      logger.info(
        `${BackendServiceAPI.pluginLogName}] Request complete for ansible devfile`,
      );
      await this.downloadFile(response, logger, workspacePath, tarName);
    } catch (fallbackError) {
      logger.error(
        `${BackendServiceAPI.pluginLogName}] Failed. Please ensure your ansible-creator version is supported.`,
      );
      throw new Error(`:downloadDevfileProject:`);
    }
  }
}

export class AnsibleApiClient implements AnsibleApi {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly auth: AuthService;

  constructor({
    config,
    logger,
    auth,
  }: {
    config: Config;
    logger: Logger;
    auth: AuthService;
  }) {
    this.config = config;
    this.logger = logger;
    this.auth = auth;
  }

  async isValidSubscription(): Promise<AAPSubscriptionCheck> {
    const discovery = HostDiscovery.fromConfig(this.config);
    try {
      const baseUrl = await discovery.getBaseUrl('backstage-rhaap');
      this.logger.info(
        `[${BackendServiceAPI.pluginLogName}] Scaffolder checking AAP subscription at ${baseUrl}/aap/subscription`,
      );
      const agent = new https.Agent({
        rejectUnauthorized: true,
      });
      const { token } = await this.auth.getPluginRequestToken({
        onBehalfOf: await this.auth.getOwnServiceCredentials(),
        targetPluginId: 'backstage-rhaap', // e.g. 'catalog'
      });
      if (!token) throw new Error('Authentication token missing');
      const response = await fetch(`${baseUrl}/aap/subscription`, {
        headers: { Authorization: `Bearer ${token}` },
        agent,
      });
      const data = await response.json();
      this.logger.info(
        `[${BackendServiceAPI.pluginLogName}] Scaffolder AAP subscription check succeeded`,
      );
      return data;
    } catch (error: any) {
      if (error instanceof Error) {
        this.logger.error(
          `[${BackendServiceAPI.pluginLogName}] Scaffolder AAP Error checking AAP subscription:`,
          error.message,
        );
      } else {
        this.logger.error(
          `[${BackendServiceAPI.pluginLogName}] Scaffolder AAP Error checking AAP subscription`,
        );
      }
      return { status: 500, isValid: false, isCompliant: false };
    }
  }
}
