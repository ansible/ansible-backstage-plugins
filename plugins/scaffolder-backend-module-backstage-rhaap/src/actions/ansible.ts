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
import { AnsibleApiClient, BackendServiceAPI } from './utils/api';
import { ScaffolderLogger } from './utils/logger';
import { AuthService } from '@backstage/backend-plugin-api';
import { AnsibleConfig } from '../types';
import { handleDevfileProject } from './ansibleContentCreate';
import { appType } from './constants';

export function createAnsibleContentAction(
  config: Config,
  auth: AuthService,
  ansibleConfig: AnsibleConfig,
) {
  return createTemplateAction<{
    sourceControl: string;
    repoOwner: string;
    repoName: string;
    repositoryUrl: string;
    description: string;
    collectionGroup: string;
    collectionName: string;
    applicationType: string;
  }>({
    id: 'ansible:content:create',
    description: 'Runs Ansible creator to scaffold Ansible content',
    schema: {
      input: {
        type: 'object',
        required: [],
        properties: {
          sourceControl: {
            title: 'Source control options',
            description:
              'The source control source name. For example, “github.com”.',
            type: 'string',
          },
          repoOwner: {
            title: ' Source code repository organization name or username',
            description:
              'The organization name or username of your source code repository. For example, “my-github-username”.',
            type: 'string',
          },
          repoName: {
            title: 'Repository Name',
            description:
              'The name of the new playbook project repository. For example, “my-new-playbook-repo”.',
            type: 'string',
          },
          repositoryUrl: {
            title: 'Source code repository URL',
            description:
              'The repository URL where the devfile needs to be scaffolded.',
            type: 'string',
          },
          collectionGroup: {
            title: 'Collection Namespace',
            description:
              'The collection namespace in your new playbook repository. For example, “my-new-collection-namespace”.',
            type: 'string',
          },
          collectionName: {
            title: 'Collection Name',
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
          applicationType: {
            title: 'Application type',
            description: 'The Application type.',
            type: 'string',
          },
        },
      },
      output: {
        type: 'object',
        required: [
          'sourceControl',
          'repoOwner',
          'repoName',
          'repositoryUrl',
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
      const { input, logger } = ctx;
      const {
        sourceControl,
        repoOwner,
        repoName,
        repositoryUrl,
        description,
        collectionGroup,
        collectionName,
      } = input;

      const log = new ScaffolderLogger(BackendServiceAPI.pluginLogName, logger);
      const AAPSubscription = new AnsibleApiClient({ config, logger, auth });

      try {
        log.info(`Checking for Ansible Automation Platform subscription`);

        const { status, isValid, isCompliant } =
          await AAPSubscription.isValidSubscription();

        if (status === 495 || status === 500) {
          log.warn(
            `Verify that Ansible Automation Platform is reachable and correctly configured in the Ansible plug-ins.`,
          );
        } else if (status === 404) {
          log.warn(
            `Verify that the resource url for Ansible Automation Platform are correctly configured in the Ansible plug-ins.`,
          );
        } else if (status === 401) {
          log.warn(
            `Verify that the authentication details for Ansible Automation Platform are correctly configured in the Ansible plug-ins.`,
          );
        } else if (!isCompliant) {
          log.warn(
            `The connected Ansible Automation Platform subscription is out of compliance. Contact your Red Hat account team to obtain a new subscription entitlement.`,
          );
        } else if (!isValid) {
          log.warn(
            `The connected Ansible Automation Platform subscription is invalid. Contact your Red Hat account team.`,
          );
        }

        if (isValid)
          log.info(`Valid Ansible Automation Platform subscription found`);

        log.info(
          `Creating Ansible content ${collectionGroup}.${collectionName} with source control ${sourceControl}`,
        );

        log.info(`Checking plugin configuration`);
        validateAnsibleConfig(config);
        log.info(`Plugin configuration is correct`);

        await ansibleCreatorRun(
          ctx.workspacePath,
          ctx.input.applicationType,
          logger,
          description,
          collectionGroup,
          collectionName,
          getServiceUrlFromAnsibleConfig(config),
        );
        log.info(`ansibleCreatorRun completed successfully`);
        if (ctx.input.applicationType === appType.DEVFILE) {
          log.info(`RepoURL ${repositoryUrl}`);
          const prLink = await handleDevfileProject(
            ansibleConfig,
            logger,
            sourceControl,
            ctx.input.repositoryUrl,
            ctx.workspacePath,
          );
          ctx.output('prUrl', prLink);
        } else {
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
