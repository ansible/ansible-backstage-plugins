import { PaginatedEntityCache, BaseCacheState } from '../common/cache';
import { SyncStatusMap } from '../common';
import { getUniqueFilters } from './utils';

export interface CollectionsCacheState extends BaseCacheState {
  allSources: string[];
  allTags: string[];
  syncStatusMap: SyncStatusMap;
  hasConfiguredSources: boolean | null;
}

class CollectionsCache extends PaginatedEntityCache<
  CollectionsCacheState,
  { sources: string[]; tags: string[] }
> {
  constructor() {
    super({
      entityFilter: { kind: 'Component', 'spec.type': 'ansible-collection' },
      extractFilters: getUniqueFilters,
      buildState: (base, filters, prev) => ({
        ...base,
        allSources: ['All', ...filters.sources],
        allTags: ['All', ...filters.tags],
        syncStatusMap: prev?.syncStatusMap ?? {},
        hasConfiguredSources: prev?.hasConfiguredSources ?? null,
      }),
      createEmptyState: () => ({
        entities: [],
        totalServerItems: 0,
        loadedOffset: 0,
        isFullyLoaded: false,
        allSources: ['All'],
        allTags: ['All'],
        syncStatusMap: {},
        hasConfiguredSources: null,
        lastUpdated: Date.now(),
        error: null,
      }),
    });
  }

  updateSyncStatus(
    syncStatusMap: SyncStatusMap,
    hasConfiguredSources: boolean | null,
  ): void {
    const current = this.getInternalState();
    if (current) {
      this.setInternalState({ ...current, syncStatusMap, hasConfiguredSources });
    } else {
      this.setInternalState({
        entities: [],
        totalServerItems: 0,
        loadedOffset: 0,
        isFullyLoaded: false,
        allSources: ['All'],
        allTags: ['All'],
        syncStatusMap,
        hasConfiguredSources,
        lastUpdated: Date.now(),
        error: null,
      });
    }
  }

  getResumeOffset(): number {
    return this.getInternalState()?.loadedOffset ?? 0;
  }

  getTotalServerItems(): number {
    return this.getInternalState()?.totalServerItems ?? 0;
  }
}

export const collectionsCache = new CollectionsCache();
