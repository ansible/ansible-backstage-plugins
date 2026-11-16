import { eeEntityLifecycleServiceFactory } from '@ansible/content-development-common';
import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { scaffolderModuleContentDevelopment } from './module';

export * from './actions';
export { scaffolderModuleContentDevelopment };

export default createBackendFeatureLoader({
  loader: function* loader() {
    yield eeEntityLifecycleServiceFactory;
    yield scaffolderModuleContentDevelopment;
  },
});
