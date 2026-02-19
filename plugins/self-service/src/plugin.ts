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
 * Custom logout button that revokes the AAP OAuth token,
 * ends the AAP browser session, and signs out of Backstage.
 *
 * @public
 */
export const AAPLogoutButton = selfServicePlugin.provide(
  createComponentExtension({
    name: 'AAPLogoutButton',
    component: {
      lazy: () =>
        import('./components/AAPLogoutButton').then(m => m.AAPLogoutButton),
    },
  }),
);
