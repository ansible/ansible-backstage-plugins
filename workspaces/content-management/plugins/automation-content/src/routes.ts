import { createRouteRef } from '@backstage/core-plugin-api';
import {
  createExternalRouteRef,
  createRouteRef as createNativeRouteRef,
} from '@backstage/frontend-plugin-api';

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

/** Legacy Self Service paths retained while portal-scaffolder is retired in stages. */
export const selfServiceRootPath = '/self-service';
export const collectionsPagePath = `${selfServiceRootPath}/collections`;
export const gitRepositoriesPagePath = `${selfServiceRootPath}/repositories`;

export const eeRouteRef = createNativeRouteRef();

export const templatesRouteRef = createExternalRouteRef({
  defaultTarget: 'portal-scaffolder.root',
});
