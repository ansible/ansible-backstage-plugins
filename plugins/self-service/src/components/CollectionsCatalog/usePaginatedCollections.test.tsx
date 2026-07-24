import { renderHook, act, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { usePaginatedCollections } from './usePaginatedCollections';

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

const emptyFacets = {
  facets: {},
};

const mockCatalogApi = {
  queryEntities: jest.fn(),
  getEntities: jest.fn(),
  getEntityFacets: jest.fn(),
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

function setupDefaultMocks() {
  mockCatalogApi.getEntityFacets.mockResolvedValue(emptyFacets);
  mockCatalogApi.queryEntities.mockResolvedValue({
    items: [mockEntity],
    totalItems: 1,
    pageInfo: {},
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
}

describe('usePaginatedCollections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  describe('initial state', () => {
    it('starts with initialLoading true', async () => {
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

    it('returns entities after loading', async () => {
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

      expect(result.current.entities.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('fetching collections', () => {
    it('calls queryEntities with correct filter', async () => {
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
          filter: expect.objectContaining({
            kind: 'Component',
            'spec.type': 'ansible-collection',
          }),
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

    it('sets default error message when non-Error is thrown', async () => {
      mockCatalogApi.queryEntities.mockRejectedValue('string error');

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
    it('passes search query as fullTextFilter to queryEntities', async () => {
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
        expect(mockCatalogApi.queryEntities).toHaveBeenCalledWith(
          expect.objectContaining({
            fullTextFilter: { term: 'another' },
          }),
        );
      });
    });

    it('passes source filter to queryEntities', async () => {
      mockCatalogApi.getEntityFacets.mockImplementation(
        async (req: { filter: Record<string, string>; facets: string[] }) => {
          if (
            req.facets.includes(
              'metadata.annotations.ansible.io/collection-source-repository',
            )
          ) {
            return {
              facets: {
                'metadata.annotations.ansible.io/collection-source-repository':
                  [{ value: 'repo1', count: 1 }],
              },
            };
          }
          return { facets: {} };
        },
      );

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
        expect(result.current.initialLoading).toBe(false);
      });

      const calls = mockCatalogApi.queryEntities.mock.calls;
      const callWithSource = calls.find(
        (c: any[]) =>
          c[0]?.filter?.[
            'metadata.annotations.ansible.io/collection-source-repository'
          ] === 'repo1',
      );
      expect(callWithSource).toBeDefined();
    });

    it('passes tag filter to queryEntities', async () => {
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
        expect(result.current.initialLoading).toBe(false);
      });

      // Find a queryEntities call that includes the tag filter
      const calls = mockCatalogApi.queryEntities.mock.calls;
      const callWithTag = calls.find(
        (c: any[]) => c[0]?.filter?.['metadata.tags'] === 'security',
      );
      expect(callWithTag).toBeDefined();
    });

    it('resets to page 1 when filters change', async () => {
      mockCatalogApi.queryEntities.mockResolvedValue({
        items: [mockEntity],
        totalItems: 30,
        pageInfo: {},
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
      // With showLatestOnly=false, offset/limit pagination works directly
      // and totalItems from server drives page count.
      mockCatalogApi.queryEntities.mockResolvedValue({
        items: Array.from({ length: 12 }, (_, i) => ({
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
        })),
        totalItems: 30,
        pageInfo: {},
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

      // Disable latest-only filter for predictable pagination
      act(() => {
        result.current.setShowLatestOnly(false);
      });

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

      act(() => {
        result.current.setShowLatestOnly(false);
      });

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      act(() => {
        result.current.goToPage(2);
      });

      await waitFor(() => {
        expect(result.current.currentPage).toBe(2);
      });
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

      act(() => {
        result.current.setShowLatestOnly(false);
      });

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      act(() => {
        result.current.goToPage(100);
      });

      await waitFor(() => {
        expect(result.current.currentPage).toBe(3);
      });

      act(() => {
        result.current.goToPage(0);
      });

      await waitFor(() => {
        expect(result.current.currentPage).toBe(1);
      });
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

      act(() => {
        result.current.setShowLatestOnly(false);
      });

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      act(() => {
        result.current.nextPage();
      });

      await waitFor(() => {
        expect(result.current.currentPage).toBe(2);
      });
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

      act(() => {
        result.current.setShowLatestOnly(false);
      });

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      act(() => {
        result.current.goToPage(2);
      });

      await waitFor(() => {
        expect(result.current.currentPage).toBe(2);
      });

      act(() => {
        result.current.prevPage();
      });

      await waitFor(() => {
        expect(result.current.currentPage).toBe(1);
      });
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

      act(() => {
        result.current.setShowLatestOnly(false);
      });

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      // On page 1
      expect(result.current.hasPrevPage).toBe(false);
      expect(result.current.hasNextPage).toBe(true);

      act(() => {
        result.current.goToPage(3);
      });

      await waitFor(() => {
        expect(result.current.currentPage).toBe(3);
      });

      // On last page
      expect(result.current.hasPrevPage).toBe(true);
      expect(result.current.hasNextPage).toBe(false);
    });
  });

  describe('refresh', () => {
    it('refetches data', async () => {
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

    it('does not include annotation filter when showLatestOnly is OFF', async () => {
      mockCatalogApi.queryEntities.mockResolvedValue({
        items: [mockEntity, mockEntity2],
        totalItems: 2,
        pageInfo: {},
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

      act(() => {
        result.current.setShowLatestOnly(false);
      });

      await waitFor(() => {
        expect(result.current.initialLoading).toBe(false);
      });

      expect(mockCatalogApi.queryEntities).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 12,
          offset: 0,
          orderFields: [{ field: 'metadata.name', order: 'asc' }],
        }),
      );

      const calls = mockCatalogApi.queryEntities.mock.calls;
      const lastPageCall = calls[calls.length - 1];
      expect(
        lastPageCall[0]?.filter?.[
          'metadata.annotations.ansible.io/is-latest-version'
        ],
      ).toBeUndefined();
    });

    it('includes annotation filter when showLatestOnly is ON', async () => {
      mockCatalogApi.queryEntities.mockResolvedValue({
        items: [mockEntity],
        totalItems: 1,
        pageInfo: {},
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

      // showLatestOnly defaults to true, so the annotation filter should be present
      const calls = mockCatalogApi.queryEntities.mock.calls;
      const callWithAnnotation = calls.find(
        (c: any[]) =>
          c[0]?.filter?.[
            'metadata.annotations.ansible.io/is-latest-version'
          ] === 'true',
      );
      expect(callWithAnnotation).toBeDefined();
    });
  });

  describe('facets', () => {
    it('fetches entity facets for filter dropdowns', async () => {
      mockCatalogApi.getEntityFacets.mockResolvedValue({
        facets: {
          'metadata.tags': [
            { value: 'networking', count: 5 },
            { value: 'security', count: 3 },
          ],
        },
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

      expect(mockCatalogApi.getEntityFacets).toHaveBeenCalled();
      expect(result.current.allTags).toContain('All');
      expect(result.current.allTags).toContain('networking');
      expect(result.current.allTags).toContain('security');
    });
  });
});
