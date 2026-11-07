import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';
import { automationContentApiFactory } from './apis';
import { eeRouteRef, rootRouteRef } from './routes';

export const automationContentPlugin = createPlugin({
  id: 'automation-content',
  routes: {
    root: rootRouteRef,
  },
  apis: [automationContentApiFactory],
});

/** Legacy catalog mount point also registers execution environment navigation. */
export const AutomationContentEEPage = automationContentPlugin.provide(
  createRoutableExtension({
    name: 'AutomationContentEEPage',
    component: () =>
      import('./components/ExecutionEnvironments/EERoutesPage').then(
        m => m.EERoutesPage,
      ),
    mountPoint: eeRouteRef,
  }),
);

/** Mounted by `dynamicRoutes` config — by default at /automation-content. */
export const AutomationContentPage = automationContentPlugin.provide(
  createRoutableExtension({
    name: 'AutomationContentPage',
    component: () =>
      import('./components/AutomationContentRoutes').then(
        m => m.AutomationContentRoutes,
      ),
    mountPoint: rootRouteRef,
  }),
);
