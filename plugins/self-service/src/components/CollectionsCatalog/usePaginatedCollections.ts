import { useState, useCallback, useEffect, useRef } from 'react';
import { Entity } from '@backstage/catalog-model';
import { CatalogApi } from '@backstage/plugin-catalog-react';
import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { SyncStatusMap } from '../common';
import { filterCollectionsByRepository, sortEntities } from './utils';
import { PAGE_SIZE } from './constants';
import { addCollectionsInvalidateCallback } from './collectionsInvalidation';

const LIGHTWEIGHT_FIELDS = [
  'kind',
  'metadata.name',
  'metadata.namespace',
  'metadata.uid',
  'metadata.annotations',
  'metadata.tags',
  'metadata.description',
  'spec.type',
  'spec.collection_namespace',
  'spec.collection_name',
  'spec.collection_version',
  'spec.collection_full_name',
];

export interface UsePaginatedCollectionsOptions {
  catalogApi: CatalogApi;
  discoveryApi: DiscoveryApi;
  fetchApi: FetchApi;
  filterByRepositoryEntity?: Entity | null;
}

export interface UsePaginatedCollectionsResult {
  entities: Entity[];
  loadedEntityCount: number;
  totalCount: number;
  initialLoading: boolean;
  pageLoading: boolean;
  error: string | null;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  syncStatusMap: SyncStatusMap;
  hasConfiguredSources: boolean | null;
  allSources: string[];
  allTags: string[];
  sourceFilter: string;
  setSourceFilter: (filter: string) => void;
  tagFilter: string;
  setTagFilter: (filter: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  showLatestOnly: boolean;
  setShowLatestOnly: (show: boolean) => void;
  refresh: () => void;
}

const BASE_FILTER: Record<string, string> = {
  kind: 'Component',
  'spec.type': 'ansible-collection',
};

function buildEntityFilter(
  sourceFilter: string,
  tagFilter: string,
  sourceTypeMap: Map<string, 'pah' | 'scm'>,
  showLatestOnly: boolean,
): Record<string, string | string[]> {
  const filter: Record<string, string> = { ...BASE_FILTER };

  if (sourceFilter !== 'All') {
    const sourceType = sourceTypeMap.get(sourceFilter);
    if (sourceType === 'pah') {
      filter['metadata.annotations.ansible.io/collection-source-repository'] =
        sourceFilter;
    } else {
      filter['metadata.annotations.ansible.io/scm-host-name'] = sourceFilter;
    }
  }

  if (tagFilter !== 'All') {
    filter['metadata.tags'] = tagFilter;
  }

  if (showLatestOnly) {
    filter['metadata.annotations.ansible.io/is-latest-version'] = 'true';
  }

  return filter;
}

function buildRepoFilter(repoEntity: Entity): {
  filter: Record<string, string | string[]>;
} {
  const repoSpec = (repoEntity.spec || {}) as {
    repository_collections?: string[];
  };
  const names = (repoSpec.repository_collections ?? []).filter(
    (n): n is string => typeof n === 'string',
  );

  if (names.length > 0) {
    return {
      filter: {
        ...BASE_FILTER,
        'metadata.name': names,
      },
    };
  }

  const ann = repoEntity.metadata?.annotations || {};
  return {
    filter: {
      ...BASE_FILTER,
      'metadata.annotations.ansible.io/scm-provider':
        ann['ansible.io/scm-provider'] || '',
      'metadata.annotations.ansible.io/scm-host':
        ann['ansible.io/scm-host'] || '',
      'metadata.annotations.ansible.io/scm-organization':
        ann['ansible.io/scm-organization'] || '',
      'metadata.annotations.ansible.io/scm-repository':
        ann['ansible.io/scm-repository'] || '',
    },
  };
}

export function usePaginatedCollections({
  catalogApi,
  discoveryApi,
  fetchApi,
  filterByRepositoryEntity,
}: UsePaginatedCollectionsOptions): UsePaginatedCollectionsResult {
  const [allSources, setAllSources] = useState<string[]>(['All']);
  const [allTags, setAllTags] = useState<string[]>(['All']);
  const [sourceFilter, setSourceFilter] = useState('All');
  const [tagFilter, setTagFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [showLatestOnly, setShowLatestOnly] = useState(true);
  const [syncStatusMap, setSyncStatusMap] = useState<SyncStatusMap>({});
  const [hasConfiguredSources, setHasConfiguredSources] = useState<
    boolean | null
  >(null);

  const [entities, setEntities] = useState<Entity[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalUnfilteredCount, setTotalUnfilteredCount] = useState<
    number | null
  >(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceTypeMapRef = useRef<Map<string, 'pah' | 'scm'>>(new Map());
  const isMountedRef = useRef(true);
  const fetchGenRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchFacets = useCallback(async () => {
    try {
      const [tagFacets, pahFacets, scmFacets, unfilteredResult] =
        await Promise.all([
          catalogApi.getEntityFacets({
            filter: BASE_FILTER,
            facets: ['metadata.tags'],
          }),
          catalogApi.getEntityFacets({
            filter: {
              ...BASE_FILTER,
              'metadata.annotations.ansible.io/collection-source': 'pah',
            },
            facets: [
              'metadata.annotations.ansible.io/collection-source-repository',
            ],
          }),
          catalogApi.getEntityFacets({
            filter: {
              ...BASE_FILTER,
              'metadata.annotations.ansible.io/collection-source': 'scm',
            },
            facets: ['metadata.annotations.ansible.io/scm-host-name'],
          }),
          catalogApi.queryEntities({
            filter: BASE_FILTER,
            fields: ['metadata.name'],
            limit: 1,
          }),
        ]);

      if (!isMountedRef.current) return;

      setTotalUnfilteredCount(unfilteredResult.totalItems);

      const tags = (tagFacets.facets['metadata.tags'] || [])
        .map(f => f.value)
        .filter(t => t !== 'ansible-collection')
        .sort((a, b) => a.localeCompare(b));
      setAllTags(['All', ...tags]);

      const pahSources = (
        pahFacets.facets[
          'metadata.annotations.ansible.io/collection-source-repository'
        ] || []
      ).map(f => f.value);

      const scmSources = (
        scmFacets.facets['metadata.annotations.ansible.io/scm-host-name'] || []
      ).map(f => f.value);

      const newSourceTypeMap = new Map<string, 'pah' | 'scm'>();
      for (const s of pahSources) newSourceTypeMap.set(s, 'pah');
      for (const s of scmSources) newSourceTypeMap.set(s, 'scm');
      sourceTypeMapRef.current = newSourceTypeMap;

      const combinedSources = [...pahSources, ...scmSources].sort((a, b) =>
        a.localeCompare(b),
      );
      setAllSources(['All', ...combinedSources]);
    } catch {
      // facets failed — dropdowns will show only 'All'
    }
  }, [catalogApi]);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const baseUrl = await discoveryApi.getBaseUrl('catalog');
      const response = await fetchApi.fetch(
        `${baseUrl}/ansible/sync/status?ansible_contents=true`,
      );

      if (!response.ok) {
        if (isMountedRef.current) {
          setHasConfiguredSources(false);
        }
        return;
      }

      const data = await response.json();
      const statusMap: SyncStatusMap = {};
      const providers = data.content?.providers || [];

      providers.forEach(
        (provider: {
          sourceId: string;
          lastSyncTime: string | null;
          lastFailedSyncTime: string | null;
        }) => {
          statusMap[provider.sourceId] = {
            lastSyncTime: provider.lastSyncTime,
            lastFailedSyncTime: provider.lastFailedSyncTime,
          };
        },
      );

      if (isMountedRef.current) {
        setSyncStatusMap(statusMap);
        setHasConfiguredSources(providers.length > 0);
      }
    } catch {
      if (isMountedRef.current) {
        setHasConfiguredSources(false);
      }
    }
  }, [discoveryApi, fetchApi]);

