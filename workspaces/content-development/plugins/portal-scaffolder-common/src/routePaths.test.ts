import { describe, expect, it } from '@jest/globals';
import { portalScaffolderRoutePaths } from './index';

describe('portal scaffolder route paths', () => {
  it('preserves the public page and sub-route path contract', () => {
    expect(portalScaffolderRoutePaths).toEqual({
      root: '/self-service',
      executionEnvironments: '/self-service/ee',
      catalogImport: '/catalog-import',
      selectedTemplate: '/create/templates/:namespace/:templateName',
      createTask: '/create/tasks/:taskId',
    });
  });
});
