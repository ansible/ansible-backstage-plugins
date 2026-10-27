export const PORTAL_SCAFFOLDER_ROUTE_IDS = {
  root: 'self-service',
  ee: 'self-service/ee',
  collections: 'self-service/collections',
  gitRepositories: 'self-service/repositories',
  templates: 'self-service/templates',
  history: 'self-service/history',
  catalogImport: 'self-service/catalog-import',
  selectedTemplate: 'self-service/selected-template',
  createTask: 'self-service/task',
} as const;

export const PORTAL_SCAFFOLDER_ROUTE_PATHS = {
  catalogImport: '/catalog-import',
  selectedTemplate: '/create/templates/:namespace/:templateName',
  createTask: '/create/tasks/:taskId',
} as const;
