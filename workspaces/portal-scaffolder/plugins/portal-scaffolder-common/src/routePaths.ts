/**
 * Portal scaffolder page and sub-route paths shared across packages.
 * Route refs and their IDs remain owned by the frontend plugin.
 */
export const portalScaffolderRoutePaths = {
  root: '/self-service',
  collections: '/self-service/collections',
  executionEnvironments: '/self-service/ee',
  gitRepositories: '/self-service/repositories',
  history: '/self-service/create/tasks',
  catalogImport: '/catalog-import',
  selectedTemplate: '/create/templates/:namespace/:templateName',
  createTask: '/create/tasks/:taskId',
} as const;
