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
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import {
  apmeServiceRef,
  isApmeEnabled,
  getApmeConfig,
  resolveScanTargetVersion,
} from '@ansible/backstage-apme-common';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node/alpha';
import {
  ANSIBLE_SETTINGS_CAPABILITIES,
  ansibleSettingsEditPermission,
  ansibleSettingsViewPermission,
  type AnsibleSettingsCapability,
} from '@ansible/backstage-rhaap-common/permissions';
import {
  ansibleSettingsResourceRef,
  settingsPermissionRules,
} from '@ansible/backstage-rhaap-common/permissionRules';
import { createRouter } from './router';
import { registerApmeCatalogSyncTasks } from './apmeCatalogSyncScheduler';
import { ApmePortalSettingsStore } from './apmePortalSettingsStore';
import { registerPortalGalaxyServersSync } from './portalGalaxyServersSync';
import { ApmeLearnedDepsEntityProvider } from './providers/ApmeLearnedDepsEntityProvider';

function isAnsibleSettingsCapability(
  ref: string,
): ref is AnsibleSettingsCapability {
  return (ANSIBLE_SETTINGS_CAPABILITIES as readonly string[]).includes(ref);
}

export const catalogModuleApme = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'apme',
  register(reg) {
    reg.registerInit({
      deps: {
        logger: coreServices.logger,
        rootConfig: coreServices.rootConfig,
        apmeService: apmeServiceRef,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        scheduler: coreServices.scheduler,
        discovery: coreServices.discovery,
        auth: coreServices.auth,
        catalogProcessing: catalogProcessingExtensionPoint,
        permissionsRegistry: coreServices.permissionsRegistry,
        permissions: coreServices.permissions,
      },
      async init({
        logger,
        rootConfig,
        apmeService,
        httpRouter,
        httpAuth,
        scheduler,
        discovery,
        auth,
        catalogProcessing,
        permissionsRegistry,
        permissions,
      }) {
        if (!isApmeEnabled(rootConfig)) {
          logger.info('APME is disabled; skipping catalog module registration');
          return;
        }

        permissionsRegistry.addResourceType({
          resourceRef: ansibleSettingsResourceRef,
          permissions: [
            ansibleSettingsEditPermission,
            ansibleSettingsViewPermission,
          ],
          rules: settingsPermissionRules,
          getResources: async resourceRefs =>
            resourceRefs.map(ref =>
              isAnsibleSettingsCapability(ref)
                ? { capability: ref }
                : undefined,
            ),
        });

        logger.info('Initializing APME catalog module');

        const configSnapshot = getApmeConfig(rootConfig);
        const portalSettingsStore = new ApmePortalSettingsStore(
          configSnapshot.portalSettingsPath,
        );
        logger.info(
          `APME portal settings store at ${portalSettingsStore.path}`,
        );

        const resolveScanVersion = async (projectId: string) => {
          const store = await portalSettingsStore.read();
          return resolveScanTargetVersion({
            projectId,
            store,
            configTargetAnsibleCoreVersion:
              configSnapshot.targetAnsibleCoreVersion,
          });
        };

        const router = await createRouter({
          apmeService,
          logger,
          httpAuth,
          rootConfig,
          portalSettingsStore,
          permissions,
        });

        // Mounted on the catalog plugin stack — never apply global body parsers
        // in createRouter (see jsonBody.ts / router regression test).
        httpRouter.use(router);
        logger.info('APME routes registered at /api/catalog/apme/*');

        const catalogClient = new CatalogClient({ discoveryApi: discovery });
        registerApmeCatalogSyncTasks({
          scheduler,
          catalogClient,
          auth,
          apmeService,
          rootConfig,
          logger,
          resolveScanVersion,
        });

        await registerPortalGalaxyServersSync({
          scheduler,
          apmeService,
          rootConfig,
          logger,
        });

        const learnedDepsProvider = new ApmeLearnedDepsEntityProvider({
          apmeService,
          catalogClient,
          auth,
          logger,
          rootConfig,
        });
        catalogProcessing.addEntityProvider(learnedDepsProvider);
        await learnedDepsProvider.schedule(scheduler);
      },
    });
  },
});
