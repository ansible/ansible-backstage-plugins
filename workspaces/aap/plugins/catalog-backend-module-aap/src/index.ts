import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';

import { catalogModuleAap } from './module';

export { catalogModuleAap };

/** Load the AAP catalog module; explicitly install @ansible/aap-backend. */
const catalogAapFeatureLoader = createBackendFeatureLoader({
  loader: function* () {
    yield catalogModuleAap;
  },
});

export default catalogAapFeatureLoader;
