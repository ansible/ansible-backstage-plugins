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

import * as fs from 'fs';
import fetch, { Response } from 'node-fetch';
import { Logger } from 'winston';

export class BackendServiceAPI {
  pluginLogName = 'scaffolder-backend-module-ansible';

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
        throw new Error(
          `Failed to send POST request: ${error.message}`,
        );
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
      logger.debug(`[${this.pluginLogName}] Project tar file downloaded successfully`);
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
      logger.debug(
        `${this.pluginLogName}] Request for ansible playbook-project: ${collectionOrgName}`,
      );
      const playbookUrl = 'v1/creator/playbook';
      const postData = {
        scm_org: collectionOrgName,
        project: 'ansible-project',
        scm_project: collectionName,
      };

      const response = await this.sendPostRequest(
        `${creatorServiceUrl}${playbookUrl}`,
        postData,
      );
      await this.downloadFile(response, logger, workspacePath, tarName);
    } catch (error) {
      throw new Error(`:downloadPlaybookProject:`);
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
      logger.debug(
        `${this.pluginLogName}] Request for ansible collection-project: ${collectionOrgName}`,
      );
      const collectionUrl = 'v1/creator/collection';
      const postData = {
        collection: `${collectionOrgName}.${collectionName}`,
        project: 'collection',
      };

      const response = await this.sendPostRequest(
        `${creatorServiceUrl}${collectionUrl}`,
        postData,
      );
      await this.downloadFile(response, logger, workspacePath, tarName);
    } catch (error) {
      throw new Error(`:downloadCollectionProject`);
    }
  }
}
