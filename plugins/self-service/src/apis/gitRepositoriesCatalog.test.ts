import { gitReposCache } from '../components/GitRepositories/gitReposCache';
import { gitRepositoriesCatalogApiFactory } from './gitRepositoriesCatalog';

jest.mock('../components/GitRepositories/gitReposCache', () => ({
  gitReposCache: {
    invalidateFetchedData: jest.fn(),
  },
}));

describe('gitRepositoriesCatalogApiFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invalidates git repos cache when invalidateCatalogCache is called', () => {
    const api = gitRepositoriesCatalogApiFactory.factory({});
    api.invalidateCatalogCache();
    expect(gitReposCache.invalidateFetchedData).toHaveBeenCalled();
  });
});
