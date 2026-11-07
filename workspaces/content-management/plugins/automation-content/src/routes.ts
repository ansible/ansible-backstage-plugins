import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';

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
