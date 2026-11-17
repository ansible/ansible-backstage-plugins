/***/
/**
 * The rhaap backend module for the catalog plugin.
 *
 * @packageDocumentation
 */

import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';
import {
  createCatalogModule,
  createRouter as createSharedRouter,
  type CatalogModuleSlice,
} from '@ansible/backstage-rhaap-common/catalog';
import { catalogModuleRhaap } from './module';

export { catalogModuleRhaap, createCatalogModule };

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

/** The catalog loader owns transitional AAP service registration for dynamic installs. */
const catalogFeatureLoader = createBackendFeatureLoader({
  loader: function* () {
    yield ansibleServiceFactory;
    yield catalogModuleRhaap;
  },
});

export default catalogFeatureLoader;
