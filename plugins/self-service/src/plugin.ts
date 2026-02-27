import {
  createComponentExtension,
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';
import { AAPApis, AapAuthApi } from './apis';

export const selfServicePlugin = createPlugin({
  id: 'self-service',
  apis: [AAPApis, AapAuthApi],
  routes: {
    root: rootRouteRef,
  },
});

export const SelfServicePage = selfServicePlugin.provide(
  createRoutableExtension({
    name: 'SelfServicePage',
    component: () => import('./components/RouteView').then(m => m.RouteView),
    mountPoint: rootRouteRef,
  }),
);

/**
 * EE Page component for mounting at /self-service/ee
 * Contains its own routing for the EE section.
 *
 * @public
 */
export const EEPage = selfServicePlugin.provide(
  createComponentExtension({
    name: 'EEPage',
    component: {
      lazy: () =>
        import('./components/ExecutionEnvironments').then(m => m.EEPage),
    },
  }),
);

/**
 * @public
 */
export const LocationListener = selfServicePlugin.provide(
  createComponentExtension({
    name: 'LocationListener',
    component: {
      lazy: () =>
        import('./components/LocationListener').then(m => m.LocationListener),
    },
  }),
);

/**
 * A sidebar item that checks EE Builder permissions before rendering.
 * Returns null if the user doesn't have permission, hiding the sidebar entry.
 *
 * @public
 */
export const EEBuilderSidebarItem = selfServicePlugin.provide(
  createComponentExtension({
    name: 'EEBuilderSidebarItem',
    component: {
      lazy: () =>
        import('./components/EEBuilderSidebarItem').then(
          m => m.EEBuilderSidebarItem,
        ),
    },
  }),
);