  useEffect(() => {
    fetchFacets();
    fetchSyncStatus();
  }, [fetchFacets, fetchSyncStatus]);

  const fetchPage = useCallback(
    async (page: number) => {
      fetchGenRef.current += 1;
      const gen = fetchGenRef.current;

      if (!hasLoadedOnceRef.current) {
        setInitialLoading(true);
      } else {
        setPageLoading(true);
      }
      setError(null);

      try {
        if (filterByRepositoryEntity) {
          // Repository detail page: fetch all matching, client-side paginate
          const { filter } = buildRepoFilter(filterByRepositoryEntity);
          const result = await catalogApi.queryEntities({
            filter,
            fields: LIGHTWEIGHT_FIELDS,
            limit: 1000,
            orderFields: [{ field: 'metadata.name', order: 'asc' }],
          });

          if (!isMountedRef.current || gen !== fetchGenRef.current) return;

          if (result.totalItems > result.items.length) {
            // eslint-disable-next-line no-console
            console.warn(
              `Repository collections truncated: ${result.totalItems} total, only first ${result.items.length} fetched`,
            );
          }

          const filtered = filterCollectionsByRepository(
            result.items,
            filterByRepositoryEntity,
          );
          const sorted = sortEntities(filtered);
          const start = (page - 1) * PAGE_SIZE;
          const pageEntities = sorted.slice(start, start + PAGE_SIZE);

          setEntities(pageEntities);
          setTotalCount(sorted.length);
          setCurrentPage(page);
          hasLoadedOnceRef.current = true;
          setInitialLoading(false);
          setPageLoading(false);
          return;
        }

        const filter = buildEntityFilter(
          sourceFilter,
          tagFilter,
          sourceTypeMapRef.current,
          showLatestOnly,
        );
        const result = await catalogApi.queryEntities({
          filter,
          fields: LIGHTWEIGHT_FIELDS,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          orderFields: [{ field: 'metadata.name', order: 'asc' }],
          ...(debouncedSearchQuery.trim()
            ? { fullTextFilter: { term: debouncedSearchQuery.trim() } }
            : {}),
        });

        if (!isMountedRef.current || gen !== fetchGenRef.current) return;

        const lastPage = Math.max(1, Math.ceil(result.totalItems / PAGE_SIZE));
        if (page > lastPage && page > 1) {
          fetchPage(lastPage);
          return;
        }

        setEntities(result.items);
        setTotalCount(result.totalItems);
        setCurrentPage(page);
        hasLoadedOnceRef.current = true;
        setInitialLoading(false);
        setPageLoading(false);
      } catch (err) {
        if (!isMountedRef.current || gen !== fetchGenRef.current) return;
        setError(
          err instanceof Error ? err.message : 'Failed to fetch collections',
        );
        hasLoadedOnceRef.current = true;
        setInitialLoading(false);
        setPageLoading(false);
      }
    },
    [
      catalogApi,
      sourceFilter,
      tagFilter,
      debouncedSearchQuery,
      showLatestOnly,
      filterByRepositoryEntity,
    ],
  );

