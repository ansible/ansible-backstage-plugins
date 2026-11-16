import { BackendDynamicPluginInstaller } from '@backstage/backend-dynamic-feature-service';
import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { eeEntityLifecycleServiceFactory } from '@ansible/content-development-common';

import { scaffolderModuleContentDevelopment } from '../module';

export const dynamicPluginInstaller: BackendDynamicPluginInstaller = {
  kind: 'new',
  install: () =>
    createBackendFeatureLoader({
      loader: function* () {
        yield eeEntityLifecycleServiceFactory;
        yield scaffolderModuleContentDevelopment;
      },
    }),
};
