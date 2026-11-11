import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { eeEntityLifecycleServiceFactory } from './eeEntityLifecycleAdapter';
import { scaffolderModuleContentDevelopment } from './module';

export * from './actions';
export { scaffolderModuleContentDevelopment } from './module';

export default createBackendFeatureLoader({
  loader: function* () {
    yield eeEntityLifecycleServiceFactory;
    yield scaffolderModuleContentDevelopment;
  },
});
