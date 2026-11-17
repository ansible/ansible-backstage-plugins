import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';

import { catalogModuleAap } from './module';

export { catalogModuleAap };

/**
 * Transitional owner of `ansibleServiceFactory` for split catalog deployments.
 *
 * Minimal AAP-only and full AAP+content installs load this default entry so
 * `ansibleServiceRef` is registered without the deprecated rhaap shim.
 * JIT user-provisioner wiring lives in `./alpha`.
 */
const catalogAapFeatureLoader = createBackendFeatureLoader({
  loader: function* () {
    yield ansibleServiceFactory;
    yield catalogModuleAap;
  },
});

export default catalogAapFeatureLoader;
