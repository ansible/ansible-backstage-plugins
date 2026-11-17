import { eeEntityLifecycleServiceFactory } from '@ansible/content-development-common';
import { BackendDynamicPluginInstaller } from '@backstage/backend-dynamic-feature-service';
import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { scaffolderModuleContentDevelopment } from '../module';

export const dynamicPluginInstaller: BackendDynamicPluginInstaller = {
  kind: 'new',
  install: () =>
    createBackendFeatureLoader({
      loader: function* loader() {
        yield eeEntityLifecycleServiceFactory;
        yield scaffolderModuleContentDevelopment;
      },
    }),
};
