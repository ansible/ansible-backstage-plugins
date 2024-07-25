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
  createBackendModule
} from '@backstage/backend-plugin-api';
import { loggerToWinstonLogger } from '@backstage/backend-common';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node/alpha';
import { createAnsibleContentAction } from './actions';

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
        auth: coreServices.auth
      },
      async init({ scaffolder, config, logger, auth }) {
        scaffolder.addActions(createAnsibleContentAction(config, loggerToWinstonLogger(logger), auth));
      },
    });
  },
});
