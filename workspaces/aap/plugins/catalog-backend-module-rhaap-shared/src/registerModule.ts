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
import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { signalsServiceRef } from '@backstage/plugin-signals-node';

import { ansibleServiceRef } from '@ansible/backstage-rhaap-common';
import { ansiblePermissions } from '@ansible/backstage-rhaap-common/permissions';
import { createRouter } from './router';
import {
  catalogModelExtensionPoint,
  catalogProcessingExtensionPoint as alphaCatalogProcessing,
} from '@backstage/plugin-catalog-node/alpha';
import * as catalogNode from '@backstage/plugin-catalog-node';
import { AAPJobTemplateProvider } from './providers/AAPJobTemplateProvider';
import { AAPEntityProvider } from './providers/AAPEntityProvider';
import { makeValidator } from '@backstage/catalog-model';
import { EEEntityProvider } from './providers/EEEntityProvider';
import { PAHCollectionProvider } from './providers/PAHCollectionProvider';
import { CatalogClient } from '@backstage/catalog-client';
import { AnsibleGitContentsProvider } from './providers/AnsibleGitContentsProvider';
import {
  catalogProvidersConfigRootForSlice,
  runWithCatalogProvidersConfigRootAsync,
} from './catalogProviderConfig';
import {
  assertCatalogModuleSliceAllowed,
  type CatalogModuleSlice,
} from './sliceGuard';

const catalogProcessingExtensionPoint: typeof alphaCatalogProcessing =
  Reflect.get(catalogNode, 'catalogProcessingExtensionPoint') ??
  alphaCatalogProcessing;

function includesAap(slice: CatalogModuleSlice): boolean {
  return slice === 'all' || slice === 'aap';
}

function includesContent(slice: CatalogModuleSlice): boolean {
  return slice === 'all' || slice === 'content';
}

function includesEe(slice: CatalogModuleSlice): boolean {
  return slice === 'all' || slice === 'ee';
}

export interface CreateCatalogModuleOptions {
  moduleId: string;
  slice: CatalogModuleSlice;
  deprecated?: boolean;
}

export function createCatalogModule(options: CreateCatalogModuleOptions) {
  const { moduleId, slice, deprecated } = options;

  return createBackendModule({
    pluginId: 'catalog',
    moduleId,
    register(reg) {
      reg.registerInit({
        deps: {
          logger: coreServices.logger,
          catalogProcessing: catalogProcessingExtensionPoint,
          catalogModel: catalogModelExtensionPoint,
          config: coreServices.rootConfig,
          scheduler: coreServices.scheduler,
          ansibleService: ansibleServiceRef,
          httpRouter: coreServices.httpRouter,
          discovery: coreServices.discovery,
          auth: coreServices.auth,
          permissionsRegistry: coreServices.permissionsRegistry,
          permissionsApi: coreServices.permissions,
          httpAuth: coreServices.httpAuth,
          userInfo: coreServices.userInfo,
          signals: signalsServiceRef,
        },
        async init({
          logger,
          config,
          scheduler,
          ansibleService,
          httpRouter,
          catalogProcessing,
          catalogModel,
          permissionsRegistry,
          permissionsApi,
          httpAuth,
          userInfo,
          discovery,
          auth,
          signals,
        }) {
          assertCatalogModuleSliceAllowed(moduleId, slice);

          if (deprecated) {
            logger.warn(
              '[catalog-backend-module-rhaap] This module is deprecated. ' +
                'Migrate to catalog-backend-module-aap, catalog-backend-module-interim-content, ' +
                'and the portal-scaffolder EE catalog module per AAP-98845.',
            );
          }

          permissionsRegistry.addPermissions(ansiblePermissions);
          catalogModel.setFieldValidators(
            makeValidator({
              isValidEntityName: (value: string) => {
                return (
                  typeof value === 'string' &&
                  value.length >= 1 &&
                  value.length <= 63 &&
                  /^[\w@+.-]+$/i.test(value)
                );
              },
            }),
          );

          await runWithCatalogProvidersConfigRootAsync(
            catalogProvidersConfigRootForSlice(slice),
            async () => {
          const aapEntityProvider = includesAap(slice)
            ? AAPEntityProvider.fromConfig(config, ansibleService, {
                logger,
                scheduler,
              })
            : [];
          const jobTemplateProvider = includesAap(slice)
            ? AAPJobTemplateProvider.fromConfig(config, ansibleService, {
                logger,
                scheduler,
              })
            : [];
          const eeEntityProvider = includesEe(slice)
            ? new EEEntityProvider(logger)
            : undefined;
          const pahCollectionProviders: PAHCollectionProvider[] =
            includesContent(slice)
              ? PAHCollectionProvider.fromConfig(config, ansibleService, {
                  logger,
                  scheduler,
                })
              : [];
          const ansibleGitContentsProviders = includesContent(slice)
            ? await AnsibleGitContentsProvider.fromConfig(config, {
                logger,
                scheduler,
              })
            : [];

          if (includesContent(slice)) {
            logger.info(
              `[catalog-module-${moduleId}]: Created ${ansibleGitContentsProviders.length} Ansible Git Contents provider(s)`,
            );
          }

          for (const p of aapEntityProvider) {
            p.setSignals(signals);
          }
          for (const p of jobTemplateProvider) {
            p.setSignals(signals);
          }

          const entityProviders = [
            ...aapEntityProvider,
            ...jobTemplateProvider,
            ...(eeEntityProvider ? [eeEntityProvider] : []),
            ...pahCollectionProviders,
            ...ansibleGitContentsProviders,
          ];
          if (entityProviders.length > 0) {
            catalogProcessing.addEntityProvider(...entityProviders);
          }

          const catalogClient = new CatalogClient({ discoveryApi: discovery });

          const externalAccessConfig = config
            .getOptionalConfig('backend')
            ?.getOptionalConfig('auth')
            ?.getOptionalConfigArray('externalAccess');
          const allowedExternalAccessSubjects: string[] = [];
          if (externalAccessConfig) {
            for (const entry of externalAccessConfig) {
              const subject = entry.getOptionalString('options.subject');
              if (subject) allowedExternalAccessSubjects.push(subject);
            }
          }

          httpRouter.use(
            (await createRouter({
              slice,
              logger,
              config,
              scheduler,
              aapEntityProvider: aapEntityProvider[0],
              jobTemplateProvider: jobTemplateProvider[0],
              eeEntityProvider,
              pahCollectionProviders,
              httpAuth,
              userInfo,
              auth,
              catalogClient,
              permissions: permissionsApi,
              ansibleGitContentsProviders,
              allowedExternalAccessSubjects:
                allowedExternalAccessSubjects.length > 0
                  ? allowedExternalAccessSubjects
                  : undefined,
            })) as any,
          );
            },
          );
        },
      });
    },
  });
}
