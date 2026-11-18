import {
  createBackendFeatureLoader,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import { userProvisionerRef, UserProvisioner } from '@ansible/aap-node';
import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';

import { catalogModuleAap } from './module';

/**
 * Dynamic split deployments need the same JIT provisioner wiring as the
 * deprecated rhaap shim alpha entry. The user-provisioner module still
 * registers the create-user callback before first login.
 */
export default createBackendFeatureLoader({
  loader: function* () {
    yield ansibleServiceFactory;
    // Embedded packages carry distinct service-ref objects; explicitly
    // register the factory by service ID so auth and catalog share one
    // provisioner instance for JIT callback wiring.
    yield createServiceFactory({
      service: userProvisionerRef,
      deps: {},
      factory: () => new UserProvisioner(),
    });
    yield catalogModuleAap;
  },
});
