import { BackendDynamicPluginInstaller } from '@backstage/backend-dynamic-feature-service';

import { scaffolderModuleContentDevelopment } from '../module';

export const dynamicPluginInstaller: BackendDynamicPluginInstaller = {
  kind: 'new',
  install: () => scaffolderModuleContentDevelopment,
};
