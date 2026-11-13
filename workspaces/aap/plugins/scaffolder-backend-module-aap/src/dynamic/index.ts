import { BackendDynamicPluginInstaller } from '@backstage/backend-dynamic-feature-service';

import { scaffolderModuleAap } from '../module';

export const dynamicPluginInstaller: BackendDynamicPluginInstaller = {
  kind: 'new',
  install: () => scaffolderModuleAap,
};
