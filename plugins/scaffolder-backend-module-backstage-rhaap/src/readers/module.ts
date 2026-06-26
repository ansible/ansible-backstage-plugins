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
  coreServices,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import { urlReaderFactoriesServiceRef } from '@backstage/backend-defaults/urlReader';
import { IntegrationAwareFetchReader } from './IntegrationAwareFetchReader';

/**
 * A service factory that provides the IntegrationAwareFetchReader
 * to the URL reader service. This allows the backend to automatically
 * read from any host configured in SCM integrations (GitHub, GitLab,
 * Bitbucket, Azure DevOps) without requiring manual entries in
 * `backend.reading.allow`.
 *
 * @public
 */
export const integrationAwareUrlReaderFactory = createServiceFactory({
  service: urlReaderFactoriesServiceRef,
  deps: {
    logger: coreServices.logger,
  },
  async factory({ logger }) {
    logger.info(
      '[urlReaderIntegrationModule] Registering IntegrationAwareFetchReader factory',
    );
    return IntegrationAwareFetchReader.factory;
  },
});

/**
 * Backend module that registers the IntegrationAwareFetchReader.
 *
 * This module should be added to the backend to enable automatic
 * URL reading from all configured SCM integration hosts.
 *
 * @example
 * ```ts
 * // In packages/backend/src/index.ts
 * backend.add(import('@ansible/plugin-scaffolder-backend-module-backstage-rhaap').then(m => m.urlReaderIntegrationModule));
 * ```
 *
 * @public
 */
export const urlReaderIntegrationModule = integrationAwareUrlReaderFactory;
