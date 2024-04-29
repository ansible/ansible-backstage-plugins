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
import * as os from 'os';
import { Logger } from 'winston';
import { executeShellCommand } from '@backstage/plugin-scaffolder-node';
import { BackendServiceAPI } from '../utils/api';

export async function ansibleCreatorRun(
  workspacePath: string,
  applicationType: string,
  logger: Logger,
  _description: string,
  collectionGroup: string,
  collectionName: string,
  creatorServiceUrl: string,
) {
  const fileDownloader = new BackendServiceAPI();
  logger.info(
    `Running ansible collection create for ${collectionGroup}.${collectionName}`,
  );

  const scaffoldPath = workspacePath
    ? workspacePath
    : `${os.homedir()}/.ansible/collections/ansible_collections`;

  const collection_name = `${collectionGroup}-${collectionName}.tar.gz`;

  logger.debug(
    `[ansible-creator] Invoking ansible-creator service with collection args: ${collection_name}`,
  );
  if (applicationType === 'playbook-project') {
    await fileDownloader.downloadPlaybookProject(
      workspacePath,
      logger,
      creatorServiceUrl,
      collectionGroup,
      collectionName,
    );
  } else if (applicationType === 'collection-project') {
    await fileDownloader.downloadCollectionProject(
      workspacePath,
      logger,
      creatorServiceUrl,
      collectionGroup,
      collectionName,
    );
  }
  logger.info(`Out of file download operation`);

  // untar the scaffolded collection
  await executeShellCommand({
    command: 'tar',
    args: ['-xvf', collection_name],
    options: {
      cwd: scaffoldPath,
    },
    logStream: logger,
  });
  // delete the tarball as it must not be published in Source Control
  await executeShellCommand({
    command: 'rm',
    args: [collection_name],
    options: {
      cwd: scaffoldPath,
    },
    logStream: logger,
  });
  logger.info(
    `[ansible-creator] Completed ansible-creator service invocation for ${collection_name}`,
  );
}
