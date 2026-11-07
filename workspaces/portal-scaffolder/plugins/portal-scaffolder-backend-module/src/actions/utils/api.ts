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

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import fetch, { Response } from 'node-fetch';
import { LoggerService } from '@backstage/backend-plugin-api';
import type { FileHandle } from 'node:fs/promises';

export class BackendServiceAPI {
  static pluginLogName = 'portal-scaffolder-backend-module';

  private async sendPostRequest(
    url: string,
    data: any,
    signal?: AbortSignal,
  ): Promise<Response> {
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      timeout: 60_000,
      ...(signal ? { signal } : {}),
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

  private async sendCreatorPost(
    url: string,
    data: any,
    signal?: AbortSignal,
  ): Promise<Response> {
    return signal
      ? this.sendPostRequest(url, data, signal)
      : this.sendPostRequest(url, data);
  }

  private async downloadFile(
    response: Response,
    logger: LoggerService,
    workspacePath: string,
    tarName: string,
  ) {
    if (path.basename(tarName) !== tarName) {
      throw new Error('Failed to download file: invalid archive name');
    }
    const outputPath = path.join(workspacePath, tarName);
    let file: FileHandle | undefined;
    try {
      // Exclusive creation rejects existing files and symlinks in the workspace.
      file = await fs.promises.open(outputPath, 'wx');
      await pipeline(response.body, file.createWriteStream());
      logger.debug(
        `[${BackendServiceAPI.pluginLogName}] Project tar file downloaded successfully`,
      );
    } catch (error) {
      if (file) {
        await file.close().catch(() => undefined);
        await fs.promises
          .rm(outputPath, { force: true })
          .catch(() => undefined);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to download file: ${message}`, {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  public async downloadPlaybookProject(
    workspacePath: string,
    logger: LoggerService,
    creatorServiceUrl: string,
    collectionOrgName: string,
    collectionName: string,
    tarName: string,
    signal?: AbortSignal,
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

      const response = await this.sendCreatorPost(
        `${creatorServiceUrl}${playbookUrl}`,
        postData,
        signal,
      );
      await this.downloadFile(response, logger, workspacePath, tarName);
    } catch (error) {
      if (signal?.aborted) throw error;
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

        const responseV1 = await this.sendCreatorPost(
          `${creatorServiceUrl}${playbookUrlV1}`,
          postDataV1,
          signal,
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
    logger: LoggerService,
    creatorServiceUrl: string,
    collectionOrgName: string,
    collectionName: string,
    tarName: string,
    signal?: AbortSignal,
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

      const response = await this.sendCreatorPost(
        `${creatorServiceUrl}${collectionUrl}`,
        postData,
        signal,
      );
      await this.downloadFile(response, logger, workspacePath, tarName);
    } catch (error) {
      if (signal?.aborted) throw error;
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

        const responseV1 = await this.sendCreatorPost(
          `${creatorServiceUrl}${collectionUrlV1}`,
          postDataV1,
          signal,
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

  public async downloadEEScaffold(
    workspacePath: string,
    logger: LoggerService,
    creatorServiceUrl: string,
    eeConfig: Record<string, any>,
    tarName: string,
    scmProvider?: string,
    signal?: AbortSignal,
  ) {
    try {
      const scaffoldUrl = 'v2/creator/scaffold';
      const params: Record<string, any> = { ee_config: eeConfig };
      if (scmProvider) {
        params.scm_provider = scmProvider;
      }
      const postData = {
        command_path: ['init', 'execution_env'],
        params,
      };

      logger.info(
        `${BackendServiceAPI.pluginLogName}] Request for EE scaffold using ${scaffoldUrl}`,
      );

      const response = await this.sendCreatorPost(
        `${creatorServiceUrl}${scaffoldUrl}`,
        postData,
        signal,
      );

      logger.info(
        `${BackendServiceAPI.pluginLogName}] Request complete for EE scaffold`,
      );
      await this.downloadFile(response, logger, workspacePath, tarName);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error); // NOSONAR — error is properly coerced via String()
      logger.error(
        `${BackendServiceAPI.pluginLogName}] Failed to scaffold EE definition. Please ensure your ansible-creator version supports the scaffold endpoint. ${errorMessage}`,
      );
      throw new Error(`Failed to scaffold EE definition: ${errorMessage}`, {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  public async downloadDevfileProject(
    workspacePath: string,
    logger: LoggerService,
    creatorServiceUrl: string,
    tarName: string,
    signal?: AbortSignal,
  ) {
    try {
      const devfileUrl = 'v2/creator/devfile';
      const postData = {};

      logger.info(
        `${BackendServiceAPI.pluginLogName}] Request for ansible devfile`,
      );

      const response = await this.sendCreatorPost(
        `${creatorServiceUrl}${devfileUrl}`,
        postData,
        signal,
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
