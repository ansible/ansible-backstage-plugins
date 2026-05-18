import { Entity } from '@backstage/catalog-model';
import { CatalogApi } from '@backstage/plugin-catalog-react';

export interface BaseCacheState {
  entities: Entity[];
  totalServerItems: number;
  loadedOffset: number;
  isFullyLoaded: boolean;
  lastUpdated: number;
  error: string | null;
}

export type CacheUpdateListener<TState extends BaseCacheState> = (
  state: TState,
) => void;

export interface CacheConfig<TState extends BaseCacheState, TFilters> {
  entityFilter: Record<string, string>;
  extractFilters: (entities: Entity[]) => TFilters;
  buildState: (
    base: BaseCacheState,
    filters: TFilters,
    previousState: TState | null,
  ) => TState;
  createEmptyState: () => TState;
}

export interface CachePublicApi<TState extends BaseCacheState> {
  getState(): TState | null;
  hasData(): boolean;
  isFullyLoaded(): boolean;
  isLoading(): boolean;
  subscribe(listener: CacheUpdateListener<TState>): () => void;
  invalidateFetchedData(): void;
  startLoading(catalogApi: CatalogApi): Promise<void>;
  clear(): void;
}
