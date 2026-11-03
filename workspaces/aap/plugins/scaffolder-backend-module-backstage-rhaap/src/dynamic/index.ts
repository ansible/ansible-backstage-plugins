import { BackendDynamicPluginInstaller } from '@backstage/backend-dynamic-feature-service';

import scaffolderBackendModule from '..';

export const dynamicPluginInstaller: BackendDynamicPluginInstaller = {
  kind: 'new',
  install: () => scaffolderBackendModule,
};
