import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';

import { catalogModuleContent } from './module';
import { catalogModuleEEProvider } from './ee-provider/module';

export { catalogModuleContent, catalogModuleEEProvider };
export { contentCatalogRegistration } from './contentCatalogRegistration';

/**
 * Content slice does not own `ansibleServiceFactory`.
 * `catalog-backend-module-aap` is the transitional factory owner for AAP-only
 * and full split deployments.
 */
const catalogContentFeatureLoader = createBackendFeatureLoader({
  loader: function* () {
    yield catalogModuleContent;
    yield catalogModuleEEProvider;
  },
});

export default catalogContentFeatureLoader;
