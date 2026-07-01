import {
  createApiFactory,
  createPlugin,
  createRoutableExtension,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';
import { apmeApiRef } from './api/ApmeApi';
import { ApmeApiClient } from './api/ApmeApiClient';

export const apmePlugin = createPlugin({
  id: 'apme',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: apmeApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new ApmeApiClient({ discoveryApi, fetchApi }),
    }),
  ],
});

export const ApmePage = apmePlugin.provide(
  createRoutableExtension({
    name: 'ApmePage',
    component: () => import('./components/ApmePage').then(m => m.ApmePage),
    mountPoint: rootRouteRef,
  }),
);
