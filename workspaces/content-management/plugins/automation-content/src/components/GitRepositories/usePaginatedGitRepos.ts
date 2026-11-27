import { useState, useCallback, useRef, useMemo } from 'react';
import { Entity } from '@backstage/catalog-model';
import { CatalogApi } from '@backstage/plugin-catalog-react';
import { useCacheSubscription, usePagination } from '../common/cache';
import { PAGE_SIZE } from './constants';
import { gitReposCache, GitReposCacheState } from './gitReposCache';
import { getRepoHost } from './scmUtils';

export interface UsePaginatedGitReposOptions {
  catalogApi: CatalogApi;
  onSourcesStatusChange?: (hasSources: boolean | null) => void;
  entityFilter?: (entity: Entity) => boolean;
}

export interface UsePaginatedGitReposResult {
  entities: Entity[];
  allEntities: Entity[];
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
  allSources: Array<{ value: string; label: string }>;
  sourceFilter: string;
  setSourceFilter: (filter: string) => void;
  refresh: () => void;
}

export function usePaginatedGitRepos({
  catalogApi,
  onSourcesStatusChange,
  entityFilter,
}: UsePaginatedGitReposOptions): UsePaginatedGitReposResult {
  const [allSources, setAllSources] = useState<
    Array<{ value: string; label: string }>
  >([{ value: 'All', label: 'All' }]);
  const [sourceFilter, setSourceFilter] = useState('All');

  const onSourcesStatusChangeRef = useRef(onSourcesStatusChange);
  onSourcesStatusChangeRef.current = onSourcesStatusChange;

  const onCacheUpdate = useCallback((state: GitReposCacheState) => {
    setAllSources(state.allSources);
  }, []);

  const onInitialData = useCallback((state: GitReposCacheState) => {
    setAllSources(state.allSources);
    onSourcesStatusChangeRef.current?.(state.entities.length > 0 ? true : null);
  }, []);

  const { allEntities, initialLoading, loadingMore, error } =
    useCacheSubscription<GitReposCacheState>({
      cache: gitReposCache,
      catalogApi,
      onCacheUpdate,
      onInitialData,
      fallbackErrorMessage: 'Failed to fetch git repositories',
    });

  const filteredEntities = useMemo(() => {
    return allEntities
      .filter(entity => {
        const matchesSource =
          sourceFilter === 'All' || getRepoHost(entity) === sourceFilter;
        const matchesEntityFilter = !entityFilter || entityFilter(entity);
        return matchesSource && matchesEntityFilter;
      })
      .sort((a, b) => {
        const nameA = (
          a.metadata?.title ??
          a.metadata?.name ??
          ''
        ).toLowerCase();
        const nameB = (
          b.metadata?.title ??
          b.metadata?.name ??
          ''
        ).toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [sourceFilter, allEntities, entityFilter]);

  const pagination = usePagination({
    totalItems: filteredEntities.length,
    pageSize: PAGE_SIZE,
    resetDeps: [sourceFilter, entityFilter],
  });

  const paginatedEntities = useMemo(
    () => filteredEntities.slice(pagination.startIndex, pagination.endIndex),
    [filteredEntities, pagination.startIndex, pagination.endIndex],
  );

  const refresh = useCallback(() => {
    setAllSources([{ value: 'All', label: 'All' }]);
    gitReposCache.invalidateFetchedData();
  }, []);

  return {
    entities: paginatedEntities,
    allEntities,
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
    allSources,
    sourceFilter,
    setSourceFilter,
    refresh,
  };
}
