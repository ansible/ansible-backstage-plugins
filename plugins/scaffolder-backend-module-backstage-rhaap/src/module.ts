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

import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { loggerToWinstonLogger } from '@backstage/backend-common';
import {
  scaffolderActionsExtensionPoint,
  scaffolderAutocompleteExtensionPoint,
  scaffolderTemplatingExtensionPoint,
} from '@backstage/plugin-scaffolder-node/alpha';
import {
  createAnsibleContentAction,
  cleanUp,
  createExecutionEnvironment,
  createJobTemplate,
  createProjectAction,
  createShowCases,
  launchJobTemplate,
} from './actions';

import {
  multiResourceFilter,
  resourceFilter,
  useCaseNameFilter,
} from './filters';
import { handleAutocompleteRequest } from './autocomplete';
import { getAnsibleConfig } from './config-reader';
/**
 * @public
 * The Ansible Module for the Scaffolder Backend
 */
export const scaffolderModuleAnsible = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'ansible',
  register(env) {
    env.registerInit({
      deps: {
        scaffolder: scaffolderActionsExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        auth: coreServices.auth,
        scaffolderTemplating: scaffolderTemplatingExtensionPoint,
        autocomplete: scaffolderAutocompleteExtensionPoint,
      },
      async init({
        scaffolder,
        config,
        logger,
        auth,
        scaffolderTemplating,
        autocomplete,
      }) {
        const ansibleConfig = getAnsibleConfig(config);
        scaffolder.addActions(
          createAnsibleContentAction(
            config,
            loggerToWinstonLogger(logger),
            auth,
            ansibleConfig,
          ),
          createProjectAction(ansibleConfig, logger),
          createExecutionEnvironment(ansibleConfig, logger),
          createJobTemplate(ansibleConfig, logger),
          launchJobTemplate(ansibleConfig, logger),
          cleanUp(ansibleConfig, logger),
          createShowCases(ansibleConfig, logger),
        );
        scaffolderTemplating.addTemplateFilters({
          useCaseNameFilter: useCaseNameFilter,
          resourceFilter: resourceFilter,
          multiResourceFilter: multiResourceFilter,
        });
        autocomplete.addAutocompleteProvider({
          id: 'aap-api-cloud',
          handler: ({
            resource,
            token,
          }: {
            resource: string;
            token: string;
          }): Promise<{ results: any[] }> =>
            handleAutocompleteRequest({ resource, token, config, logger }),
        });
      },
    });
  },
});
