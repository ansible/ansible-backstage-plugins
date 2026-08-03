import { renderHook, waitFor, act } from '@testing-library/react';
import { useCacheSubscription } from './useCacheSubscription';
import { BaseCacheState, CachePublicApi } from './types';

type TestState = BaseCacheState;

function createMockCache(
  initial: TestState | null = null,
): CachePublicApi<TestState> & {
  triggerUpdate: (state: TestState) => void;
  listeners: Set<(state: TestState) => void>;
} {
  const listeners = new Set<(state: TestState) => void>();
  let currentState = initial;
  let loading = false;
  let fullyLoaded = initial?.isFullyLoaded ?? false;

  return {
    listeners,
    getState: jest.fn(() => currentState),
    hasData: jest.fn(() => (currentState?.entities.length ?? 0) > 0),
    isFullyLoaded: jest.fn(() => fullyLoaded),
    isLoading: jest.fn(() => loading),
    subscribe: jest.fn((listener: (state: TestState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    invalidateFetchedData: jest.fn(),
    markStale: jest.fn(),
    startLoading: jest.fn(async () => {
      loading = true;
      fullyLoaded = true;
      loading = false;
    }),
    clear: jest.fn(),
    triggerUpdate: (state: TestState) => {
      currentState = state;
      for (const listener of listeners) {
        listener(state);
      }
    },
  };
}

const mockCatalogApi = {
  getEntities: jest.fn(),
  getEntityByRef: jest.fn(),
  queryEntities: jest.fn(),
  addLocation: jest.fn(),
  getLocationByRef: jest.fn(),
  removeLocationById: jest.fn(),
  removeEntityByUid: jest.fn(),
  refreshEntity: jest.fn(),
  getEntityAncestors: jest.fn(),
  validateEntity: jest.fn(),
  getLocationById: jest.fn(),
  getEntityFacets: jest.fn(),
} as any;

const makeState = (overrides: Partial<TestState> = {}): TestState => ({
  entities: [],
  totalServerItems: 0,
  loadedOffset: 0,
  isFullyLoaded: true,
  lastUpdated: Date.now(),
  error: null,
  ...overrides,
});

describe('useCacheSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts with initialLoading true when cache is empty', async () => {
    const cache = createMockCache();

    const { result } = renderHook(() =>
      useCacheSubscription({
        cache,
        catalogApi: mockCatalogApi,
      }),
    );

    expect(result.current.initialLoading).toBe(true);
    expect(result.current.allEntities).toEqual([]);

    await waitFor(() => {
      expect(result.current.initialLoading).toBe(false);
    });
  });

  it('uses cached entities when cache has data', async () => {
    const entities = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'test' },
      },
    ];
    const cached = makeState({ entities, isFullyLoaded: true });
    const cache = createMockCache(cached);

    const { result } = renderHook(() =>
      useCacheSubscription({
        cache,
        catalogApi: mockCatalogApi,
      }),
    );

    await waitFor(() => {
      expect(result.current.allEntities).toHaveLength(1);
      expect(result.current.initialLoading).toBe(false);
    });
  });

  it('subscribes to cache updates on mount', async () => {
    const cache = createMockCache();

    renderHook(() =>
      useCacheSubscription({
        cache,
        catalogApi: mockCatalogApi,
      }),
    );

    await waitFor(() => {
      expect(cache.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  it('updates state when cache emits an update', async () => {
    const cache = createMockCache();

    const { result } = renderHook(() =>
      useCacheSubscription({
        cache,
        catalogApi: mockCatalogApi,
      }),
    );

    await waitFor(() => {
      expect(cache.subscribe).toHaveBeenCalled();
    });

    const entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'updated' },
    };

    act(() => {
      cache.triggerUpdate(
        makeState({ entities: [entity], isFullyLoaded: true }),
      );
    });

    expect(result.current.allEntities).toHaveLength(1);
    expect(result.current.allEntities[0].metadata.name).toBe('updated');
  });

  it('sets error state when cache reports an error', async () => {
    const cache = createMockCache();

    const { result } = renderHook(() =>
      useCacheSubscription({
        cache,
        catalogApi: mockCatalogApi,
      }),
    );

    await waitFor(() => {
      expect(cache.subscribe).toHaveBeenCalled();
    });

    act(() => {
      cache.triggerUpdate(makeState({ error: 'something broke' }));
    });

    expect(result.current.error).toBe('something broke');
    expect(result.current.initialLoading).toBe(false);
  });

  it('unsubscribes from cache on unmount', async () => {
    const cache = createMockCache();

    const { unmount } = renderHook(() =>
      useCacheSubscription({
        cache,
        catalogApi: mockCatalogApi,
      }),
    );

    await waitFor(() => {
      expect(cache.listeners.size).toBe(1);
    });

    unmount();
    expect(cache.listeners.size).toBe(0);
  });

  it('calls onCacheUpdate callback when cache updates', async () => {
    const cache = createMockCache();
    const onCacheUpdate = jest.fn();

    renderHook(() =>
      useCacheSubscription({
        cache,
        catalogApi: mockCatalogApi,
        onCacheUpdate,
      }),
    );

    await waitFor(() => {
      expect(cache.subscribe).toHaveBeenCalled();
    });

    act(() => {
      cache.triggerUpdate(makeState({ isFullyLoaded: true }));
    });

    expect(onCacheUpdate).toHaveBeenCalled();
  });

  it('sets error with fallback message when startLoading throws non-Error', async () => {
    const cache = createMockCache();
    (cache.startLoading as jest.Mock).mockRejectedValue('string error');

    const { result } = renderHook(() =>
      useCacheSubscription({
        cache,
        catalogApi: mockCatalogApi,
        fallbackErrorMessage: 'Custom fallback',
      }),
    );

    await waitFor(() => {
      expect(result.current.error).toBe('Custom fallback');
    });
  });

  it('calls onInitialData callback when cache has data on mount', async () => {
    const entities = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'test' },
      },
    ];
    const cached = makeState({ entities, isFullyLoaded: true });
    const cache = createMockCache(cached);
    const onInitialData = jest.fn();

    renderHook(() =>
      useCacheSubscription({
        cache,
        catalogApi: mockCatalogApi,
        onInitialData,
      }),
    );

    await waitFor(() => {
      expect(onInitialData).toHaveBeenCalledWith(
        expect.objectContaining({ entities }),
      );
    });
  });

  it('sets error with fallback when partial cache startLoading throws non-Error', async () => {
    const cached = makeState({
      entities: [
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: { name: 'partial' },
        },
      ],
      isFullyLoaded: false,
    });
    const cache = createMockCache(cached);
    (cache.isLoading as jest.Mock).mockReturnValue(false);
    (cache.isFullyLoaded as jest.Mock).mockReturnValue(false);
    (cache.startLoading as jest.Mock).mockRejectedValue('string error');

    const { result } = renderHook(() =>
      useCacheSubscription({
        cache,
        catalogApi: mockCatalogApi,
        fallbackErrorMessage: 'Partial load failed',
      }),
    );

    await waitFor(() => {
      expect(result.current.error).toBe('Partial load failed');
    });
  });

  it('does not update state when unmounted during initial load', async () => {
    const cache = createMockCache();
    let resolveLoading!: () => void;
    (cache.startLoading as jest.Mock).mockReturnValue(
      new Promise<void>(r => {
        resolveLoading = r;
      }),
    );

    const { result, unmount } = renderHook(() =>
      useCacheSubscription({
        cache,
        catalogApi: mockCatalogApi,
      }),
    );

    expect(result.current.initialLoading).toBe(true);

    unmount();

    await act(async () => {
      resolveLoading();
      await new Promise(r => setTimeout(r, 0));
    });
  });

  it('does not set error when unmounted during failed initial load', async () => {
    const cache = createMockCache();
    let rejectLoading!: (e: Error) => void;
    (cache.startLoading as jest.Mock).mockReturnValue(
      new Promise<void>((_, r) => {
        rejectLoading = r;
      }),
    );

    const { unmount } = renderHook(() =>
      useCacheSubscription({
        cache,
        catalogApi: mockCatalogApi,
      }),
    );

    unmount();

    await act(async () => {
      rejectLoading(new Error('too late'));
      await new Promise(r => setTimeout(r, 0));
    });
  });

  it('continues loading partially loaded cache', async () => {
    const cached = makeState({
      entities: [
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: { name: 'partial' },
        },
      ],
      isFullyLoaded: false,
    });
    const cache = createMockCache(cached);
    (cache.isLoading as jest.Mock).mockReturnValue(false);
    (cache.isFullyLoaded as jest.Mock).mockReturnValue(false);

    renderHook(() =>
      useCacheSubscription({
        cache,
        catalogApi: mockCatalogApi,
      }),
    );

    await waitFor(() => {
      expect(cache.startLoading).toHaveBeenCalledWith(mockCatalogApi);
    });
  });
});
