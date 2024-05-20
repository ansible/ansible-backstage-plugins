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
  getServiceUrlFromAnsibleConfig,
  getDevspacesUrlFromAnsibleConfig,
  generateRepoUrl,
} from '../utils/config';
import { Logger } from 'winston';
import { Config } from '@backstage/config';

export function createAnsibleContentAction(config: Config) {
  return createTemplateAction<{
    repoOwner: string;
    repoName: string;
    description: string;
    collectionGroup: string;
    collectionName: string;
  }>({
    id: 'ansible:content:create',
    description: 'Runs Ansible creator to scaffold Ansible content',
    schema: {
      input: {
        type: 'object',
        required: [
          'repoOwner',
          'repoName',
          'collectionGroup',
          'collectionName',
        ],
        properties: {
          repoOwner: {
            title: ' Source code repository organization name or username',
            description:
              'The organization name or username of your source code repository. For example, “my-github-username”.',
            type: 'string',
          },
          repoName: {
            title: 'Repository name',
            description: 'The name of the new playbook project repository. For example, “my-new-playbook-repo”.',
            type: 'string',
          },
          collectionGroup: {
            title: 'Collection Namespace',
            description:
              'The collection namespace in your new playbook repository. For example, “my-new-collection-namespace”.',
            type: 'string',
          },
          collectionName: {
            title: 'Collection name',
            description:
              'The collection name in your new playbook repository. For example, “my-new-collection-name”.',
            type: 'string',
          },
          description: {
            title: 'Description',
            description:
              'Describe the playbook or collection and its purpose to help other users understand what to use it for.',
            type: 'string',
          },
        },
      },
      output: {
        type: 'object',
        required: [
          'repoOwner',
          'repoName',
          'collectionGroup',
          'collectionName',
        ],
        properties: {
          devSpacesBaseUrl: {
            type: 'string',
          },
          repoUrl: {
            type: 'string',
          },
        },
      },
    },
    async handler(ctx) {
      const {
        repoOwner,
        repoName,
        description,
        collectionGroup,
        collectionName,
      } = ctx.input;
      ctx.logger.info(
        `Creating Ansible content within ${collectionGroup}.${collectionName} collection with description: ${description}`,
      );

      await ansibleCreatorRun(
        ctx.workspacePath,
        ctx.input.applicationType,
        ctx.logger as Logger,
        description,
        collectionGroup,
        collectionName,
        getServiceUrlFromAnsibleConfig(config),
      );
      ctx.output(
        'devSpacesBaseUrl',
        getDevspacesUrlFromAnsibleConfig(config, repoOwner, repoName),
      );
      ctx.output('repoUrl', generateRepoUrl(repoOwner, repoName));
    },
  });
}
