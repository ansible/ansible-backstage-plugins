import { Entity } from '@backstage/catalog-model';
import { PaginatedEntityCache, BaseCacheState } from '../../common/cache';

export interface EECacheState extends BaseCacheState {
  allOwners: string[];
  allTags: string[];
}

function getUniqueFilters(entities: Entity[]): {
  owners: string[];
  tags: string[];
} {
  const owners = Array.from(
    new Set(
      entities
        .map(e => e.spec?.owner)
        .filter((owner): owner is string => Boolean(owner)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const tags = Array.from(
    new Set(
      entities
        .flatMap(e => e.metadata?.tags || [])
        .filter((tag): tag is string => Boolean(tag)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return { owners, tags };
}

export const eeCache = new PaginatedEntityCache<
  EECacheState,
  { owners: string[]; tags: string[] }
>({
  entityFilter: { kind: 'Component', 'spec.type': 'execution-environment' },
  extractFilters: getUniqueFilters,
  buildState: (base, filters) => ({
    ...base,
    allOwners: ['All', ...filters.owners],
    allTags: ['All', ...filters.tags],
  }),
  createEmptyState: () => ({
    entities: [],
    totalServerItems: 0,
    loadedOffset: 0,
    isFullyLoaded: false,
    allOwners: ['All'],
    allTags: ['All'],
    lastUpdated: Date.now(),
    error: null,
  }),
});
