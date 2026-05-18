import { useState, useCallback, useEffect, useMemo } from 'react';
import { Entity } from '@backstage/catalog-model';
import { CatalogApi } from '@backstage/plugin-catalog-react';
import { useCacheSubscription, usePagination } from '../../common/cache';
import { PAGE_SIZE } from './constants';
import { eeCache, EECacheState } from './eeCache';

export interface UsePaginatedEEOptions {
  catalogApi: CatalogApi;
}

export interface UsePaginatedEEResult {
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
  allOwners: string[];
  allTags: string[];
  ownerFilter: string;
  setOwnerFilter: (filter: string) => void;
  tagFilter: string;
  setTagFilter: (filter: string) => void;
  ownerNames: Map<string, string>;
  refresh: () => void;
}

function sortByMetadataNameAsc(entities: Entity[]): Entity[] {
  return [...entities].sort((a, b) => {
    const nameA = a.metadata?.name ?? '';
    const nameB = b.metadata?.name ?? '';

    const numA = Number(nameA);
    const numB = Number(nameB);
    const isNumA = !Number.isNaN(numA);
    const isNumB = !Number.isNaN(numB);

    if (isNumA && isNumB) return numA - numB;
    if (isNumA) return -1;
    if (isNumB) return 1;

    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
  });
}

export function usePaginatedEE({
  catalogApi,
}: UsePaginatedEEOptions): UsePaginatedEEResult {
  const [allOwners, setAllOwners] = useState<string[]>(['All']);
  const [allTags, setAllTags] = useState<string[]>(['All']);
  const [ownerFilter, setOwnerFilter] = useState('All');
  const [tagFilter, setTagFilter] = useState('All');
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map());

  const onCacheUpdate = useCallback((state: EECacheState) => {
    setAllOwners(state.allOwners);
    setAllTags(state.allTags);
  }, []);

  const {
    allEntities,
    initialLoading,
    loadingMore,
    error,
    isMountedRef,
    fetchInitial,
  } = useCacheSubscription<EECacheState>({
    cache: eeCache,
    catalogApi,
    onCacheUpdate,
    fallbackErrorMessage: 'Failed to fetch execution environments',
  });

  const resolveOwnerNames = useCallback(
    async (entities: Entity[]) => {
      const ownerRefs = Array.from(
        new Set(
          entities
            .map(e => e.spec?.owner)
            .filter((owner): owner is string => Boolean(owner)),
        ),
      );

      if (ownerRefs.length === 0) return;

      try {
        const response = await catalogApi.getEntitiesByRefs({
          entityRefs: ownerRefs,
        });

        if (!isMountedRef.current) return;

        const nameMap = new Map<string, string>();
        ownerRefs.forEach((ref, index) => {
          const entity = response.items[index];
          const displayName =
            entity?.metadata?.title ?? entity?.metadata?.name ?? ref;
          nameMap.set(ref, displayName);
        });

        setOwnerNames(prev => {
          const updated = new Map(prev);
          nameMap.forEach((name, ref) => updated.set(ref, name));
          return updated;
        });
      } catch {
        if (!isMountedRef.current) return;
        const fallback = new Map<string, string>();
        ownerRefs.forEach(ref => fallback.set(ref, ref));
        setOwnerNames(prev => {
          const updated = new Map(prev);
          fallback.forEach((name, ref) => updated.set(ref, name));
          return updated;
        });
      }
    },
    [catalogApi, isMountedRef],
  );

  useEffect(() => {
    if (allEntities.length > 0) {
      resolveOwnerNames(allEntities);
    }
  }, [allEntities, resolveOwnerNames]);

  const filteredEntities = useMemo(() => {
    const filtered = allEntities.filter(entity => {
      const matchesOwner =
        ownerFilter === 'All' || entity.spec?.owner === ownerFilter;
      const matchesTag =
        tagFilter === 'All' || entity.metadata?.tags?.includes(tagFilter);
      return matchesOwner && matchesTag;
    });
    return sortByMetadataNameAsc(filtered);
  }, [ownerFilter, tagFilter, allEntities]);

  const pagination = usePagination({
    totalItems: filteredEntities.length,
    pageSize: PAGE_SIZE,
    resetDeps: [ownerFilter, tagFilter],
  });

  const paginatedEntities = useMemo(
    () => filteredEntities.slice(pagination.startIndex, pagination.endIndex),
    [filteredEntities, pagination.startIndex, pagination.endIndex],
  );

  const refresh = useCallback(() => {
    eeCache.clear();
    setAllOwners(['All']);
    setAllTags(['All']);
    setOwnerNames(new Map());
    fetchInitial();
  }, [fetchInitial]);

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
    allOwners,
    allTags,
    ownerFilter,
    setOwnerFilter,
    tagFilter,
    setTagFilter,
    ownerNames,
    refresh,
  };
}
