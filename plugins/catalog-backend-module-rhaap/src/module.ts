import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';

import { ansibleServiceRef } from '@ansible/backstage-rhaap-common';
import { ansiblePermissions } from '@ansible/backstage-rhaap-common/permissions';
import { createRouter } from './router';
import {
  catalogModelExtensionPoint,
  catalogProcessingExtensionPoint,
} from '@backstage/plugin-catalog-node/alpha';
import { AAPJobTemplateProvider } from './providers/AAPJobTemplateProvider';
import { AAPEntityProvider } from './providers/AAPEntityProvider';
import { makeValidator } from '@backstage/catalog-model';
import { EEEntityProvider } from './providers/EEEntityProvider';
import { PAHCollectionProvider } from './providers/PAHCollectionProvider';
import { CatalogClient } from '@backstage/catalog-client';
import { AnsibleGitContentsProvider } from './providers/AnsibleGitContentsProvider';

export const catalogModuleRhaap = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'rhaap',
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
      }) {
        permissionsRegistry.addPermissions(ansiblePermissions);
        catalogModel.setFieldValidators(
          makeValidator({
            isValidEntityName: (value: string) => {
              return (
                typeof value === 'string' &&
                value.length >= 1 &&
                value.length <= 63 &&
                /^[\w@+._-]+$/i.test(value)
              );
            },
          }),
        );
        const aapEntityProvider = AAPEntityProvider.fromConfig(
          config,
          ansibleService,
          {
            logger,
            scheduler,
          },
        );
        const eeEntityProvider = new EEEntityProvider(logger);
        const jobTemplateProvider = AAPJobTemplateProvider.fromConfig(
          config,
          ansibleService,
          {
            logger,
            scheduler,
          },
        );
        const pahCollectionProviders: PAHCollectionProvider[] =
          PAHCollectionProvider.fromConfig(config, ansibleService, {
            logger,
            scheduler,
          });
        const ansibleGitContentsProviders =
          await AnsibleGitContentsProvider.fromConfig(config, {
            logger,
            scheduler,
          });
        // log providers since there can be multiple providers for collections
        logger.info(
          `[catalog-module-rhaap]: Created ${ansibleGitContentsProviders.length} Ansible Git Contents provider(s)`,
        );

        catalogProcessing.addEntityProvider(
          aapEntityProvider,
          jobTemplateProvider,
          eeEntityProvider,
          ...pahCollectionProviders,
          ansibleGitContentsProviders,
        );

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
            logger,
            config,
            aapEntityProvider: aapEntityProvider[0],
            jobTemplateProvider: jobTemplateProvider[0],
            eeEntityProvider: eeEntityProvider,
            pahCollectionProviders: pahCollectionProviders,
            httpAuth: httpAuth,
            userInfo: userInfo,
            auth: auth,
            catalogClient: catalogClient,
            permissions: permissionsApi,
            ansibleGitContentsProviders,
            allowedExternalAccessSubjects:
              allowedExternalAccessSubjects.length > 0
                ? allowedExternalAccessSubjects
                : undefined,
          })) as any,
        );
      },
    });
  },
});
