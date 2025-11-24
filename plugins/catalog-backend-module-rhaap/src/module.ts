import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';

import { ansibleServiceRef } from '@ansible/backstage-rhaap-common';
import { createRouter } from './router';
import {
  catalogModelExtensionPoint,
  catalogProcessingExtensionPoint,
} from '@backstage/plugin-catalog-node/alpha';
import { AAPJobTemplateProvider } from './providers/AAPJobTemplateProvider';
import { AAPEntityProvider } from './providers/AAPEntityProvider';
import { makeValidator } from '@backstage/catalog-model';

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
      },
      async init({
        logger,
        config,
        scheduler,
        ansibleService,
        httpRouter,
        catalogProcessing,
        catalogModel,
      }) {
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
        const jobTemplateProvider = AAPJobTemplateProvider.fromConfig(
          config,
          ansibleService,
          {
            logger,
            scheduler,
          },
        );

        catalogProcessing.addEntityProvider(
          aapEntityProvider,
          jobTemplateProvider,
        );

        httpRouter.use(
          (await createRouter({
            logger,
            aapEntityProvider: aapEntityProvider[0],
            jobTemplateProvider: jobTemplateProvider[0],
          })) as any,
        );
      },
    });
  },
});
