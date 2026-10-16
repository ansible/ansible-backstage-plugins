import { BackendDynamicPluginInstaller } from '@backstage/backend-dynamic-feature-service';

import { scaffolderModuleAnsible } from '../module';

export const dynamicPluginInstaller: BackendDynamicPluginInstaller = {
  kind: 'new',
  install: () => scaffolderModuleAnsible,
};
