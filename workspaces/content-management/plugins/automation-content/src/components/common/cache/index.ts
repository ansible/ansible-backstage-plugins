// Re-exports from the shared Portal plugin SDK.
// The implementations in this directory are kept for reference but are no
// longer the active source.
export {
  PaginatedEntityCache,
  useCacheSubscription,
  usePagination,
} from '@ansible/portal-plugin-sdk';
export type {
  BaseCacheState,
  CacheUpdateListener,
  CacheConfig,
  CachePublicApi,
  UseCacheSubscriptionOptions,
  UseCacheSubscriptionResult,
  UsePaginationOptions,
  UsePaginationResult,
} from '@ansible/portal-plugin-sdk';
