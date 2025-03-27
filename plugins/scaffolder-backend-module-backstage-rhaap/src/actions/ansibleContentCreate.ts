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
import { executeShellCommand } from '@backstage/plugin-scaffolder-node';
import { BackendServiceAPI } from './utils/api';
import { promises as fs } from 'fs';
import { UseCaseMaker } from './helpers';
import { AnsibleConfig } from '../types';
import { appType } from './constants';
import { LoggerService } from '@backstage/backend-plugin-api';

export async function ansibleCreatorRun(
  workspacePath: string,
  applicationType: string,
  logger: LoggerService,
  _description: string,
  collectionGroup: string,
  collectionName: string,
  creatorServiceUrl: string,
) {
  const fileDownloader = new BackendServiceAPI();
  logger.info(
    `[${BackendServiceAPI.pluginLogName}] Running plugin operation for ${collectionGroup}.${collectionName}`,
  );

  const scaffoldPath = workspacePath
    ? workspacePath
    : `${os.homedir()}/.ansible/collections/ansible_collections`;

  const tarName =
    applicationType === appType.DEVFILE
      ? 'devfile.tar'
      : `${collectionGroup}-${applicationType}.tar`;

  logger.info(
    `[${BackendServiceAPI.pluginLogName}] Invoking ansible-devtools-server`,
  );
  try {
    if (applicationType === appType.PLAYBOOK) {
      await fileDownloader.downloadPlaybookProject(
        scaffoldPath,
        logger,
        creatorServiceUrl,
        collectionGroup,
        collectionName,
        tarName,
      );
    } else if (applicationType === appType.COLLECTION) {
      await fileDownloader.downloadCollectionProject(
        scaffoldPath,
        logger,
        creatorServiceUrl,
        collectionGroup,
        collectionName,
        tarName,
      );
    } else if (applicationType === appType.DEVFILE) {
      await fileDownloader.downloadDevfileProject(
        scaffoldPath,
        logger,
        creatorServiceUrl,
        tarName,
      );
    }
    logger.info(
      `[${BackendServiceAPI.pluginLogName}] ${applicationType} download at ${scaffoldPath}`,
    );
  } catch (error) {
    logger.error(
      `[${BackendServiceAPI.pluginLogName}] Error occurred while downloading the project tar at:`,
      error as Error,
    );
  }

  logger.info(
    `[${BackendServiceAPI.pluginLogName}] Initiating ${tarName} un-tar at ${scaffoldPath}`,
  );
  try {
    // untar the scaffolded collection
    await executeShellCommand({
      command: 'tar',
      args: ['-xvf', tarName],
      options: {
        cwd: scaffoldPath,
      },
      logger,
    });
    logger.info(
      `[${BackendServiceAPI.pluginLogName}] ${tarName} un-tar successful`,
    );
  } catch (error: any) {
    logger.error(
      `[${BackendServiceAPI.pluginLogName}] Error while un-tar`,
      error,
    );
    throw new Error(error);
  }

  try {
    // delete the tarball as it must not be published in Source Control
    logger.info(
      `[${BackendServiceAPI.pluginLogName}] deleting ${tarName} from ${scaffoldPath}`,
    );
    await executeShellCommand({
      command: 'rm',
      args: [tarName],
      options: {
        cwd: scaffoldPath,
      },
      logger,
    });
    logger.info(
      `[${BackendServiceAPI.pluginLogName}] ${scaffoldPath} clean for repository creation`,
    );

    logger.info(
      `[${BackendServiceAPI.pluginLogName}] create operation for ${applicationType} completed`,
    );
  } catch (error: any) {
    logger.error(
      `[${BackendServiceAPI.pluginLogName}] Error while deleting tarball: `,
      error,
    );
    throw new Error(error);
  }
}

export async function handleDevfileProject(
  ansibleConfig: AnsibleConfig,
  logger: LoggerService,
  sourceControl: string,
  repositoryUrl: string,
  workspacePath: string,
) {
  const scmType = sourceControl
    .replace(/\.com$/, '')
    .replace(/^./, c => c.toUpperCase());
  const useCaseMaker = new UseCaseMaker({
    ansibleConfig,
    logger,
    scmType,
    apiClient: null,
    useCases: [],
    organization: null,
  });

  try {
    const path = `${workspacePath}/devfile.yaml`;
    const fileContent = await fs.readFile(path, 'utf8');

    const options = {
      value: fileContent,
      repositoryUrl,
    };

    let prLink;
    if (scmType === 'Github') {
      prLink = useCaseMaker.devfilePushToGithub(options);
    } else if (scmType === 'Gitlab') {
      prLink = useCaseMaker.devfilePushToGitLab(options);
    }
    return prLink;
  } catch (error: any) {
    console.error('Error reading the file or pushing to GitHub:', error);
    throw new Error(error.message);
  }
}
