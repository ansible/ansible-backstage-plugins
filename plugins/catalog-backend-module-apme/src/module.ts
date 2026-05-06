/*
 * Copyright Red Hat
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
  createBackendModule,
  coreServices,
} from '@backstage/backend-plugin-api';
import { apmeServiceRef } from '@ansible/backstage-apme-common';
import { createRouter } from './router';

export const catalogModuleApme = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'apme',
  register(reg) {
    reg.registerInit({
      deps: {
        logger: coreServices.logger,
        apmeService: apmeServiceRef,
        httpRouter: coreServices.httpRouter,
      },
      async init({ logger, apmeService, httpRouter }) {
        logger.info('Initializing APME catalog module');

        const router = await createRouter({
          apmeService,
          logger,
        });

        httpRouter.use(router);
        logger.info('APME routes registered at /api/catalog/apme/*');
      },
    });
  },
});
