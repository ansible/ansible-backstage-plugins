/**
 * Catalog backend module for RHAAP JIT user provisioning.
 * Provides the userProvisionerRef implementation that the auth plugin uses
 * to create User catalog entities on first login.
 *
 * @packageDocumentation
 */
import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';
import { catalogModuleRhaapUserProvisioner } from './module';

export { catalogModuleRhaapUserProvisioner };

/** Register the transitional AAP client factory alongside the user-provisioner module. */
export default createBackendFeatureLoader({
  loader: function* () {
    yield ansibleServiceFactory;
    yield catalogModuleRhaapUserProvisioner;
  },
});
