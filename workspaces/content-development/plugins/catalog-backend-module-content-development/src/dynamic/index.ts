import { BackendDynamicPluginInstaller } from '@backstage/backend-dynamic-feature-service';
import featureLoader from '..';

export const dynamicPluginInstaller: BackendDynamicPluginInstaller = {
  kind: 'new',
  install: () => featureLoader,
};
