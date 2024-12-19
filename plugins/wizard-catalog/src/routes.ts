import { createRouteRef } from '@backstage/core-plugin-api';

export const wizardCatalogRouteRef = createRouteRef({
  id: 'wizard-catalog',
});

export const createTaskRouteRef = createRouteRef({
  id: 'create-task',
  params: ['namespace', 'name'],
});

export const runTaskRouteRef = createRouteRef({
  id: 'run-task',
});
