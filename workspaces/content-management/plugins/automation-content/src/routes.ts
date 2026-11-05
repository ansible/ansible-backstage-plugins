import { createRouteRef } from '@backstage/core-plugin-api';

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
