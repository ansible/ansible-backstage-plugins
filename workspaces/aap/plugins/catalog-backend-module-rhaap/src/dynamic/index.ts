import { BackendDynamicPluginInstaller } from '@backstage/backend-dynamic-feature-service';

import catalogModuleRhaap from '..';

export const dynamicPluginInstaller: BackendDynamicPluginInstaller = {
  kind: 'new',
  install: () => catalogModuleRhaap,
};
