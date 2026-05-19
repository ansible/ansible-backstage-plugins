import { Entity } from '@backstage/catalog-model';
import { CatalogApi } from '@backstage/plugin-catalog-react';
import { PaginatedEntityCache } from './PaginatedEntityCache';
import { BaseCacheState, CacheConfig } from './types';

interface TestState extends BaseCacheState {
  tagSet: string[];
}

const mockEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test-entity',
    uid: 'uid-1',
    tags: ['test-tag'],
  },
  spec: { type: 'test-type' },
};

function makeEntity(uid: string): Entity {
  return {
    ...mockEntity,
    metadata: { ...mockEntity.metadata, uid, name: `entity-${uid}` },
  };
}

const testConfig: CacheConfig<TestState, string[]> = {
  entityFilter: { kind: 'Component', 'spec.type': 'test-type' },
  extractFilters: (entities: Entity[]) => {
    const tags = new Set<string>();
    entities.forEach(e => e.metadata.tags?.forEach(t => tags.add(t)));
    return Array.from(tags);
  },
  buildState: (base, filters, _prev) => ({
    ...base,
    tagSet: filters,
  }),
  createEmptyState: () => ({
    entities: [],
    totalServerItems: 0,
    loadedOffset: 0,
    isFullyLoaded: false,
    lastUpdated: Date.now(),
    error: null,
    tagSet: [],
  }),
};

function createCache(): PaginatedEntityCache<TestState, string[]> {
  return new PaginatedEntityCache<TestState, string[]>(testConfig);
}

const createMockCatalogApi = (
  overrides: Partial<CatalogApi> = {},
): CatalogApi =>
  ({
    queryEntities: jest.fn().mockResolvedValue({
      items: [mockEntity],
      totalItems: 1,
    }),
    ...overrides,
  }) as unknown as CatalogApi;

