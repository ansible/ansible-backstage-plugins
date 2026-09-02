import {
  gitReposCache,
  markGitReposRegistrationRefreshPending,
  consumeGitReposPriorTotal,
  refreshGitReposAfterRegistration,
  resetGitReposRegistrationRefreshPending,
  UNKNOWN_GIT_REPOS_PRIOR_TOTAL,
} from './gitReposCache';

const gitRepoEntities = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: `repo-${index}` },
    spec: { type: 'git-repository' },
  }));

describe('markGitReposRegistrationRefreshPending', () => {
  beforeEach(() => {
    gitReposCache.clear();
    resetGitReposRegistrationRefreshPending();
  });

  it('stores unknown baseline sentinel when cache is cold', () => {
    markGitReposRegistrationRefreshPending();

    expect(consumeGitReposPriorTotal()).toBe(UNKNOWN_GIT_REPOS_PRIOR_TOTAL);
  });

  it('stores catalog totalItems for partially loaded large caches', async () => {
    const catalogApi = {
      queryEntities: jest.fn().mockResolvedValue({
        items: gitRepoEntities(50),
        totalItems: 100,
      }),
    };

    await gitReposCache.startLoading(catalogApi as any);
    markGitReposRegistrationRefreshPending();

    expect(consumeGitReposPriorTotal()).toBe(100);
  });
});

describe('refreshGitReposAfterRegistration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    gitReposCache.clear();
    resetGitReposRegistrationRefreshPending();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries until catalog total exceeds the pre-registration baseline', async () => {
    const catalogApi = {
      queryEntities: jest
        .fn()
        .mockResolvedValueOnce({
          items: gitRepoEntities(5),
          totalItems: 5,
        })
        .mockResolvedValueOnce({
          items: gitRepoEntities(5),
          totalItems: 5,
        })
        .mockResolvedValueOnce({
          items: gitRepoEntities(6),
          totalItems: 6,
        }),
    };

    const refreshPromise = refreshGitReposAfterRegistration(
      catalogApi as any,
      5,
    );

    await jest.runAllTimersAsync();
    await refreshPromise;

    expect(catalogApi.queryEntities).toHaveBeenCalledTimes(3);
    expect(gitReposCache.getState()?.totalServerItems).toBe(6);
  });

  it('retries until count increases when baseline was unknown (cold cache)', async () => {
    const catalogApi = {
      queryEntities: jest
        .fn()
        .mockResolvedValueOnce({
          items: gitRepoEntities(5),
          totalItems: 5,
        })
        .mockResolvedValueOnce({
          items: gitRepoEntities(5),
          totalItems: 5,
        })
        .mockResolvedValueOnce({
          items: gitRepoEntities(6),
          totalItems: 6,
        }),
    };

    const refreshPromise = refreshGitReposAfterRegistration(
      catalogApi as any,
      UNKNOWN_GIT_REPOS_PRIOR_TOTAL,
    );

    await jest.runAllTimersAsync();
    await refreshPromise;

    expect(catalogApi.queryEntities).toHaveBeenCalledTimes(3);
    expect(gitReposCache.getState()?.totalServerItems).toBe(6);
  });

  it('succeeds on first fetch when known baseline is zero and catalog has new repo', async () => {
    const catalogApi = {
      queryEntities: jest.fn().mockResolvedValue({
        items: gitRepoEntities(1),
        totalItems: 1,
      }),
    };

    await refreshGitReposAfterRegistration(catalogApi as any, 0);

    expect(catalogApi.queryEntities).toHaveBeenCalledTimes(1);
    expect(gitReposCache.getState()?.totalServerItems).toBe(1);
  });

  it('retries when known baseline is zero and indexing is still pending', async () => {
    const catalogApi = {
      queryEntities: jest
        .fn()
        .mockResolvedValueOnce({
          items: gitRepoEntities(0),
          totalItems: 0,
        })
        .mockResolvedValueOnce({
          items: gitRepoEntities(1),
          totalItems: 1,
        }),
    };

    const refreshPromise = refreshGitReposAfterRegistration(
      catalogApi as any,
      0,
    );

    await jest.runAllTimersAsync();
    await refreshPromise;

    expect(catalogApi.queryEntities).toHaveBeenCalledTimes(2);
    expect(gitReposCache.getState()?.totalServerItems).toBe(1);
  });

  it('uses catalog totalItems (not loaded page size) for large catalogs', async () => {
    const catalogApi = {
      queryEntities: jest
        .fn()
        .mockResolvedValueOnce({
          items: gitRepoEntities(100),
          totalItems: 100,
        })
        .mockResolvedValueOnce({
          items: gitRepoEntities(100),
          totalItems: 100,
        })
        .mockResolvedValueOnce({
          items: gitRepoEntities(101),
          totalItems: 101,
        }),
    };

    const refreshPromise = refreshGitReposAfterRegistration(
      catalogApi as any,
      100,
    );

    await jest.runAllTimersAsync();
    await refreshPromise;

    expect(catalogApi.queryEntities).toHaveBeenCalledTimes(3);
    expect(gitReposCache.getState()?.totalServerItems).toBe(101);
  });

  it('retries for large catalogs when cold cache baseline was unknown', async () => {
    const catalogApi = {
      queryEntities: jest
        .fn()
        .mockResolvedValueOnce({
          items: gitRepoEntities(100),
          totalItems: 100,
        })
        .mockResolvedValueOnce({
          items: gitRepoEntities(100),
          totalItems: 100,
        })
        .mockResolvedValueOnce({
          items: gitRepoEntities(101),
          totalItems: 101,
        }),
    };

    const refreshPromise = refreshGitReposAfterRegistration(
      catalogApi as any,
      UNKNOWN_GIT_REPOS_PRIOR_TOTAL,
    );

    await jest.runAllTimersAsync();
    await refreshPromise;

    expect(catalogApi.queryEntities).toHaveBeenCalledTimes(3);
    expect(gitReposCache.getState()?.totalServerItems).toBe(101);
  });
});
