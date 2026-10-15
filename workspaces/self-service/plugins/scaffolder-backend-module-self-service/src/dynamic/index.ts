import { BackendDynamicPluginInstaller } from '@backstage/backend-dynamic-feature-service';

import { scaffolderModuleSelfService } from '../module';

export const dynamicPluginInstaller: BackendDynamicPluginInstaller = {
  kind: 'new',
  install: () => scaffolderModuleSelfService,
};
