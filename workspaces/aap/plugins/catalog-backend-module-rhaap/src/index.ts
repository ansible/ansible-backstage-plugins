import {
  createBackendFeatureLoader,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import { userProvisionerRef, UserProvisioner } from '@ansible/aap-node';
import {
  createRouter as createSharedRouter,
  type CatalogModuleSlice,
} from '@ansible/backstage-rhaap-common/catalog';
import { catalogModuleRhaap } from './module';
import { rhaapOrganizationServiceFactory } from './rhaapOrganizationResolver';

/**
 * The rhaap backend module for the catalog plugin.
 *
 * @packageDocumentation
 */

export { catalogModuleRhaap };
export { createCatalogModule } from '@ansible/backstage-rhaap-common/catalog';

/** Backward-compatible wrapper: defaults `slice` to `'all'` for legacy callers. */
export function createRouter(
  options: Omit<Parameters<typeof createSharedRouter>[0], 'slice'> & {
    slice?: CatalogModuleSlice;
  },
): Promise<import('express').Router> {
  return createSharedRouter({
    ...options,
    slice: options.slice ?? 'all',
  });
}

/** Install @ansible/aap-backend explicitly; this loader keeps the catalog and JIT adapters. */
const catalogFeatureLoader = createBackendFeatureLoader({
  loader: function* () {
    yield rhaapOrganizationServiceFactory;
    yield createServiceFactory({
      service: userProvisionerRef,
      deps: {},
      factory: () => new UserProvisioner(),
    });
    yield catalogModuleRhaap;
  },
});

export default catalogFeatureLoader;
