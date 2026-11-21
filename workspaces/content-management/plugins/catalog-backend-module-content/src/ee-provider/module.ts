import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { portalCatalogEntityProvidersServiceRef } from '@ansible/portal-plugin-node';
import { createEERegistrationLock } from './EERegistrationLock';
import { EEEntityProvider } from './providers/EEEntityProvider';

export const EE_CATALOG_PROVIDER_ID =
  'content-management.execution-environments';

export const catalogModuleEEProvider = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'content-ee-provider',
  register(reg) {
    reg.registerInit({
      deps: {
        catalogProcessing: catalogProcessingExtensionPoint,
        catalogEntityProviders: portalCatalogEntityProvidersServiceRef,
        database: coreServices.database,
        logger: coreServices.rootLogger,
      },
      async init({
        catalogProcessing,
        catalogEntityProviders,
        database,
        logger,
      }) {
        const provider = new EEEntityProvider(logger);
        const registrationLock = createEERegistrationLock(database);
        await registrationLock.initialize();
        provider.initializeRegistrationLock(registrationLock);

        catalogProcessing.addEntityProvider(provider);
        catalogEntityProviders.register({
          id: EE_CATALOG_PROVIDER_ID,
          provider,
        });
      },
    });
  },
});
