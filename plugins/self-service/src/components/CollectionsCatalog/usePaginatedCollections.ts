import { useState, useCallback, useEffect, useMemo } from 'react';
import { Entity } from '@backstage/catalog-model';
import { CatalogApi } from '@backstage/plugin-catalog-react';
import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { SyncStatusMap } from '../common';
import { useCacheSubscription, usePagination } from '../common/cache';
import {
  sortEntities,
  filterLatestVersions,
  filterCollectionsByRepository,
} from './utils';
import { PAGE_SIZE } from './constants';
import { collectionsCache, CollectionsCacheState } from './collectionsCache';

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
  const [allSources, setAllSources] = useState<string[]>(['All']);
  const [allTags, setAllTags] = useState<string[]>(['All']);
  const [sourceFilter, setSourceFilter] = useState('All');
  const [tagFilter, setTagFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLatestOnly, setShowLatestOnly] = useState(true);
  const [syncStatusMap, setSyncStatusMap] = useState<SyncStatusMap>({});
  const [hasConfiguredSources, setHasConfiguredSources] = useState<
    boolean | null
  >(null);

  const onCacheUpdate = useCallback((state: CollectionsCacheState) => {
    setAllSources(state.allSources);
    setAllTags(state.allTags);
  }, []);

  const { allEntities, initialLoading, loadingMore, error, isMountedRef, fetchInitial } =
    useCacheSubscription<CollectionsCacheState>({
      cache: collectionsCache,
      catalogApi,
      onCacheUpdate,
      fallbackErrorMessage: 'Failed to fetch collections',
    });

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
  }, [discoveryApi, fetchApi, isMountedRef]);

  useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  const filteredEntities = useMemo(() => {
    if (filterByRepositoryEntity) {
      const repoFiltered = filterCollectionsByRepository(
        allEntities,
        filterByRepositoryEntity,
      );
      return sortEntities(repoFiltered);
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
        entity.metadata?.name?.toLowerCase()?.includes(searchLower) ||
        (entity.spec?.collection_namespace as string | undefined)
          ?.toLowerCase()
          ?.includes(searchLower) ||
        entity.metadata?.description?.toLowerCase()?.includes(searchLower) ||
        entity.metadata?.tags?.some((tag: string) =>
          tag.toLowerCase().includes(searchLower),
        );

      return matchesSource && matchesTag && matchesSearch;
    });

    if (showLatestOnly) {
      filtered = filterLatestVersions(filtered);
    }

    return sortEntities(filtered);
  }, [
    filterByRepositoryEntity,
    sourceFilter,
    tagFilter,
    searchQuery,
    allEntities,
    showLatestOnly,
  ]);

  const pagination = usePagination({
    totalItems: filteredEntities.length,
    pageSize: PAGE_SIZE,
    resetDeps: [
      sourceFilter,
      tagFilter,
      searchQuery,
      showLatestOnly,
      filterByRepositoryEntity,
    ],
  });

  const paginatedEntities = useMemo(
    () => filteredEntities.slice(pagination.startIndex, pagination.endIndex),
    [filteredEntities, pagination.startIndex, pagination.endIndex],
  );

  const refresh = useCallback(() => {
    collectionsCache.clear();
    setAllSources(['All']);
    setAllTags(['All']);
    fetchInitial();
    fetchSyncStatus();
  }, [fetchInitial, fetchSyncStatus]);

  return {
    entities: paginatedEntities,
    loadedEntityCount: allEntities.length,
    totalCount: filteredEntities.length,
    initialLoading,
    loadingMore,
    error,
    currentPage: pagination.currentPage,
    totalPages: pagination.totalPages,
    hasNextPage: pagination.hasNextPage,
    hasPrevPage: pagination.hasPrevPage,
    goToPage: pagination.goToPage,
    nextPage: pagination.nextPage,
    prevPage: pagination.prevPage,
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
