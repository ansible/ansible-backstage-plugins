import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'self-service',
});

export const eeRouteRef = createRouteRef({
  id: 'self-service/ee',
});

export const collectionsRouteRef = createRouteRef({
  id: 'self-service/collections',
});

export const gitRepositoriesRouteRef = createRouteRef({
  id: 'self-service/repositories',
});

export const catalogImportRouteRef = createSubRouteRef({
  id: 'self-service/catalog-import',
  parent: rootRouteRef,
  path: '/catalog-import',
});

export const selectedTemplateRouteRef = createSubRouteRef({
  id: 'self-service/selected-template',
  parent: rootRouteRef,
  path: '/create/templates/:namespace/:templateName',
});

export const createTaskRouteRef = createSubRouteRef({
  id: 'self-service/task',
  parent: rootRouteRef,
  path: '/create/tasks/:taskId',
});
