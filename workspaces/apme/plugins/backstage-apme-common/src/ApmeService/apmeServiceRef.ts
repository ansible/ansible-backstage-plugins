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
  createServiceRef,
  createServiceFactory,
  coreServices,
} from '@backstage/backend-plugin-api';
import { ApmeClient, IApmeService } from './ApmeClient';

export const apmeServiceRef = createServiceRef<IApmeService>({
  id: 'apme.client.service',
  scope: 'plugin',
  defaultFactory: async (
    service, // NOSONAR - async required by Backstage ServiceRef defaultFactory signature
  ) =>
    createServiceFactory({
      service,
      deps: {
        rootConfig: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async factory({ rootConfig, logger }) {
        // NOSONAR - async required by Backstage ServiceFactory signature
        logger.info('Creating APME client service');
        return new ApmeClient({ rootConfig, logger });
      },
    }),
});
