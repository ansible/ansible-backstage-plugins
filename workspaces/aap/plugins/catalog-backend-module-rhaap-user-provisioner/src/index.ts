/**
 * Catalog backend module for RHAAP JIT user provisioning.
 * Provides the userProvisionerRef implementation that the auth plugin uses
 * to create User catalog entities on first login.
 *
 * @packageDocumentation
 */
export { catalogModuleRhaapUserProvisioner as default } from './module';
