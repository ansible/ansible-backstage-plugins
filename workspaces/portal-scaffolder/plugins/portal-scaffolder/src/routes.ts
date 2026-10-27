import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';
import {
  PORTAL_SCAFFOLDER_ROUTE_IDS,
  PORTAL_SCAFFOLDER_ROUTE_PATHS,
} from '@ansible/portal-scaffolder-common';

export const rootRouteRef = createRouteRef({
  id: PORTAL_SCAFFOLDER_ROUTE_IDS.root,
});

export const eeRouteRef = createRouteRef({
  id: PORTAL_SCAFFOLDER_ROUTE_IDS.ee,
});

export const collectionsRouteRef = createRouteRef({
  id: PORTAL_SCAFFOLDER_ROUTE_IDS.collections,
});

export const gitRepositoriesRouteRef = createRouteRef({
  id: PORTAL_SCAFFOLDER_ROUTE_IDS.gitRepositories,
});

export const templatesRouteRef = createRouteRef({
  id: PORTAL_SCAFFOLDER_ROUTE_IDS.templates,
});

export const historyRouteRef = createRouteRef({
  id: PORTAL_SCAFFOLDER_ROUTE_IDS.history,
});

export const catalogImportRouteRef = createSubRouteRef({
  id: PORTAL_SCAFFOLDER_ROUTE_IDS.catalogImport,
  parent: rootRouteRef,
  path: PORTAL_SCAFFOLDER_ROUTE_PATHS.catalogImport,
});

export const selectedTemplateRouteRef = createSubRouteRef({
  id: PORTAL_SCAFFOLDER_ROUTE_IDS.selectedTemplate,
  parent: rootRouteRef,
  path: PORTAL_SCAFFOLDER_ROUTE_PATHS.selectedTemplate,
});

export const createTaskRouteRef = createSubRouteRef({
  id: PORTAL_SCAFFOLDER_ROUTE_IDS.createTask,
  parent: rootRouteRef,
  path: PORTAL_SCAFFOLDER_ROUTE_PATHS.createTask,
});
