import { useState, useCallback, useEffect, useRef } from 'react';
import { Entity } from '@backstage/catalog-model';
import { CatalogApi } from '@backstage/plugin-catalog-react';
import { PAGE_SIZE } from './constants';
import { gitRepositoriesCache } from './gitRepositoriesCache';
import {
  getRepoHost,
  RepoSourceOption,
  sortRepoEntities,
} from './repositoryUtils';

export interface UsePaginatedGitRepositoriesOptions {
  catalogApi: CatalogApi;
  isStarredEntity: (entity: Entity) => boolean;
  starredFilterActive: boolean;
}

export interface UsePaginatedGitRepositoriesResult {
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
  nextPage: () => void;
  prevPage: () => void;
  allSources: RepoSourceOption[];
  sourceFilter: string;
  setSourceFilter: (filter: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export function usePaginatedGitRepositories({
  catalogApi,
  isStarredEntity,
  starredFilterActive,
}: UsePaginatedGitRepositoriesOptions): UsePaginatedGitRepositoriesResult {
  const cachedState = gitRepositoriesCache.getState();

  const [allEntities, setAllEntities] = useState<Entity[]>(
    cachedState?.entities ?? [],
  );
  const [filteredEntities, setFilteredEntities] = useState<Entity[]>([]);
  const [initialLoading, setInitialLoading] = useState(
    !cachedState?.entities.length,
  );
  const [loadingMore, setLoadingMore] = useState(
    gitRepositoriesCache.isLoading() && !gitRepositoriesCache.isFullyLoaded(),
  );
  const [error, setError] = useState<string | null>(cachedState?.error ?? null);
  const [currentPage, setCurrentPage] = useState(1);
  const [allSources, setAllSources] = useState<RepoSourceOption[]>(
    cachedState?.allSources ?? [{ value: 'All', label: 'All' }],
  );
  const [sourceFilter, setSourceFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const isMountedRef = useRef(true);

  useEffect(() => {
    const unsubscribe = gitRepositoriesCache.subscribe(state => {
      if (isMountedRef.current) {
        setAllEntities(state.entities);
        setAllSources(state.allSources);
        setLoadingMore(
          !state.isFullyLoaded && gitRepositoriesCache.isLoading(),
        );
        if (state.error) {
          setError(state.error);
          setInitialLoading(false);
        }
      }
    });

    return unsubscribe;
  }, []);

  const fetchInitialRepositories = useCallback(async () => {
    const cached = gitRepositoriesCache.getState();
    if (cached && cached.entities.length > 0) {
      setAllEntities(cached.entities);
      setAllSources(cached.allSources);
      setInitialLoading(false);
      setLoadingMore(!cached.isFullyLoaded && gitRepositoriesCache.isLoading());
      setError(cached.error);

      if (!cached.isFullyLoaded) {
        void gitRepositoriesCache.startLoading(catalogApi);
      }
      return;
    }

    setInitialLoading(true);
    setError(null);

    try {
      await gitRepositoriesCache.startLoading(catalogApi);

      if (!isMountedRef.current) return;

      const state = gitRepositoriesCache.getState();
      if (state) {
        setAllEntities(state.entities);
        setAllSources(state.allSources);
        setLoadingMore(
          !state.isFullyLoaded && gitRepositoriesCache.isLoading(),
        );
        setError(state.error);
      }
      setInitialLoading(false);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(
        err instanceof Error ? err.message : 'Failed to fetch git repositories',
      );
      setInitialLoading(false);
    }
  }, [catalogApi]);

  useEffect(() => {
    const searchLower = searchQuery.toLowerCase().trim();
    let filtered = allEntities.filter(entity => {
      const matchesSource =
        sourceFilter === 'All' || getRepoHost(entity) === sourceFilter;

      const annotations = entity.metadata?.annotations || {};
      const matchesSearch =
        !searchLower ||
        entity.metadata?.name?.toLowerCase()?.includes(searchLower) ||
        entity.metadata?.title?.toLowerCase()?.includes(searchLower) ||
        (annotations['ansible.io/scm-organization'] as string | undefined)
          ?.toLowerCase()
          ?.includes(searchLower) ||
        (annotations['ansible.io/scm-repository'] as string | undefined)
          ?.toLowerCase()
          ?.includes(searchLower);

      return matchesSource && matchesSearch;
    });

    if (starredFilterActive) {
      filtered = filtered.filter(e => isStarredEntity(e));
    }

    setFilteredEntities(sortRepoEntities(filtered));
  }, [
    allEntities,
    sourceFilter,
    searchQuery,
    starredFilterActive,
    isStarredEntity,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sourceFilter, searchQuery, starredFilterActive]);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchInitialRepositories();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchInitialRepositories]);

  const totalCount = filteredEntities.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedEntities = filteredEntities.slice(startIndex, endIndex);

  const nextPage = useCallback(() => {
    setCurrentPage(p => Math.min(p + 1, totalPages));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setCurrentPage(p => Math.max(p - 1, 1));
  }, []);

  return {
    entities: paginatedEntities,
    allEntities,
    loadedEntityCount: allEntities.length,
    totalCount,
    initialLoading,
    loadingMore,
    error,
    currentPage,
    totalPages,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
    nextPage,
    prevPage,
    allSources,
    sourceFilter,
    setSourceFilter,
    searchQuery,
    setSearchQuery,
  };
}
