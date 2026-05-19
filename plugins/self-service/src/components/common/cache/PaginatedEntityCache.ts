import { Entity } from '@backstage/catalog-model';
import { CatalogApi } from '@backstage/plugin-catalog-react';
import { BaseCacheState, CacheUpdateListener, CacheConfig } from './types';

const CACHE_TTL_MS = 5 * 60 * 1000;
const INITIAL_FETCH_LIMIT = 50;
const BACKGROUND_FETCH_LIMIT = 200;

export class PaginatedEntityCache<
  TState extends BaseCacheState,
  TFilters = unknown,
> {
  private state: TState | null = null;
  private loadingPromise: Promise<void> | null = null;
  protected catalogApi: CatalogApi | null = null;
  private readonly listeners: Set<CacheUpdateListener<TState>> = new Set();
  private fetchEpoch = 0;
  private readonly config: CacheConfig<TState, TFilters>;

  constructor(config: CacheConfig<TState, TFilters>) {
    this.config = config;
  }

  private expireData(): void {
    this.fetchEpoch++;
    this.state = null;
    this.loadingPromise = null;
  }

  getState(): TState | null {
    if (!this.state) return null;

    const now = Date.now();
    if (now - this.state.lastUpdated > CACHE_TTL_MS) {
      this.expireData();
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

  subscribe(listener: CacheUpdateListener<TState>): () => void {
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

  private clearLoadingPromiseIfCurrent(epoch: number): void {
    if (epoch === this.fetchEpoch) {
      this.loadingPromise = null;
    }
  }

  invalidateFetchedData(): void {
    this.fetchEpoch++;
    this.state = null;
    this.loadingPromise = null;
    if (this.catalogApi) {
      void this.startLoading(this.catalogApi);
    }
  }

  async startLoading(catalogApi: CatalogApi): Promise<void> {
    this.catalogApi = catalogApi;

    if (this.loadingPromise !== null) {
      await this.loadingPromise;
      return;
    }

    if (this.state && this.isFullyLoaded()) {
      return;
    }

    if (this.state && this.state.loadedOffset > 0) {
      await this.continueBackgroundLoading();
      return;
    }

    this.loadingPromise = this.performInitialLoad();
    await this.loadingPromise;
  }

  private async performInitialLoad(): Promise<void> {
    if (!this.catalogApi) return;
    const epoch = this.fetchEpoch;

    try {
      const response = await this.catalogApi.queryEntities({
        filter: this.config.entityFilter,
        limit: INITIAL_FETCH_LIMIT,
        orderFields: [{ field: 'metadata.uid', order: 'asc' }],
      });

      if (epoch !== this.fetchEpoch) return;

      const items = response?.items || [];
      const total = response?.totalItems ?? items.length;
      const filters = this.config.extractFilters(items);

      this.state = this.config.buildState(
        {
          entities: items,
          totalServerItems: total,
          loadedOffset: items.length,
          isFullyLoaded: items.length >= total,
          lastUpdated: Date.now(),
          error: null,
        },
        filters,
        this.state,
      );

      this.notifyListeners();

      if (items.length < total) {
        this.continueBackgroundLoading();
      } else {
        this.clearLoadingPromiseIfCurrent(epoch);
      }
    } catch (err) {
      if (epoch !== this.fetchEpoch) return;

      const errorMessage =
        err instanceof Error && err.message
          ? err.message
          : 'Failed to fetch entities';

      const filters = this.config.extractFilters([]);
      this.state = this.config.buildState(
        {
          entities: [],
          totalServerItems: 0,
          loadedOffset: 0,
          isFullyLoaded: false,
          lastUpdated: Date.now(),
          error: errorMessage,
        },
        filters,
        this.state,
      );

      this.notifyListeners();
      this.clearLoadingPromiseIfCurrent(epoch);
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

    const loadPromise = this.fetchRemainingPages();
    this.loadingPromise = loadPromise;
    await loadPromise;
  }

  private async fetchRemainingPages(): Promise<void> {
    const epoch = this.fetchEpoch;
    if (!this.catalogApi || !this.state) return;

    const allItems = [...this.state.entities];
    let offset = this.state.loadedOffset;
    const total = this.state.totalServerItems;

    try {
      while (offset < total && epoch === this.fetchEpoch) {
        const response = await this.catalogApi.queryEntities({
          filter: this.config.entityFilter,
          limit: BACKGROUND_FETCH_LIMIT,
          offset,
          orderFields: [{ field: 'metadata.uid', order: 'asc' }],
        });

        if (epoch !== this.fetchEpoch) break;

        const newItems = response?.items || [];
        if (newItems.length === 0) break;

        allItems.push(...newItems);
        offset += newItems.length;

        this.updateStateWithItems(allItems, offset, total, epoch);
      }

      this.markFullyLoaded(epoch);
    } catch (err) {
      this.handleBackgroundError(err, epoch);
    } finally {
      this.clearLoadingPromiseIfCurrent(epoch);
    }
  }

  private updateStateWithItems(
    allItems: Entity[],
    offset: number,
    total: number,
    epoch: number,
  ): void {
    if (epoch !== this.fetchEpoch || !this.state) return;

    const filters = this.config.extractFilters(allItems);
    this.state = this.config.buildState(
      {
        ...this.state,
        entities: allItems,
        loadedOffset: offset,
        isFullyLoaded: offset >= total,
        lastUpdated: Date.now(),
      },
      filters,
      this.state,
    );
    this.notifyListeners();
  }

  private markFullyLoaded(epoch: number): void {
    if (epoch !== this.fetchEpoch || !this.state) return;

    this.state = {
      ...this.state,
      isFullyLoaded: true,
      lastUpdated: Date.now(),
    };
    this.notifyListeners();
  }

  private handleBackgroundError(err: unknown, epoch: number): void {
    if (epoch !== this.fetchEpoch || !this.state) return;

    const errorMessage =
      err instanceof Error && err.message
        ? err.message
        : 'Failed to load remaining entities';
    this.state = {
      ...this.state,
      error: errorMessage,
      lastUpdated: Date.now(),
    };
    this.notifyListeners();
  }

  clear(): void {
    this.fetchEpoch++;
    this.state = null;
    this.loadingPromise = null;
    this.catalogApi = null;
    this.listeners.clear();
  }

  protected getInternalState(): TState | null {
    return this.state;
  }

  protected setInternalState(state: TState): void {
    this.state = state;
  }
}
