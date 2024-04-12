/*
 * Copyright 2021 The Ansible plugin Authors
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
import * as os from "os";

import { Logger } from 'winston';
import { executeShellCommand } from '@backstage/plugin-scaffolder-node';
import fetch from 'node-fetch';
import fs from 'fs';

async function downloadFromCreatorService(
  workspacePath: string,
  logger: Logger,
  creatorServiceUrl: string,
  collectionOrgName: string,
) {
    const requestOptions = {
        method: 'GET',
        // headers: {
        //     'Content-Type': 'application/json'
        // },
        // body: JSON.stringify({ collection_name: collectionOrgName })
    };

    try {
        logger.debug(`[ansible-creator] Running ansible-creator-service args: ${collectionOrgName}`);
        const response = await fetch(creatorServiceUrl, requestOptions);

        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }

        const fileStream = fs.createWriteStream(workspacePath +'/'+ collectionOrgName);
        await new Promise((resolve, reject) => {
            response.body.pipe(fileStream);
            response.body.on('error', err => {
                reject(err);
            });
            fileStream.on('finish', function() {
                resolve(true);
            });
        });
        console.log('File downloaded successfully');
    } catch (error) {
        console.error('Error:', error);
    }
}


export async function ansibleCreatorRun(
  workspacePath: string,
  logger: Logger,
  _repoUrl: string,
  _description: string,
  collectionGroup: string,
  collectionName: string,
) {
  logger.info(`Running ansible collection create for ${collectionGroup}.${collectionName}`);
  // const scaffoldPath = "/home/sagpaul/Work/DevHub/temp_scaffold";
  // const creatorServiceUrl = "http://localhost:3100/fetch_collection_tar";

  const scaffoldPath = workspacePath
  ? workspacePath
  : `${os.homedir()}/.ansible/collections/ansible_collections`;

  const collection_name = `${collectionGroup}-${collectionName}.tar`;
  const creatorServiceUrl = `http://localhost:3004/init?collection=${collectionGroup}.${collectionName}`;

  logger.debug(`[ansible-creator] Invoking ansible-creator service with collection args: ${collection_name}`);
  await downloadFromCreatorService(scaffoldPath, logger, creatorServiceUrl, collection_name);
  logger.info(`Out of file download operation`);

  // untar the scafolded collection
  await executeShellCommand({
    command: 'tar',
    args: ["-xvf", collection_name],
    options: {
      cwd: scaffoldPath,
    },
    logStream: logger
  });
  // delete the tarball as it must not be published in Source Control
  await executeShellCommand({
    command: 'rm',
    args: [collection_name],
    options: {
      cwd: scaffoldPath,
    },
    logStream: logger
  });
  logger.info(`[ansible-creator] Completed ansible-creator service invocation for ${collection_name}`);

}