describe('PaginatedEntityCache', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initial state', () => {
    it('returns null from getState when empty', () => {
      const cache = createCache();
      expect(cache.getState()).toBeNull();
    });

    it('reports no data and not loading', () => {
      const cache = createCache();
      expect(cache.hasData()).toBe(false);
      expect(cache.isLoading()).toBe(false);
      expect(cache.isFullyLoaded()).toBe(false);
    });
  });

  describe('initial load', () => {
    it('populates state and notifies listeners', async () => {
      const cache = createCache();
      const listener = jest.fn();
      cache.subscribe(listener);

      const mockApi = createMockCatalogApi();
      await cache.startLoading(mockApi);

      expect(listener).toHaveBeenCalled();
      const state = cache.getState();
      expect(state?.entities).toHaveLength(1);
      expect(state?.entities[0]).toEqual(mockEntity);
      expect(state?.totalServerItems).toBe(1);
      expect(state?.isFullyLoaded).toBe(true);
      expect(state?.error).toBeNull();
    });

    it('passes orderFields in queryEntities call', async () => {
      const cache = createCache();
      const mockApi = createMockCatalogApi();
      await cache.startLoading(mockApi);

      expect(mockApi.queryEntities).toHaveBeenCalledWith(
        expect.objectContaining({
          orderFields: [{ field: 'metadata.uid', order: 'asc' }],
        }),
      );
    });

    it('sets error state when initial load fails', async () => {
      const cache = createCache();
      const mockApi = createMockCatalogApi({
        queryEntities: jest.fn().mockRejectedValue(new Error('Network error')),
      });

      await cache.startLoading(mockApi);

      const state = cache.getState();
      expect(state?.error).toBe('Network error');
      expect(state?.entities).toHaveLength(0);
    });
  });

  describe('background loading', () => {
    it('appends pages correctly across multiple fetches', async () => {
      const cache = createCache();
      const page1 = Array.from({ length: 50 }, (_, i) => makeEntity(`p1-${i}`));
      const page2 = Array.from({ length: 50 }, (_, i) => makeEntity(`p2-${i}`));

      const mockApi = createMockCatalogApi({
        queryEntities: jest
          .fn()
          .mockResolvedValueOnce({ items: page1, totalItems: 100 })
          .mockResolvedValueOnce({ items: page2, totalItems: 100 })
          .mockResolvedValue({ items: [], totalItems: 100 }),
      });

      await cache.startLoading(mockApi);

      const state = cache.getState();
      expect(state?.entities).toHaveLength(100);
      expect(state?.isFullyLoaded).toBe(true);
      expect(state?.loadedOffset).toBe(100);
    });

    it('passes orderFields in background fetch calls', async () => {
      const cache = createCache();
      const page1 = Array.from({ length: 50 }, (_, i) => makeEntity(`p1-${i}`));

      const mockApi = createMockCatalogApi({
        queryEntities: jest
          .fn()
          .mockResolvedValueOnce({ items: page1, totalItems: 100 })
          .mockResolvedValueOnce({ items: [], totalItems: 100 }),
      });

      await cache.startLoading(mockApi);

      const calls = (mockApi.queryEntities as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(1);
      calls.forEach(([params]) => {
        expect(params.orderFields).toEqual([
          { field: 'metadata.uid', order: 'asc' },
        ]);
      });
    });

    it('preserves partial data when background fetch errors', async () => {
      const cache = createCache();
      const page1 = Array.from({ length: 50 }, (_, i) => makeEntity(`p1-${i}`));

      const mockApi = createMockCatalogApi({
        queryEntities: jest
          .fn()
          .mockResolvedValueOnce({ items: page1, totalItems: 200 })
          .mockRejectedValueOnce(new Error('Background fetch failed')),
      });

      await cache.startLoading(mockApi);

      const state = cache.getState();
      expect(state?.entities).toHaveLength(50);
      expect(state?.error).toBe('Background fetch failed');
      expect(state?.isFullyLoaded).toBe(false);
    });
  });

  describe('epoch invalidation', () => {
    it('aborts stale fetches when invalidateFetchedData is called', async () => {
      const cache = createCache();
      const listener = jest.fn();
      cache.subscribe(listener);

      let resolveFirst!: (value: unknown) => void;
      const firstLoadPromise = new Promise(resolve => {
        resolveFirst = resolve;
      });

      let callCount = 0;
      const mockApi = createMockCatalogApi({
        queryEntities: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return firstLoadPromise;
          }
          return Promise.resolve({
            items: [makeEntity('fresh-1')],
            totalItems: 1,
          });
        }),
      });

      const loadPromise = cache.startLoading(mockApi);

      cache.invalidateFetchedData();

      resolveFirst({ items: [makeEntity('stale-1')], totalItems: 1 });
      await loadPromise;
      await new Promise(resolve => setTimeout(resolve, 50));

      const state = cache.getState();
      expect(state?.entities[0].metadata.uid).toBe('fresh-1');
    });

    it('invalidateFetchedData reloads without dropping listeners', async () => {
      const cache = createCache();
      const listener = jest.fn();
      cache.subscribe(listener);

      const mockApi = createMockCatalogApi();
      await cache.startLoading(mockApi);

      const callsBefore = listener.mock.calls.length;
      expect(callsBefore).toBeGreaterThan(0);

      cache.invalidateFetchedData();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(listener.mock.calls.length).toBeGreaterThan(callsBefore);

      const emptyCall = listener.mock.calls.find(
        ([state]: [TestState]) =>
          state.entities.length === 0 && state.totalServerItems === 0,
      );
      expect(emptyCall).toBeUndefined();
    });
  });

  describe('TTL expiry', () => {
    it('returns null from getState when TTL has expired', async () => {
      const cache = createCache();
      const mockApi = createMockCatalogApi();
      await cache.startLoading(mockApi);

      expect(cache.getState()).not.toBeNull();

      const originalDateNow = Date.now;
      Date.now = jest.fn(() => originalDateNow() + 6 * 60 * 1000);

      expect(cache.getState()).toBeNull();

      Date.now = originalDateNow;
    });
  });

  describe('concurrent loading', () => {
    it('does not duplicate fetches when startLoading is called concurrently', async () => {
      const cache = createCache();
      const mockApi = createMockCatalogApi({
        queryEntities: jest
          .fn()
          .mockImplementation(
            () =>
              new Promise(resolve =>
                setTimeout(
                  () => resolve({ items: [mockEntity], totalItems: 1 }),
                  50,
                ),
              ),
          ),
      });

      const load1 = cache.startLoading(mockApi);
      const load2 = cache.startLoading(mockApi);

      await Promise.all([load1, load2]);

      expect(mockApi.queryEntities).toHaveBeenCalledTimes(1);
    });

    it('does not reload when already fully loaded', async () => {
      const cache = createCache();
      const mockApi = createMockCatalogApi();

      await cache.startLoading(mockApi);
      expect(mockApi.queryEntities).toHaveBeenCalledTimes(1);

      await cache.startLoading(mockApi);
      expect(mockApi.queryEntities).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('resets all state and removes listeners', async () => {
      const cache = createCache();
      const listener = jest.fn();
      cache.subscribe(listener);

      const mockApi = createMockCatalogApi();
      await cache.startLoading(mockApi);

      listener.mockClear();
      cache.clear();

      expect(cache.getState()).toBeNull();
      expect(cache.hasData()).toBe(false);
      expect(cache.isFullyLoaded()).toBe(false);
      expect(cache.isLoading()).toBe(false);

      await cache.startLoading(mockApi);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
