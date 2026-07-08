import { BackendDynamicPluginInstaller } from '@backstage/backend-dynamic-feature-service';

import catalogModuleApme from '..';

export const dynamicPluginInstaller: BackendDynamicPluginInstaller = {
  kind: 'new',
  install: () => catalogModuleApme,
};
