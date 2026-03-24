import { useState, useCallback, useEffect, useRef } from 'react';
import { Entity } from '@backstage/catalog-model';
import { CatalogApi } from '@backstage/plugin-catalog-react';
import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { SyncStatusMap } from '../common';
import {
  sortEntities,
  filterLatestVersions,
  filterCollectionsByRepository,
} from './utils';
import { PAGE_SIZE } from './constants';
import { collectionsCache } from './collectionsCache';

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
  // Initialize state from cache if available
  const cachedState = collectionsCache.getState();

  const [allEntities, setAllEntities] = useState<Entity[]>(
    cachedState?.entities ?? [],
  );
  const [filteredEntities, setFilteredEntities] = useState<Entity[]>([]);
  const [initialLoading, setInitialLoading] = useState(
    !cachedState?.entities.length,
  );
  const [loadingMore, setLoadingMore] = useState(
    collectionsCache.isLoading() && !collectionsCache.isFullyLoaded(),
  );
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [syncStatusMap, setSyncStatusMap] = useState<SyncStatusMap>(
    cachedState?.syncStatusMap ?? {},
  );
  const [hasConfiguredSources, setHasConfiguredSources] = useState<
    boolean | null
  >(cachedState?.hasConfiguredSources ?? null);
  const [allSources, setAllSources] = useState<string[]>(
    cachedState?.allSources ?? ['All'],
  );
  const [allTags, setAllTags] = useState<string[]>(
    cachedState?.allTags ?? ['All'],
  );
  const [sourceFilter, setSourceFilter] = useState('All');
  const [tagFilter, setTagFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLatestOnly, setShowLatestOnly] = useState(true);

  const isMountedRef = useRef(true);

  useEffect(() => {
    const unsubscribe = collectionsCache.subscribe(state => {
      if (isMountedRef.current) {
        setAllEntities(state.entities);
        setAllSources(state.allSources);
        setAllTags(state.allTags);
        setLoadingMore(!state.isFullyLoaded && collectionsCache.isLoading());
        if (state.error) {
          setError(state.error);
          setInitialLoading(false);
        }
      }
    });

    return unsubscribe;
  }, []);

  const fetchInitialCollections = useCallback(async () => {
    // check if we have valid cached data
    const cached = collectionsCache.getState();
    if (cached && cached.entities.length > 0) {
      // use cached data immediately if available
      setAllEntities(cached.entities);
      setAllSources(cached.allSources);
      setAllTags(cached.allTags);
      setInitialLoading(false);
      setLoadingMore(!cached.isFullyLoaded && collectionsCache.isLoading());

      // continue loading via cache if not fully loaded
      if (!cached.isFullyLoaded) {
        collectionsCache.startLoading(catalogApi);
      }
      return;
    }

    setInitialLoading(true);
    setError(null);

    try {
      // Start loading via the cache (this runs in the background
      // and continues even if the component unmounts)
      await collectionsCache.startLoading(catalogApi);

      if (!isMountedRef.current) return;

      const state = collectionsCache.getState();
      if (state) {
        setAllEntities(state.entities);
        setAllSources(state.allSources);
        setAllTags(state.allTags);
        setLoadingMore(!state.isFullyLoaded && collectionsCache.isLoading());
      }
      setInitialLoading(false);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(
        err instanceof Error ? err.message : 'Failed to fetch collections',
      );
      setInitialLoading(false);
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
          collectionsCache.updateSyncStatus({}, false);
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
        collectionsCache.updateSyncStatus(statusMap, providers.length > 0);
      }
    } catch {
      if (isMountedRef.current) {
        setHasConfiguredSources(false);
        collectionsCache.updateSyncStatus({}, false);
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
    // Clear cache to force a fresh fetch
    collectionsCache.clear();
    setAllEntities([]);
    setAllSources(['All']);
    setAllTags(['All']);
    setInitialLoading(true);

    // Re-fetch everything
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
