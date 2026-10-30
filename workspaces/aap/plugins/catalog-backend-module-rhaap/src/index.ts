import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { createServiceFactory } from '@backstage/backend-plugin-api';
import { userProvisionerRef, UserProvisioner } from '@ansible/backstage-rhaap-common';
import { eeEntityLifecycleServiceFactory } from './eeEntityLifecycleService';
import { catalogModuleRhaap } from './module';
import { rhaapOrganizationServiceFactory } from './rhaapOrganizationResolver';

/***/
/**
 * The rhaap backend module for the catalog plugin.
 *
 * @packageDocumentation
 */

export { catalogModuleRhaap };
export * from './router';

export default createBackendFeatureLoader({
  loader: function* () {
    yield rhaapOrganizationServiceFactory;
    yield createServiceFactory({
      service: userProvisionerRef,
      deps: {},
      factory: () => new UserProvisioner(),
    });
    yield eeEntityLifecycleServiceFactory;
    yield catalogModuleRhaap;
  },
});
