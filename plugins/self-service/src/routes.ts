import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';

/** Public URL prefix for all self-service routes (matches NFS PageBlueprint paths). */
export const SELF_SERVICE_ROOT_PATH = '/self-service';

export const rootRouteRef = createRouteRef({
  id: 'self-service',
});

// NFS per-page mounts do not bind the legacy root ref; useSelfServiceRootLink() falls back.
(rootRouteRef as { optional?: boolean }).optional = true;

export const eeRouteRef = createRouteRef({
  id: 'self-service/ee',
});

export const collectionsRouteRef = createRouteRef({
  id: 'self-service/collections',
});

export const gitRepositoriesRouteRef = createRouteRef({
  id: 'self-service/repositories',
});

export const templatesRouteRef = createRouteRef({
  id: 'self-service/templates',
});

export const historyRouteRef = createRouteRef({
  id: 'self-service/history',
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
