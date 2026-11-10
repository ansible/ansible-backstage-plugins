/***/
/**
 * The rhaap backend module for the catalog plugin.
 *
 * @packageDocumentation
 */

import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';
import { catalogModuleRhaap } from './module';

export { catalogModuleRhaap };
export * from './router';

/** The catalog loader owns transitional AAP service registration for dynamic installs. */
export default createBackendFeatureLoader({
  loader: function* () {
    yield ansibleServiceFactory;
    yield catalogModuleRhaap;
  },
});
