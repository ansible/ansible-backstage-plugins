import { describe, expect, it } from '@jest/globals';
import { portalScaffolderRoutePaths } from './index';

describe('portal scaffolder route paths', () => {
  it('preserves the public page and sub-route path contract', () => {
    expect(portalScaffolderRoutePaths).toEqual({
      root: '/self-service',
      collections: '/self-service/collections',
      executionEnvironments: '/self-service/ee',
      gitRepositories: '/self-service/repositories',
      history: '/self-service/create/tasks',
      catalogImport: '/catalog-import',
      selectedTemplate: '/create/templates/:namespace/:templateName',
      createTask: '/create/tasks/:taskId',
    });
  });
});
