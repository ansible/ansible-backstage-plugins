import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';

/**
 * The plugin's root route.
 *
 * No path is declared here on purpose. The concrete mount point comes from
 * `dynamicRoutes` configuration, so moving the plugin from /automation-content to
 * somewhere else is a config edit and never a code change.
 */
export const rootRouteRef = createRouteRef({
  id: 'automation-content',
});

/** Keep execution environment navigation independent of the host mount path. */
export const eeRouteRef = createRouteRef({
  id: 'automation-content/execution-environments',
});

/** Immutable artifact identity is URL-encoded as a single route parameter. */
export const eeDetailsRouteRef = createSubRouteRef({
  id: 'automation-content/execution-environments/details',
  parent: eeRouteRef,
  path: '/:ref',
});

/** Collections have their own catalog entry point for host navigation. */
export const collectionsRouteRef = createRouteRef({
  id: 'automation-content/collections',
});

/** Preserve the full entity identity when opening a collection directly. */
export const collectionDetailsRouteRef = createSubRouteRef({
  id: 'automation-content/collections/details',
  parent: collectionsRouteRef,
  path: '/:namespace/:name',
});
