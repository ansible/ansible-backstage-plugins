import { useState, useCallback, useEffect, useRef } from 'react';
import { Entity } from '@backstage/catalog-model';
import { CatalogApi } from '@backstage/plugin-catalog-react';
import { BaseCacheState, CachePublicApi } from './types';

export interface UseCacheSubscriptionOptions<TState extends BaseCacheState> {
  cache: CachePublicApi<TState>;
  catalogApi: CatalogApi;
  onCacheUpdate?: (state: TState) => void;
  onInitialData?: (state: TState) => void;
  fallbackErrorMessage?: string;
}

export interface UseCacheSubscriptionResult<TState extends BaseCacheState> {
  allEntities: Entity[];
  initialLoading: boolean;
  loadingMore: boolean;
  error: string | null;
  isMountedRef: React.MutableRefObject<boolean>;
  fetchInitial: () => Promise<void>;
  cacheState: TState | null;
}

export function useCacheSubscription<TState extends BaseCacheState>({
  cache,
  catalogApi,
  onCacheUpdate,
  onInitialData,
  fallbackErrorMessage = 'Failed to fetch entities',
}: UseCacheSubscriptionOptions<TState>): UseCacheSubscriptionResult<TState> {
  const cachedState = cache.getState();

  const [allEntities, setAllEntities] = useState<Entity[]>(
    cachedState?.entities ?? [],
  );
  const [initialLoading, setInitialLoading] = useState(
    !cachedState?.entities.length,
  );
  const [loadingMore, setLoadingMore] = useState(
    cache.isLoading() && !cache.isFullyLoaded(),
  );
  const [error, setError] = useState<string | null>(null);
  const [cacheState, setCacheState] = useState<TState | null>(cachedState);

  const isMountedRef = useRef(true);
  const onCacheUpdateRef = useRef(onCacheUpdate);
  onCacheUpdateRef.current = onCacheUpdate;
  const onInitialDataRef = useRef(onInitialData);
  onInitialDataRef.current = onInitialData;

  useEffect(() => {
    const unsubscribe = cache.subscribe(state => {
      if (isMountedRef.current) {
        setAllEntities(state.entities);
        setCacheState(state);
        setLoadingMore(!state.isFullyLoaded && cache.isLoading());
        if (state.error) {
          setError(state.error);
          setInitialLoading(false);
        }
        onCacheUpdateRef.current?.(state);
      }
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchInitial = useCallback(async () => {
    const cached = cache.getState();
    if (cached && cached.entities.length > 0) {
      setAllEntities(cached.entities);
      setCacheState(cached);
      setInitialLoading(false);
      setLoadingMore(!cached.isFullyLoaded && cache.isLoading());
      onInitialDataRef.current?.(cached);

      if (!cached.isFullyLoaded) {
        cache.startLoading(catalogApi);
      }
      return;
    }

    setInitialLoading(true);
    setError(null);

    try {
      await cache.startLoading(catalogApi);

      if (!isMountedRef.current) return;

      const state = cache.getState();
      if (state) {
        setAllEntities(state.entities);
        setCacheState(state);
        setLoadingMore(!state.isFullyLoaded && cache.isLoading());
        onInitialDataRef.current?.(state);
      }
      setInitialLoading(false);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : fallbackErrorMessage);
      setInitialLoading(false);
    }
  }, [cache, catalogApi, fallbackErrorMessage]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchInitial();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchInitial]);

  return {
    allEntities,
    initialLoading,
    loadingMore,
    error,
    isMountedRef,
    fetchInitial,
    cacheState,
  };
}
