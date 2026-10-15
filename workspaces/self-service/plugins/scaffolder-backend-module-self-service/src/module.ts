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

import { coreServices, createBackendModule } from '@backstage/backend-plugin-api';
import type { ExtensionPoint } from '@backstage/backend-plugin-api';
import type { ScaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import * as scaffolderNode from '@backstage/plugin-scaffolder-node';
import * as scaffolderNodeAlpha from '@backstage/plugin-scaffolder-node/alpha';
import {
  createAnsibleContentAction,
  createEEDefinitionAction,
  prepareForPublishAction,
} from './actions';

const scaffolderActionsExtensionPoint = ((
  scaffolderNode as Record<string, unknown>
).scaffolderActionsExtensionPoint ??
  (scaffolderNodeAlpha as Record<string, unknown>)
    .scaffolderActionsExtensionPoint) as ExtensionPoint<ScaffolderActionsExtensionPoint>;

/**
 * @public
 * The Self-Service Module for the Scaffolder Backend
 *
 * Registers EE definition authoring and publish actions:
 * - ansible:content:create
 * - ansible:create:ee-definition
 * - ansible:prepare:publish
 */
export const scaffolderModuleSelfService = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'self-service',
  register(env) {
    env.registerInit({
      deps: {
        scaffolder: scaffolderActionsExtensionPoint,
        config: coreServices.rootConfig,
        auth: coreServices.auth,
        discovery: coreServices.discovery,
      },
      async init({ scaffolder, config, auth, discovery }) {
        const frontendUrl = config.getString('app.baseUrl');
        scaffolder.addActions(
          createAnsibleContentAction(config),
          createEEDefinitionAction({
            frontendUrl,
            auth,
            discovery,
            config,
          }),
          prepareForPublishAction({
            rootConfig: config,
          }),
        );
      },
    });
  },
});
