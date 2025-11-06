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
import {
  scaffolderActionsExtensionPoint,
  scaffolderAutocompleteExtensionPoint,
  scaffolderTemplatingExtensionPoint,
} from '@backstage/plugin-scaffolder-node/alpha';
import {
  ansibleServiceRef,
  getAnsibleConfig,
} from '@ansible/backstage-rhaap-common';
import {
  createAnsibleContentAction,
  cleanUp,
  createExecutionEnvironment,
  createJobTemplate,
  createProjectAction,
  createShowCases,
  launchJobTemplate,
  createEEDefinitionAction,
  prepareForPublishAction,
  createEETemplateAction,
  createEECatalogInfoAction,
} from './actions';

import {
  multiResourceFilter,
  resourceFilter,
  useCaseNameFilter,
} from './filters';
import { handleAutocompleteRequest } from './autocomplete';

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
        scaffolderTemplating: scaffolderTemplatingExtensionPoint,
        autocomplete: scaffolderAutocompleteExtensionPoint,
        ansibleService: ansibleServiceRef,
        auth: coreServices.auth,
        discovery: coreServices.discovery,
      },
      async init({
        scaffolder,
        config,
        logger,
        scaffolderTemplating,
        autocomplete,
        ansibleService,
        auth,
        discovery,
      }) {
        const ansibleConfig = getAnsibleConfig(config);
        scaffolder.addActions(
          createAnsibleContentAction(config, ansibleConfig),
          createProjectAction(ansibleService),
          createExecutionEnvironment(ansibleService),
          createJobTemplate(ansibleService),
          launchJobTemplate(ansibleService),
          cleanUp(ansibleService),
          createShowCases(ansibleService, ansibleConfig),
          createEEDefinitionAction(),
          createEETemplateAction(),
          prepareForPublishAction({
            ansibleConfig: ansibleConfig,
          }),
          createEECatalogInfoAction({
            auth,
            discovery,
          }),
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
            handleAutocompleteRequest({
              resource,
              token,
              config,
              logger,
              ansibleService,
            }),
        });
      },
    });
  },
});
