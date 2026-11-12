import { createBackendModule } from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { eeEntityProviderServiceRef } from '@ansible/content-development-common';

export const catalogModuleContentDevelopment = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'content-development',
  register(reg) {
    reg.registerInit({
      deps: {
        catalogProcessing: catalogProcessingExtensionPoint,
        provider: eeEntityProviderServiceRef,
      },
      async init({ catalogProcessing, provider }) {
        catalogProcessing.addEntityProvider(provider);
      },
    });
  },
});
