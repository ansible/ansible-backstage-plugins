import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';
import { complianceApiFactory } from './api/complianceApiFactory';

export const compliancePlugin = createPlugin({
  id: 'compliance',
  routes: {
    root: rootRouteRef,
  },
  apis: [complianceApiFactory],
});

export const CompliancePage = compliancePlugin.provide(
  createRoutableExtension({
    name: 'CompliancePage',
    component: () =>
      import('./components/ComplianceRouter').then(m => m.ComplianceRouter),
    mountPoint: rootRouteRef,
  }),
);
