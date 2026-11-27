import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';
import { portalScaffolderRoutePaths } from '@ansible/portal-scaffolder-common';

export const rootRouteRef = createRouteRef({
  id: 'self-service',
});

export const eeRouteRef = createRouteRef({
  id: 'self-service/ee',
});

export const templatesRouteRef = createRouteRef({
  id: 'self-service/templates',
});

/** Retained for dynamic-plugin manifest compatibility. */
export const historyRouteRef = createRouteRef({
  id: 'self-service/history',
});

export const catalogImportRouteRef = createSubRouteRef({
  id: 'self-service/catalog-import',
  parent: rootRouteRef,
  path: portalScaffolderRoutePaths.catalogImport,
});

export const selectedTemplateRouteRef = createSubRouteRef({
  id: 'self-service/selected-template',
  parent: rootRouteRef,
  path: portalScaffolderRoutePaths.selectedTemplate,
});

export const createTaskRouteRef = createSubRouteRef({
  id: 'self-service/task',
  parent: rootRouteRef,
  path: portalScaffolderRoutePaths.createTask,
});

/** Host scaffolder catalog filtered to execution environment templates. */
export const eeTemplateCatalogPath =
  '/create/templates?filters%5Bkind%5D=template&filters%5Btags%5D=execution-environment';
