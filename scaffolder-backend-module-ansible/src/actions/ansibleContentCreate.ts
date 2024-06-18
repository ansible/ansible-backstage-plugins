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
import * as os from 'os';
import { Logger } from 'winston';
import { executeShellCommand } from '@backstage/plugin-scaffolder-node';
import { BackendServiceAPI } from './utils/api';

export async function ansibleCreatorRun(
  workspacePath: string,
  applicationType: string,
  logger: Logger,
  _description: string,
  collectionGroup: string,
  collectionName: string,
  creatorServiceUrl: string,
) {
  const pluginLogName = 'scaffolder-backend-module-ansible';
  const fileDownloader = new BackendServiceAPI();
  logger.info(
    `[${pluginLogName}] Running plugin operation for ${collectionGroup}.${collectionName}`,
  );

  const scaffoldPath = workspacePath
    ? workspacePath
    : `${os.homedir()}/.ansible/collections/ansible_collections`;

  const tarName = `${collectionGroup}-${applicationType}.tar.gz`;

  logger.info(`[${pluginLogName}] Invoking ansible-devtools-server`);
  try {
    if (applicationType === 'playbook-project') {
      await fileDownloader.downloadPlaybookProject(
        scaffoldPath,
        logger,
        creatorServiceUrl,
        collectionGroup,
        collectionName,
        tarName,
      );
    } else if (applicationType === 'collection-project') {
      await fileDownloader.downloadCollectionProject(
        scaffoldPath,
        logger,
        creatorServiceUrl,
        collectionGroup,
        collectionName,
        tarName,
      );
    }
    logger.info(
      `[${pluginLogName}] ${applicationType} download at ${scaffoldPath}`,
    );
  } catch (error) {
    logger.error(
      `[${pluginLogName}] Error occurred while downloading the project tar at:`,
      error,
    );
  }

  logger.info(
    `[${pluginLogName}] Initiating ${tarName} un-tar at ${scaffoldPath}`,
  );
  // untar the scaffolded collection
  await executeShellCommand({
    command: 'tar',
    args: ['-xvf', tarName],
    options: {
      cwd: scaffoldPath,
    },
    logStream: logger,
  });
  logger.info(`[${pluginLogName}] ${tarName} un-tar successful`);

  // delete the tarball as it must not be published in Source Control
  logger.info(`[${pluginLogName}] deleting ${tarName} from ${scaffoldPath}`);
  await executeShellCommand({
    command: 'rm',
    args: [tarName],
    options: {
      cwd: scaffoldPath,
    },
    logStream: logger,
  });
  logger.info(
    `[${pluginLogName}] ${scaffoldPath} clean for repository creation`,
  );

  logger.info(
    `[${pluginLogName}] create operation for ${applicationType} completed`,
  );
}
