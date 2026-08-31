/*
 * Copyright Red Hat
 */

import { DefaultGitRepositoriesCatalogApi } from './gitRepositoriesCatalog';

describe('DefaultGitRepositoriesCatalogApi', () => {
  it('invalidateCatalogCache is a no-op that does not throw', () => {
    const api = new DefaultGitRepositoriesCatalogApi();
    expect(() => api.invalidateCatalogCache()).not.toThrow();
  });
});
