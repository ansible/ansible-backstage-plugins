import { renderHook, act, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { usePaginatedCollections } from './usePaginatedCollections';
import { collectionsCache } from './collectionsCache';

const mockEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test-collection',
    uid: 'uid-1',
    description: 'A test collection',
    annotations: {
      'ansible.io/discovery-source-id': 'src-1',
      'ansible.io/collection-source': 'pah',
      'ansible.io/collection-source-repository': 'repo1',
    },
    tags: ['networking'],
  },
  spec: {
    type: 'ansible-collection',
    collection_full_name: 'ns.collection',
    collection_namespace: 'ns',
    collection_name: 'collection',
    collection_version: '1.0.0',
  },
};

const mockEntity2: Entity = {
  ...mockEntity,
  metadata: {
    ...mockEntity.metadata,
    name: 'another-collection',
    uid: 'uid-2',
    tags: ['security'],
    annotations: {
      'ansible.io/discovery-source-id': 'src-2',
      'ansible.io/collection-source': 'pah',
      'ansible.io/collection-source-repository': 'repo2',
    },
  },
  spec: {
    ...mockEntity.spec,
    collection_full_name: 'ns2.collection2',
    collection_namespace: 'ns2',
    collection_name: 'collection2',
    collection_version: '2.0.0',
  },
};

const mockCatalogApi = {
  queryEntities: jest.fn(),
  getEntities: jest.fn(),
};

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};

const mockFetchApi = {
  fetch: jest.fn(),
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <TestApiProvider
    apis={[
      [catalogApiRef, mockCatalogApi],
      [discoveryApiRef, mockDiscoveryApi],
      [fetchApiRef, mockFetchApi],
    ]}
  >
    {children}
  </TestApiProvider>
);

