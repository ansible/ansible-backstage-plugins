import {
  PORTAL_SCAFFOLDER_ROUTE_IDS,
  PORTAL_SCAFFOLDER_ROUTE_PATHS,
} from './routes';

describe('portal-scaffolder route contracts', () => {
  it('preserves the existing route IDs', () => {
    expect(PORTAL_SCAFFOLDER_ROUTE_IDS).toEqual({
      root: 'self-service',
      ee: 'self-service/ee',
      collections: 'self-service/collections',
      gitRepositories: 'self-service/repositories',
      templates: 'self-service/templates',
      history: 'self-service/history',
      catalogImport: 'self-service/catalog-import',
      selectedTemplate: 'self-service/selected-template',
      createTask: 'self-service/task',
    });
  });

  it('preserves the existing sub-route paths', () => {
    expect(PORTAL_SCAFFOLDER_ROUTE_PATHS).toEqual({
      catalogImport: '/catalog-import',
      selectedTemplate: '/create/templates/:namespace/:templateName',
      createTask: '/create/tasks/:taskId',
    });
  });
});
