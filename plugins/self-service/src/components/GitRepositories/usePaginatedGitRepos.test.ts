import { renderHook, act } from '@testing-library/react';
import { Entity } from '@backstage/catalog-model';

const mockState = {
  allEntities: [] as Entity[],
  initialLoading: false,
  error: null as string | null,
};

const mockInvalidate = jest.fn();

jest.mock('./gitReposCache', () => ({
  gitReposCache: {
    invalidateFetchedData: (...a: any[]) => mockInvalidate(...a),
  },
}));

jest.mock('./scmUtils', () => ({
  getRepoHost: (entity: Entity) =>
    entity.metadata?.annotations?.['ansible.io/scm-host'] || '',
}));

jest.mock('../common/cache', () => {
  const actual = jest.requireActual('../common/cache');
  return {
    ...actual,
    useCacheSubscription: () => ({
      allEntities: mockState.allEntities,
      initialLoading: mockState.initialLoading,
      loadingMore: false,
      error: mockState.error,
      isMountedRef: { current: true },
    }),
  };
});

import { usePaginatedGitRepos } from './usePaginatedGitRepos';

const makeEntity = (name: string, host = 'github.com'): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name,
    namespace: 'default',
    annotations: { 'ansible.io/scm-host': host },
  },
});

const mockCatalogApi = {} as any;

describe('usePaginatedGitRepos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.allEntities = [];
    mockState.initialLoading = false;
    mockState.error = null;
  });

  it('returns empty entities when cache is empty', () => {
    const { result } = renderHook(() =>
      usePaginatedGitRepos({ catalogApi: mockCatalogApi }),
    );

    expect(result.current.entities).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it('returns all entities when no filter is applied', () => {
    mockState.allEntities = [makeEntity('repo-a'), makeEntity('repo-b')];

    const { result } = renderHook(() =>
      usePaginatedGitRepos({ catalogApi: mockCatalogApi }),
    );

    expect(result.current.totalCount).toBe(2);
  });

  it('sorts entities by name alphabetically', () => {
    mockState.allEntities = [makeEntity('zebra'), makeEntity('alpha')];

    const { result } = renderHook(() =>
      usePaginatedGitRepos({ catalogApi: mockCatalogApi }),
    );

    expect(result.current.entities[0].metadata.name).toBe('alpha');
    expect(result.current.entities[1].metadata.name).toBe('zebra');
  });

  it('filters by source when sourceFilter is set', () => {
    mockState.allEntities = [
      makeEntity('gh-repo', 'github.com'),
      makeEntity('gl-repo', 'gitlab.com'),
    ];

    const { result } = renderHook(() =>
      usePaginatedGitRepos({ catalogApi: mockCatalogApi }),
    );

    act(() => {
      result.current.setSourceFilter('github.com');
    });

    expect(result.current.totalCount).toBe(1);
    expect(result.current.entities[0].metadata.name).toBe('gh-repo');
  });

  it('applies custom entityFilter', () => {
    mockState.allEntities = [
      makeEntity('include-me'),
      makeEntity('exclude-me'),
    ];

    const entityFilter = (entity: Entity) =>
      entity.metadata.name === 'include-me';

    const { result } = renderHook(() =>
      usePaginatedGitRepos({ catalogApi: mockCatalogApi, entityFilter }),
    );

    expect(result.current.totalCount).toBe(1);
    expect(result.current.entities[0].metadata.name).toBe('include-me');
  });

  it('exposes allEntities (unfiltered)', () => {
    mockState.allEntities = [makeEntity('a'), makeEntity('b')];

    const { result } = renderHook(() =>
      usePaginatedGitRepos({ catalogApi: mockCatalogApi }),
    );

    expect(result.current.allEntities).toHaveLength(2);
  });

  it('initialLoading reflects cache state', () => {
    mockState.initialLoading = true;

    const { result } = renderHook(() =>
      usePaginatedGitRepos({ catalogApi: mockCatalogApi }),
    );

    expect(result.current.initialLoading).toBe(true);
  });

  it('error reflects cache state', () => {
    mockState.error = 'fetch failed';

    const { result } = renderHook(() =>
      usePaginatedGitRepos({ catalogApi: mockCatalogApi }),
    );

    expect(result.current.error).toBe('fetch failed');
  });

  it('refresh invalidates cache and resets sources', () => {
    const { result } = renderHook(() =>
      usePaginatedGitRepos({ catalogApi: mockCatalogApi }),
    );

    act(() => {
      result.current.refresh();
    });

    expect(mockInvalidate).toHaveBeenCalled();
    expect(result.current.allSources).toEqual([{ value: 'All', label: 'All' }]);
  });

  it('sorts by title when metadata.title is present', () => {
    mockState.allEntities = [
      {
        ...makeEntity('aaa-name'),
        metadata: {
          ...makeEntity('aaa-name').metadata,
          title: 'Zebra Title',
        },
      },
      {
        ...makeEntity('zzz-name'),
        metadata: {
          ...makeEntity('zzz-name').metadata,
          title: 'Alpha Title',
        },
      },
    ];

    const { result } = renderHook(() =>
      usePaginatedGitRepos({ catalogApi: mockCatalogApi }),
    );

    expect(result.current.entities[0].metadata.title).toBe('Alpha Title');
    expect(result.current.entities[1].metadata.title).toBe('Zebra Title');
  });

  it('matches search text across NFC-equivalent Unicode forms', () => {
    mockState.allEntities = [
      {
        ...makeEntity('cafe-repo'),
        metadata: {
          ...makeEntity('cafe-repo').metadata,
          title: 'Café',
        },
      },
    ];

    const { result } = renderHook(() =>
      usePaginatedGitRepos({ catalogApi: mockCatalogApi }),
    );

    act(() => {
      result.current.setSearchQuery('Cafe\u0301'.normalize('NFD'));
    });

    expect(result.current.totalCount).toBe(1);
    expect(result.current.entities[0].metadata.title).toBe('Café');
  });

  it('falls back to empty string when both title and name are missing', () => {
    mockState.allEntities = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: undefined as any,
          namespace: 'default',
          annotations: { 'ansible.io/scm-host': 'github.com' },
        },
      },
      makeEntity('has-name'),
    ];

    const { result } = renderHook(() =>
      usePaginatedGitRepos({ catalogApi: mockCatalogApi }),
    );

    expect(result.current.totalCount).toBe(2);
  });

  it('default sourceFilter is All', () => {
    const { result } = renderHook(() =>
      usePaginatedGitRepos({ catalogApi: mockCatalogApi }),
    );

    expect(result.current.sourceFilter).toBe('All');
  });
});
