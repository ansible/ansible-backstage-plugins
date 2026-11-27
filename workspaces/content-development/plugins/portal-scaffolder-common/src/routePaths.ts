/**
 * Portal scaffolder page and sub-route paths shared across packages.
 * Route refs and their IDs remain owned by the frontend plugin.
 */
export const portalScaffolderRoutePaths = {
  root: '/self-service',
  executionEnvironments: '/self-service/ee',
  catalogImport: '/catalog-import',
  selectedTemplate: '/create/templates/:namespace/:templateName',
  createTask: '/create/tasks/:taskId',
} as const;
