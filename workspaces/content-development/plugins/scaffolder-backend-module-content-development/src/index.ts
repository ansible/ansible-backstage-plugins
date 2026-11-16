import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { eeEntityLifecycleServiceFactory } from '@ansible/content-development-common';
import { scaffolderModuleContentDevelopment } from './module';

export * from './actions';
export { scaffolderModuleContentDevelopment };

export default createBackendFeatureLoader({
  loader: function* () {
    yield eeEntityLifecycleServiceFactory;
    yield scaffolderModuleContentDevelopment;
  },
});
