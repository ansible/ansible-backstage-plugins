import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';
import { automationContentApiFactory } from './api';
import { rootRouteRef } from './routes';

export const automationContentPlugin = createPlugin({
  id: 'automation-content',
  routes: {
    root: rootRouteRef,
  },
  apis: [automationContentApiFactory],
});

/** Mounted by `dynamicRoutes` config — by default at /automation-content. */
export const AutomationContentPage = automationContentPlugin.provide(
  createRoutableExtension({
    name: 'AutomationContentPage',
    component: () =>
      import('./components/AutomationContentPage').then(
        m => m.AutomationContentPage,
      ),
    mountPoint: rootRouteRef,
  }),
);
