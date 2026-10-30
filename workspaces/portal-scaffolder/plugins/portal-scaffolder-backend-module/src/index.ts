import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { eeEntityLifecycleServiceFactory } from './eeEntityLifecycleAdapter';
import { scaffolderModulePortalScaffolder } from './module';

export * from './actions';
export { scaffolderModulePortalScaffolder } from './module';

export default createBackendFeatureLoader({
  loader: function* () {
    yield eeEntityLifecycleServiceFactory;
    yield scaffolderModulePortalScaffolder;
  },
});
