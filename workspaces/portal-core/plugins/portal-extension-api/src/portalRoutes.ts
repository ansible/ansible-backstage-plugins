import { createExternalRouteRef } from '@backstage/frontend-plugin-api';

/** Shared host route for opening the Portal templates experience. */
export const portalTemplatesRouteRef = createExternalRouteRef({
  defaultTarget: 'portal-scaffolder.root',
});
