import { Entity } from '@backstage/catalog-model';
import { CatalogApi } from '@backstage/plugin-catalog-react';
import { SyncStatusMap } from '../common';
import { getUniqueFilters } from './utils';

export interface CollectionsCacheState {
  entities: Entity[];
  totalServerItems: number;
  loadedOffset: number;
  isFullyLoaded: boolean;
  allSources: string[];
  allTags: string[];
  syncStatusMap: SyncStatusMap;
  hasConfiguredSources: boolean | null;
  lastUpdated: number;
  error: string | null;
}

type CacheUpdateListener = (state: CollectionsCacheState) => void;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const INITIAL_FETCH_LIMIT = 50;
const BACKGROUND_FETCH_LIMIT = 200;

class CollectionsCache {
  private state: CollectionsCacheState | null = null;
  private loadingPromise: Promise<void> | null = null;
  private catalogApi: CatalogApi | null = null;
  private readonly listeners: Set<CacheUpdateListener> = new Set();

  getState(): CollectionsCacheState | null {
    if (!this.state) return null;

    // check if cache is still valid within TTL
    const now = Date.now();
    if (now - this.state.lastUpdated > CACHE_TTL_MS) {
      this.clear();
      return null;
    }

    return this.state;
  }

  hasData(): boolean {
    return this.state !== null && this.state.entities.length > 0;
  }

  isFullyLoaded(): boolean {
    return this.state?.isFullyLoaded ?? false;
  }

  isLoading(): boolean {
    return this.loadingPromise !== null;
  }

  // subscribe to cache updates
  subscribe(listener: CacheUpdateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const currentState = this.state;
    if (currentState) {
      this.listeners.forEach(listener => listener(currentState));
    }
  }

  // initialize the cache
  async startLoading(catalogApi: CatalogApi): Promise<void> {
    this.catalogApi = catalogApi;

    // if already loading, wait for existing promise
    if (this.loadingPromise !== null) {
      await this.loadingPromise;
      return;
    }

    if (this.state && this.isFullyLoaded()) {
      return;
    }

    // continue from where we left off if partial data exists
    if (this.state && this.state.loadedOffset > 0) {
      await this.continueBackgroundLoading();
      return;
    }

    this.loadingPromise = this.performInitialLoad();
    await this.loadingPromise;
  }

  private async performInitialLoad(): Promise<void> {
    if (!this.catalogApi) return;

    try {
      const response = await this.catalogApi.queryEntities({
        filter: { kind: 'Component', 'spec.type': 'ansible-collection' },
        limit: INITIAL_FETCH_LIMIT,
      });

      const items = response?.items || [];
      const total = response?.totalItems ?? items.length;

      const { sources, tags } = getUniqueFilters(items);
      this.state = {
        entities: items,
        totalServerItems: total,
        loadedOffset: items.length,
        isFullyLoaded: items.length >= total,
        allSources: ['All', ...sources],
        allTags: ['All', ...tags],
        syncStatusMap: this.state?.syncStatusMap ?? {},
        hasConfiguredSources: this.state?.hasConfiguredSources ?? null,
        lastUpdated: Date.now(),
        error: null,
      };

      this.notifyListeners();

      // continue loading in background
      if (items.length < total) {
        this.continueBackgroundLoading();
      } else {
        this.loadingPromise = null;
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch collections';

      this.state = {
        entities: [],
        totalServerItems: 0,
        loadedOffset: 0,
        isFullyLoaded: false,
        allSources: ['All'],
        allTags: ['All'],
        syncStatusMap: this.state?.syncStatusMap ?? {},
        hasConfiguredSources: this.state?.hasConfiguredSources ?? null,
        lastUpdated: Date.now(),
        error: errorMessage,
      };

      this.notifyListeners();
      this.loadingPromise = null;
    }
  }

  private async continueBackgroundLoading(): Promise<void> {
    if (!this.catalogApi || !this.state || this.state.isFullyLoaded) {
      this.loadingPromise = null;
      return;
    }

    if (
      this.loadingPromise !== null &&
      this.state.loadedOffset > INITIAL_FETCH_LIMIT
    ) {
      await this.loadingPromise;
      return;
    }

    const loadPromise = (async () => {
      if (!this.catalogApi || !this.state) return;

      let allItems = [...this.state.entities];
      let offset = this.state.loadedOffset;
      const total = this.state.totalServerItems;

      try {
        while (offset < total) {
          const response = await this.catalogApi.queryEntities({
            filter: { kind: 'Component', 'spec.type': 'ansible-collection' },
            limit: BACKGROUND_FETCH_LIMIT,
            offset,
          });

          const newItems = response?.items || [];
          if (newItems.length === 0) break;

          allItems = [...allItems, ...newItems];
          offset += newItems.length;

          const { sources, tags } = getUniqueFilters(allItems);
          this.state = {
            ...this.state,
            entities: allItems,
            loadedOffset: offset,
            isFullyLoaded: offset >= total,
            allSources: ['All', ...sources],
            allTags: ['All', ...tags],
            lastUpdated: Date.now(),
          };

          this.notifyListeners();
        }

        if (this.state) {
          this.state = {
            ...this.state,
            isFullyLoaded: true,
            lastUpdated: Date.now(),
          };
          this.notifyListeners();
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('Error loading remaining collections:', err);
        }
      } finally {
        this.loadingPromise = null;
      }
    })();

    this.loadingPromise = loadPromise;
    await loadPromise;
  }

  updateSyncStatus(
    syncStatusMap: SyncStatusMap,
    hasConfiguredSources: boolean | null,
  ): void {
    if (this.state) {
      this.state = {
        ...this.state,
        syncStatusMap,
        hasConfiguredSources,
      };
    } else {
      this.state = {
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
      };
    }
  }

  clear(): void {
    this.state = null;
    this.loadingPromise = null;
    this.catalogApi = null;
    this.listeners.clear();
  }

  getResumeOffset(): number {
    return this.state?.loadedOffset ?? 0;
  }

  getTotalServerItems(): number {
    return this.state?.totalServerItems ?? 0;
  }
}

export const collectionsCache = new CollectionsCache();
