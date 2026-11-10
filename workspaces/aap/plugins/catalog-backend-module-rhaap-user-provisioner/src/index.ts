/**
 * Catalog backend module for RHAAP JIT user provisioning.
 * Provides the userProvisionerRef implementation that the auth plugin uses
 * to create User catalog entities on first login.
 *
 * @packageDocumentation
 */
import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { catalogModuleRhaapUserProvisioner } from './module';

export { catalogModuleRhaapUserProvisioner };

/** Load the provisioner module; the catalog loader or host provides the AAP service. */
export default createBackendFeatureLoader({
  loader: function* () {
    yield catalogModuleRhaapUserProvisioner;
  },
});
