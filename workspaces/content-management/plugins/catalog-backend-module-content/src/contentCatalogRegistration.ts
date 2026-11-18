/*
 * Copyright 2026 The Ansible plugin Authors
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
import type {
  ContentCatalogProviderInitContext,
  ContentCatalogProviders,
  ContentCatalogRegistration,
} from '@ansible/backstage-rhaap-common/catalog';

import { PAHCollectionProvider } from './providers/PAHCollectionProvider';
import { AnsibleGitContentsProvider } from './providers/AnsibleGitContentsProvider';

export const contentCatalogRegistration: ContentCatalogRegistration = {
  async createProviders(
    ctx: ContentCatalogProviderInitContext,
  ): Promise<ContentCatalogProviders> {
    const { config, logger, scheduler, ansibleService } = ctx;
    const pahCollectionProviders = PAHCollectionProvider.fromConfig(
      config,
      ansibleService,
      {
        logger,
        scheduler,
      },
    );
    const ansibleGitContentsProviders =
      await AnsibleGitContentsProvider.fromConfig(config, {
        logger,
        scheduler,
      });

    logger.info(
      `[catalog-module-content]: Created ${ansibleGitContentsProviders.length} Ansible Git Contents provider(s)`,
    );

    return {
      pahCollectionProviders,
      ansibleGitContentsProviders,
    };
  },
};