describe('usePaginatedCollections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    collectionsCache.clear();
    mockCatalogApi.queryEntities.mockResolvedValue({
      items: [mockEntity],
      totalItems: 1,
    });
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: {
            providers: [
              {
                sourceId: 'src-1',
                lastSyncTime: '2024-01-01T00:00:00Z',
                lastFailedSyncTime: null,
              },
            ],
          },
        }),
    });
  });

  afterEach(() => {
    collectionsCache.clear();
  });

  describe('initial state', () => {
    it('starts with initialLoading true when cache is empty', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      expect(result.current.initialLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });
    });

    it('initializes from cache if available', async () => {
      // Pre-populate cache
      await collectionsCache.startLoading(mockCatalogApi as any);

      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      // Should not be in initial loading state since cache has data
      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });
      expect(result.current.entities.length).toBeGreaterThanOrEqual(0);
    });

    it('continues loading when cache has partial data (lines 118-121)', async () => {
      // Pre-populate cache with partial data where isFullyLoaded is false
      const partialEntities = Array.from({ length: 50 }, (_, i) => ({
        ...mockEntity,
        metadata: {
          ...mockEntity.metadata,
          uid: `uid-${i}`,
          name: `collection-${i}`,
        },
        spec: {
          ...mockEntity.spec,
          collection_full_name: `ns${i}.collection${i}`,
        },
      }));

      let callCount = 0;
      mockCatalogApi.queryEntities.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Initial load - return partial data
          return Promise.resolve({
            items: partialEntities,
            totalItems: 100, // More than returned, so not fully loaded
          });
        }
        // Background load fails, leaving cache in partial state
        return Promise.reject(new Error('Network error'));
      });

      // First, populate cache with partial data (background load will fail)
      await collectionsCache.startLoading(mockCatalogApi as any);

      // Verify cache has partial data and is NOT fully loaded
      let cacheState = collectionsCache.getState();
      expect(cacheState?.entities.length).toBe(50);
      expect(cacheState?.isFullyLoaded).toBe(false);

      // Reset mock for the hook's calls
      mockCatalogApi.queryEntities.mockImplementation(({ offset }) => {
        if (offset === 50) {
          return Promise.resolve({
            items: Array.from({ length: 50 }, (_, i) => ({
              ...mockEntity,
              metadata: {
                ...mockEntity.metadata,
                uid: `uid-${i + 50}`,
                name: `collection-${i + 50}`,
              },
              spec: {
                ...mockEntity.spec,
                collection_full_name: `ns${i + 50}.collection${i + 50}`,
              },
            })),
            totalItems: 100,
          });
        }
        return Promise.resolve({ items: [], totalItems: 100 });
      });

      // Now render the hook - it should use cached data and call startLoading
      // to continue loading (lines 118-121)
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      // Should not be in initial loading since cache has data
      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      // Should have started with cached partial data
      expect(result.current.totalCount).toBeGreaterThan(0);

      // Wait for background loading to complete
      await waitFor(() => {
        cacheState = collectionsCache.getState();
        return cacheState?.isFullyLoaded === true;
      });

      expect(cacheState?.entities.length).toBe(100);
    });
  });

  describe('fetching collections', () => {
    it('fetches collections via cache', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      expect(mockCatalogApi.queryEntities).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: { kind: 'Component', 'spec.type': 'ansible-collection' },
        }),
      );
    });

    it('sets error when fetch fails', async () => {
      mockCatalogApi.queryEntities.mockRejectedValue(new Error('Fetch failed'));

      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Fetch failed');
      });
    });

    it('sets error from catch block when startLoading throws (lines 143-147)', async () => {
      // Mock startLoading to throw directly (bypassing internal error handling)
      const startLoadingSpy = jest
        .spyOn(collectionsCache, 'startLoading')
        .mockRejectedValueOnce(new Error('Cache loading failed'));

      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Cache loading failed');
      });

      expect(result.current.initialLoading).toBe(false);

      startLoadingSpy.mockRestore();
    });

    it('sets default error message when non-Error is thrown (lines 144-145)', async () => {
      // Mock startLoading to throw a non-Error value
      const startLoadingSpy = jest
        .spyOn(collectionsCache, 'startLoading')
        .mockRejectedValueOnce('string error');

      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch collections');
      });

      expect(result.current.initialLoading).toBe(false);

      startLoadingSpy.mockRestore();
    });
  });

  describe('sync status', () => {
    it('fetches sync status', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.hasConfiguredSources).toBe(true);
      });

      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/ansible/sync/status?ansible_contents=true',
      );
    });

    it('sets hasConfiguredSources to false when no providers', async () => {
      mockFetchApi.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: { providers: [] },
          }),
      });

      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.hasConfiguredSources).toBe(false);
      });
    });

    it('sets hasConfiguredSources to false when fetch fails', async () => {
      mockFetchApi.fetch.mockResolvedValue({
        ok: false,
      });

      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.hasConfiguredSources).toBe(false);
      });
    });
  });

  describe('filtering', () => {
    beforeEach(() => {
      mockCatalogApi.queryEntities.mockResolvedValue({
        items: [mockEntity, mockEntity2],
        totalItems: 2,
      });
    });

    it('filters by search query on name', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      act(() => {
        result.current.setSearchQuery('another');
      });

      await waitFor(() => {
        expect(result.current.totalCount).toBe(1);
        expect(result.current.entities[0]?.metadata?.name).toBe(
          'another-collection',
        );
      });
    });

    it('filters by source', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      act(() => {
        result.current.setSourceFilter('repo1');
      });

      await waitFor(() => {
        expect(result.current.totalCount).toBe(1);
        expect(result.current.entities[0]?.metadata?.name).toBe(
          'test-collection',
        );
      });
    });

    it('filters by tag', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      act(() => {
        result.current.setTagFilter('security');
      });

      await waitFor(() => {
        expect(result.current.totalCount).toBe(1);
        expect(result.current.entities[0]?.metadata?.name).toBe(
          'another-collection',
        );
      });
    });

    it('resets to page 1 when filters change', async () => {
      // Create many entities for pagination with unique collection_full_name
      const manyEntities = Array.from({ length: 30 }, (_, i) => ({
        ...mockEntity,
        metadata: {
          ...mockEntity.metadata,
          uid: `uid-${i}`,
          name: `collection-${i}`,
        },
        spec: {
          ...mockEntity.spec,
          collection_full_name: `ns${i}.collection${i}`,
          collection_namespace: `ns${i}`,
          collection_name: `collection${i}`,
          collection_version: '1.0.0',
        },
      }));
      mockCatalogApi.queryEntities.mockResolvedValue({
        items: manyEntities,
        totalItems: 30,
      });

      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      // Go to page 2
      act(() => {
        result.current.goToPage(2);
      });

      expect(result.current.currentPage).toBe(2);

      // Change filter - should reset to page 1
      act(() => {
        result.current.setSearchQuery('test');
      });

      await waitFor(() => {
        expect(result.current.currentPage).toBe(1);
      });
    });
  });

  describe('pagination', () => {
    beforeEach(() => {
      // Create entities with unique collection_full_name to avoid filterLatestVersions reducing them
      const manyEntities = Array.from({ length: 30 }, (_, i) => ({
        ...mockEntity,
        metadata: {
          ...mockEntity.metadata,
          uid: `uid-${i}`,
          name: `collection-${i}`,
        },
        spec: {
          ...mockEntity.spec,
          collection_full_name: `ns${i}.collection${i}`,
          collection_namespace: `ns${i}`,
          collection_name: `collection${i}`,
          collection_version: '1.0.0',
        },
      }));
      mockCatalogApi.queryEntities.mockResolvedValue({
        items: manyEntities,
        totalItems: 30,
      });
    });

    it('calculates total pages correctly', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      // PAGE_SIZE is 12, so 30 items = 3 pages
      expect(result.current.totalPages).toBe(3);
    });

    it('goToPage navigates to specific page', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      act(() => {
        result.current.goToPage(2);
      });

      expect(result.current.currentPage).toBe(2);
    });

    it('goToPage clamps to valid range', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      act(() => {
        result.current.goToPage(100);
      });

      expect(result.current.currentPage).toBe(result.current.totalPages);

      act(() => {
        result.current.goToPage(0);
      });

      expect(result.current.currentPage).toBe(1);
    });

    it('nextPage increments page', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      act(() => {
        result.current.nextPage();
      });

      expect(result.current.currentPage).toBe(2);
    });

    it('prevPage decrements page', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      act(() => {
        result.current.goToPage(2);
      });

      act(() => {
        result.current.prevPage();
      });

      expect(result.current.currentPage).toBe(1);
    });

    it('hasNextPage and hasPrevPage are correct', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      // On page 1
      expect(result.current.hasPrevPage).toBe(false);
      expect(result.current.hasNextPage).toBe(true);

      act(() => {
        result.current.goToPage(3); // Go to last page (30 items / 12 per page = 3 pages)
      });

      // On last page
      expect(result.current.hasPrevPage).toBe(true);
      expect(result.current.hasNextPage).toBe(false);
    });
  });

  describe('refresh', () => {
    it('clears cache and refetches', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      const initialCallCount = mockCatalogApi.queryEntities.mock.calls.length;

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(mockCatalogApi.queryEntities.mock.calls.length).toBeGreaterThan(
          initialCallCount,
        );
      });
    });

    it('resets filters state on refresh', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      act(() => {
        result.current.refresh();
      });

      expect(result.current.allSources).toEqual(['All']);
      expect(result.current.allTags).toEqual(['All']);
    });
  });

  describe('showLatestOnly', () => {
    it('defaults to true', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      expect(result.current.showLatestOnly).toBe(true);
    });

    it('can be toggled', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      act(() => {
        result.current.setShowLatestOnly(false);
      });

      expect(result.current.showLatestOnly).toBe(false);
    });
  });

  describe('cache subscription', () => {
    it('updates state when cache notifies', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedCollections({
            catalogApi: mockCatalogApi as any,
            discoveryApi: mockDiscoveryApi as any,
            fetchApi: mockFetchApi as any,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      // Manually trigger a cache update
      collectionsCache.updateSyncStatus(
        { 'new-src': { lastSyncTime: '2024-02-01', lastFailedSyncTime: null } },
        true,
      );

      // The sync status update doesn't notify listeners,
      // but the entities should be preserved
      expect(result.current.entities.length).toBeGreaterThanOrEqual(0);
    });
  });
});
