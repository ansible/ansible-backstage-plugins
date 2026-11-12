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
import type { ExtensionPoint } from '@backstage/backend-plugin-api';
import type { ScaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import * as scaffolderNode from '@backstage/plugin-scaffolder-node';
import {
  scaffolderAutocompleteExtensionPoint,
  scaffolderTemplatingExtensionPoint,
} from '@backstage/plugin-scaffolder-node/alpha';
import * as scaffolderNodeAlpha from '@backstage/plugin-scaffolder-node/alpha';
import {
  ansibleServiceRef,
  assertAapScaffolderModuleIsUnique,
} from '@ansible/backstage-rhaap-common';
import {
  cleanUp,
  createExecutionEnvironment,
  createJobTemplate,
  createProjectAction,
  launchJobTemplate,
} from './actions';
import {
  multiResourceFilter,
  resourceFilter,
  useCaseNameFilter,
  uuidFilter,
} from './filters';
import { handleAutocompleteRequest } from './autocomplete';

const scaffolderActionsExtensionPoint = ((
  scaffolderNode as Record<string, unknown>
).scaffolderActionsExtensionPoint ??
  (scaffolderNodeAlpha as Record<string, unknown>)
    .scaffolderActionsExtensionPoint) as ExtensionPoint<ScaffolderActionsExtensionPoint>;

/** Registers AAP actions, template filters and autocomplete support. */
export const scaffolderModuleAap = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'aap',
  register(reg) {
    reg.registerInit({
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
      init({
        scaffolder,
        config,
        logger,
        scaffolderTemplating,
        autocomplete,
        ansibleService,
        auth,
        discovery,
      }) {
        assertAapScaffolderModuleIsUnique(scaffolder, 'scaffolderModuleAap');
        scaffolder.addActions(
          createProjectAction(ansibleService),
          createExecutionEnvironment(ansibleService),
          createJobTemplate(ansibleService),
          launchJobTemplate(ansibleService, config),
          cleanUp(ansibleService),
        );
        scaffolderTemplating.addTemplateFilters({
          useCaseNameFilter,
          resourceFilter,
          multiResourceFilter,
          uuidFilter,
        });
        autocomplete.addAutocompleteProvider({
          id: 'aap-api',
          handler: ({ resource, token, context }) =>
            handleAutocompleteRequest({
              resource,
              token,
              context,
              config,
              logger,
              ansibleService,
              auth,
              discovery,
              includeCollections: false,
            }),
        });
        return Promise.resolve();
      },
    });
  },
});
