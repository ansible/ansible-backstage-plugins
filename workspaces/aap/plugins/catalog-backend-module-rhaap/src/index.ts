/***/
/**
 * The rhaap backend module for the catalog plugin.
 *
 * @packageDocumentation
 */

export { catalogModuleRhaap as default } from './module';
import {
  createCatalogModule,
  createRouter as createSharedRouter,
  type CatalogModuleSlice,
} from '@ansible/backstage-plugin-catalog-backend-module-rhaap-shared';

export { createCatalogModule };

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