  // Reset to page 1 and fetch when filters/search/mode changes
  useEffect(() => {
    setCurrentPage(1);
    fetchPage(1);
  }, [fetchPage]);

  // Register invalidation callback
  useEffect(() => {
    return addCollectionsInvalidateCallback(() => {
      fetchPage(1);
      fetchFacets();
    });
  }, [fetchPage, fetchFacets]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasNextPage = currentPage < totalPages;
  const hasPrevPage = currentPage > 1;

  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(page, totalPages));
      fetchPage(clamped);
    },
    [fetchPage, totalPages],
  );

  const nextPage = useCallback(() => {
    if (hasNextPage) {
      fetchPage(currentPage + 1);
    }
  }, [hasNextPage, currentPage, fetchPage]);

  const prevPage = useCallback(() => {
    if (hasPrevPage) {
      fetchPage(currentPage - 1);
    }
  }, [hasPrevPage, currentPage, fetchPage]);

  const refresh = useCallback(() => {
    fetchPage(1);
    fetchFacets();
    fetchSyncStatus();
  }, [fetchPage, fetchFacets, fetchSyncStatus]);

  return {
    entities,
    loadedEntityCount: totalUnfilteredCount ?? 0,
    totalCount,
    initialLoading,
    pageLoading,
    error,
    currentPage,
    totalPages,
    hasNextPage,
    hasPrevPage,
    goToPage,
    nextPage,
    prevPage,
    syncStatusMap,
    hasConfiguredSources,
    allSources,
    allTags,
    sourceFilter,
    setSourceFilter,
    tagFilter,
    setTagFilter,
    searchQuery,
    setSearchQuery,
    showLatestOnly,
    setShowLatestOnly,
    refresh,
  };
}
