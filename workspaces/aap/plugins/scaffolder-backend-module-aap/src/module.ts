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

import { createBackendModule } from '@backstage/backend-plugin-api';
import type { ExtensionPoint } from '@backstage/backend-plugin-api';
import type { ScaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import * as scaffolderNode from '@backstage/plugin-scaffolder-node';
import * as scaffolderNodeAlpha from '@backstage/plugin-scaffolder-node/alpha';
import { ansibleServiceRef } from '@ansible/backstage-rhaap-common';
import { createExecutionEnvironment } from './actions/aapCreateEEEnv';
import { createJobTemplate } from './actions/aapCreateJobTemplate';
import { createProjectAction } from './actions/aapCreateProject';

const scaffolderActionsExtensionPoint = ((
  scaffolderNode as Record<string, unknown>
).scaffolderActionsExtensionPoint ??
  (scaffolderNodeAlpha as Record<string, unknown>)
    .scaffolderActionsExtensionPoint) as ExtensionPoint<ScaffolderActionsExtensionPoint>;

/** Registers AAP scaffolder actions with the Scaffolder backend. */
export const scaffolderModuleAap = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'aap',
  register(reg) {
    reg.registerInit({
      deps: {
        scaffolder: scaffolderActionsExtensionPoint,
        ansibleService: ansibleServiceRef,
      },
      async init({ scaffolder, ansibleService }) {
        scaffolder.addActions(
          createProjectAction(ansibleService),
          createExecutionEnvironment(ansibleService),
          createJobTemplate(ansibleService),
        );
      },
    });
  },
});
