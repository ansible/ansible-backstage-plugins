import {
  configApiRef,
  createApiFactory,
  createPlugin,
  createRoutableExtension,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { AutomationContentClient, automationContentApiRef } from './api';
import { rootRouteRef } from './routes';

export const automationContentPlugin = createPlugin({
  id: 'automation-content',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: automationContentApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        configApi: configApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new AutomationContentClient({ discoveryApi, fetchApi }),
    }),
  ],
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
