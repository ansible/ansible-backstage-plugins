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

import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { ansibleCreatorRun } from './ansibleContentCreate';
import {
  validateAnsibleConfig,
  getServiceUrlFromAnsibleConfig,
  getDevspacesUrlFromAnsibleConfig,
  generateRepoUrl,
} from './utils/config';
import { Config } from '@backstage/config';
import { BackendServiceAPI } from './utils/api';
import { ScaffolderLogger } from './utils/logger';
import { appType } from './constants';

export function createAnsibleContentAction(config: Config) {
  return createTemplateAction({
    id: 'ansible:content:create',
    description: 'Runs Ansible creator to scaffold Ansible content',
    schema: {
      input: {
        sourceControl: z =>
          z
            .string({
              description:
                'The source control source name. For example, “github.com”.',
            })
            .optional(),
        repoOwner: z =>
          z
            .string({
              description:
                'The organization name or username of your source code repository. For example, “my-github-username”.',
            })
            .optional(),
        repoName: z =>
          z
            .string({
              description:
                'The name of the new playbook project repository. For example, “my-new-playbook-repo”.',
            })
            .optional(),
        collectionGroup: z =>
          z
            .string({
              description:
                'The collection namespace in your new playbook repository. For example, “my-new-collection-namespace”.',
            })
            .optional(),
        collectionName: z =>
          z
            .string({
              description:
                'The collection name in your new playbook repository. For example, “my-new-collection-name”.',
            })
            .optional(),
        description: z =>
          z
            .string({
              description:
                'Describe the playbook or collection and its purpose to help other users understand what to use it for.',
            })
            .optional(),
        applicationType: z =>
          z.string({ description: 'The Application type.' }).optional(),
      },
      output: {
        devSpacesBaseUrl: z => z.string().optional(),
        repoUrl: z => z.string().optional(),
      },
    },
    async handler(ctx) {
      const { input, logger } = ctx;
      const {
        sourceControl = '',
        repoOwner = '',
        repoName = '',
        description = '',
        collectionGroup = '',
        collectionName = '',
      } = input;
      const applicationType = input.applicationType ?? '';

      const log = new ScaffolderLogger(BackendServiceAPI.pluginLogName, logger);
      try {
        log.info(
          `Creating Ansible content ${collectionGroup}.${collectionName} with source control ${sourceControl}`,
        );

        log.info(`Checking plugin configuration`);
        validateAnsibleConfig(config);
        log.info(`Plugin configuration is correct`);

        await ansibleCreatorRun(
          ctx.workspacePath,
          applicationType,
          logger,
          description,
          collectionGroup,
          collectionName,
          getServiceUrlFromAnsibleConfig(config),
        );
        log.info(`ansibleCreatorRun completed successfully`);
        if (applicationType !== appType.DEVFILE) {
          ctx.output(
            'devSpacesBaseUrl',
            getDevspacesUrlFromAnsibleConfig(
              config,
              sourceControl,
              repoOwner,
              repoName,
            ),
          );
          ctx.output(
            'repoUrl',
            generateRepoUrl(sourceControl, repoOwner, repoName),
          );
        }
        log.info(`context output processed successfully`);
      } catch (error: any) {
        log.error(`Error occured: ${JSON.stringify(error)}`);
        throw new Error(error.message);
      }
    },
  });
}
