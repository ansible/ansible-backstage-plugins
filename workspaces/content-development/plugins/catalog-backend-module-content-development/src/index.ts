import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { eeEntityProviderServiceFactory } from './eeEntityProviderService';
import { catalogModuleContentDevelopment } from './module';

export { catalogModuleContentDevelopment };

export default createBackendFeatureLoader({
  loader: function* loader() {
    yield eeEntityProviderServiceFactory;
    yield catalogModuleContentDevelopment;
  },
});
