import { useState, useCallback, useEffect, useRef } from 'react';
import { Entity } from '@backstage/catalog-model';
import { CatalogApi } from '@backstage/plugin-catalog-react';
import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { SyncStatusMap } from '../common';
import {
  sortEntities,
  filterLatestVersions,
  getUniqueFilters,
  filterCollectionsByRepository,
} from './utils';
import { PAGE_SIZE } from './constants';

const INITIAL_FETCH_LIMIT = 50;
const BACKGROUND_FETCH_LIMIT = 200;

export interface UsePaginatedCollectionsOptions {
  catalogApi: CatalogApi;
  discoveryApi: DiscoveryApi;
  fetchApi: FetchApi;
  filterByRepositoryEntity?: Entity | null;
}

export interface UsePaginatedCollectionsResult {
  entities: Entity[];
  totalCount: number;
  initialLoading: boolean;
  loadingMore: boolean;
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

export function usePaginatedCollections({
  catalogApi,
  discoveryApi,
  fetchApi,
  filterByRepositoryEntity,
}: UsePaginatedCollectionsOptions): UsePaginatedCollectionsResult {
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [filteredEntities, setFilteredEntities] = useState<Entity[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [syncStatusMap, setSyncStatusMap] = useState<SyncStatusMap>({});
  const [hasConfiguredSources, setHasConfiguredSources] = useState<
    boolean | null
  >(null);
  const [allSources, setAllSources] = useState<string[]>(['All']);
  const [allTags, setAllTags] = useState<string[]>(['All']);
  const [sourceFilter, setSourceFilter] = useState('All');
  const [tagFilter, setTagFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLatestOnly, setShowLatestOnly] = useState(true);

  const isMountedRef = useRef(true);
  const loadedAllRef = useRef(false);
  const backgroundLoadingRef = useRef(false);

  const fetchRemainingCollections = useCallback(
    async (initialItems: Entity[], total: number) => {
      if (backgroundLoadingRef.current || loadedAllRef.current) return;

      backgroundLoadingRef.current = true;
      setLoadingMore(true);

      let allItems = [...initialItems];
      let offset = initialItems.length;

      try {
        while (offset < total && isMountedRef.current) {
          const response = await catalogApi.queryEntities({
            filter: { kind: 'Component', 'spec.type': 'ansible-collection' },
            limit: BACKGROUND_FETCH_LIMIT,
            offset,
          });

          if (!isMountedRef.current) break;

          const newItems = response?.items || [];
          if (newItems.length === 0) break;

          allItems = [...allItems, ...newItems];
          offset += newItems.length;

          setAllEntities(allItems);

          const { sources, tags } = getUniqueFilters(allItems);
          setAllSources(['All', ...sources]);
          setAllTags(['All', ...tags]);
        }

        loadedAllRef.current = true;
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('Error loading remaining collections:', err);
        }
      } finally {
        if (isMountedRef.current) {
          setLoadingMore(false);
        }
        backgroundLoadingRef.current = false;
      }
    },
    [catalogApi],
  );

  const fetchInitialCollections = useCallback(async () => {
    setInitialLoading(true);
    setError(null);
    loadedAllRef.current = false;

    try {
      const response = await catalogApi.queryEntities({
        filter: { kind: 'Component', 'spec.type': 'ansible-collection' },
        limit: INITIAL_FETCH_LIMIT,
      });

      if (!isMountedRef.current) return;

      const items = response?.items || [];
      const total = response?.totalItems ?? items.length;

      setAllEntities(items);

      if (items.length > 0) {
        const { sources, tags } = getUniqueFilters(items);
        setAllSources(['All', ...sources]);
        setAllTags(['All', ...tags]);
      }

      if (items.length >= total) {
        loadedAllRef.current = true;
      }

      setInitialLoading(false);

      if (items.length < total && !backgroundLoadingRef.current) {
        fetchRemainingCollections(items, total);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(
        err instanceof Error ? err.message : 'Failed to fetch collections',
      );
      setInitialLoading(false);
    }
  }, [catalogApi, fetchRemainingCollections]);

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
    if (filterByRepositoryEntity) {
      const repoFiltered = filterCollectionsByRepository(
        allEntities,
        filterByRepositoryEntity,
      );
      setFilteredEntities(sortEntities(repoFiltered));
      return;
    }

    const searchLower = searchQuery.toLowerCase().trim();
    let filtered = allEntities.filter(entity => {
      const annotations = entity.metadata?.annotations || {};
      const collectionSource = annotations['ansible.io/collection-source'];

      const entitySource =
        collectionSource === 'pah'
          ? annotations['ansible.io/collection-source-repository'] || ''
          : annotations['ansible.io/scm-host-name'] || '';

      const matchesSource =
        sourceFilter === 'All' || entitySource === sourceFilter;
      const matchesTag =
        tagFilter === 'All' || entity.metadata?.tags?.includes(tagFilter);

      const matchesSearch =
        !searchLower ||
        entity.metadata?.name?.toLowerCase().includes(searchLower) ||
        (entity.spec?.collection_namespace as string | undefined)
          ?.toLowerCase()
          .includes(searchLower) ||
        entity.metadata?.description?.toLowerCase().includes(searchLower) ||
        entity.metadata?.tags?.some((tag: string) =>
          tag.toLowerCase().includes(searchLower),
        );

      return matchesSource && matchesTag && matchesSearch;
    });

    if (showLatestOnly) {
      filtered = filterLatestVersions(filtered);
    }

    setFilteredEntities(sortEntities(filtered));
  }, [
    filterByRepositoryEntity,
    sourceFilter,
    tagFilter,
    searchQuery,
    allEntities,
    showLatestOnly,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    sourceFilter,
    tagFilter,
    searchQuery,
    showLatestOnly,
    filterByRepositoryEntity,
  ]);

  useEffect(() => {
    isMountedRef.current = true;
    loadedAllRef.current = false;
    backgroundLoadingRef.current = false;
    fetchInitialCollections();
    fetchSyncStatus();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchInitialCollections, fetchSyncStatus]);

  const totalCount = filteredEntities.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedEntities = filteredEntities.slice(startIndex, endIndex);

  const goToPage = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)));
    },
    [totalPages],
  );

  const nextPage = useCallback(() => {
    setCurrentPage(p => Math.min(p + 1, totalPages));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setCurrentPage(p => Math.max(p - 1, 1));
  }, []);

  const refresh = useCallback(() => {
    loadedAllRef.current = false;
    backgroundLoadingRef.current = false;
    fetchInitialCollections();
    fetchSyncStatus();
  }, [fetchInitialCollections, fetchSyncStatus]);

  return {
    entities: paginatedEntities,
    totalCount,
    initialLoading,
    loadingMore,
    error,
    currentPage,
    totalPages,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
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
