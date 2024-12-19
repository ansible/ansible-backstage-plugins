import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import {
  wizardCatalogRouteRef,
  createTaskRouteRef,
  runTaskRouteRef,
} from './routes';

export const wizardCatalogPlugin = createPlugin({
  id: 'wizard-catalog',
  routes: {
    wizardCatalog: wizardCatalogRouteRef,
  },
});

export const WizardCatalogPage = wizardCatalogPlugin.provide(
  createRoutableExtension({
    name: 'WizardCatalogPage',
    component: () => import('./components/RouteView').then(m => m.RouteView),
    mountPoint: wizardCatalogRouteRef,
  }),
);

export const CreateTaskPage = wizardCatalogPlugin.provide(
  createRoutableExtension({
    name: 'CreateTaskPage',
    component: () => import('./components/CreateTask').then(m => m.CreateTask),
    mountPoint: createTaskRouteRef,
  }),
);

export const RunTaskPage = wizardCatalogPlugin.provide(
  createRoutableExtension({
    name: 'RunTaskPage',
    component: () => import('./components/RunTask').then(m => m.RunTask),
    mountPoint: runTaskRouteRef,
  }),
);
