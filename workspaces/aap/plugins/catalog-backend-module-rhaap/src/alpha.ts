import {
  createBackendFeatureLoader,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import {
  userProvisionerRef,
  UserProvisioner,
} from '@ansible/backstage-rhaap-common';
import { catalogModuleRhaap } from './module';
import { rhaapOrganizationServiceFactory } from './rhaapOrganizationResolver';

/** Dynamic deployments need the same organization adapter as the development backend. */
export default createBackendFeatureLoader({
  loader: async function* () {
    yield rhaapOrganizationServiceFactory;
    // Embedded packages carry distinct service-ref objects; explicitly register
    // the factory by service ID so auth and catalog share one provisioner.
    yield createServiceFactory({
      service: userProvisionerRef,
      deps: {},
      factory: () => new UserProvisioner(),
    });
    yield catalogModuleRhaap;
  },
});
