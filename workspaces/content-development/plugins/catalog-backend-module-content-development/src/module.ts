import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { eeEntityProviderServiceRef } from '@ansible/content-development-common';
import { createEERegistrationLock } from './EERegistrationLock';

export const catalogModuleContentDevelopment = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'content-development',
  register(reg) {
    reg.registerInit({
      deps: {
        catalogProcessing: catalogProcessingExtensionPoint,
        provider: eeEntityProviderServiceRef,
        database: coreServices.database,
      },
      async init({ catalogProcessing, provider, database }) {
        provider.initializeRegistrationLock(createEERegistrationLock(database));
        catalogProcessing.addEntityProvider(provider);
      },
    });
  },
});
