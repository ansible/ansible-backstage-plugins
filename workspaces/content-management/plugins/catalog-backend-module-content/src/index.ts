import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';

import { contentCatalogRegistration } from './contentCatalogRegistration';
import { catalogModuleContent } from './module';

export { catalogModuleContent, contentCatalogRegistration };

/**
 * Content slice does not own `ansibleServiceFactory`.
 * `catalog-backend-module-aap` is the transitional factory owner for AAP-only
 * and full split deployments.
 */
const catalogContentFeatureLoader = createBackendFeatureLoader({
  loader: function* () {
    yield catalogModuleContent;
  },
});

export default catalogContentFeatureLoader;
