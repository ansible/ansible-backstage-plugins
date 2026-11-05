import { useRef } from 'react';
import type { Entity } from '@backstage/catalog-model';
import { isRefreshOffset, resolveCatalogOffset } from './offsetRefresh';

export type StaleWhileRevalidateResult = {
  displayEntities: Entity[];
  displayTotalCount: number;
  displayOffset: number;
  showInitialSkeleton: boolean;
  isRefreshing: boolean;
};

/**
 * Stale-while-revalidate for EntityListProvider pages: keep the last good
 * page visible while a soft refresh (or catalog loading) is in flight.
 */
export function useStaleWhileRevalidate({
  entities,
  totalItems,
  offset,
  loading,
}: {
  entities: Entity[];
  totalItems: number | undefined;
  offset: number | undefined;
  loading: boolean;
}): StaleWhileRevalidateResult {
  const viewOffset = resolveCatalogOffset(offset);
  const snapshotRef = useRef({
    entities,
    totalCount: totalItems ?? 0,
    viewOffset,
  });

  const refreshing = loading || isRefreshOffset(offset);
  if (!refreshing) {
    snapshotRef.current = {
      entities,
      totalCount: totalItems ?? 0,
      viewOffset,
    };
  }

  const snapshot = snapshotRef.current;
  const showInitialSkeleton = loading && snapshot.entities.length === 0;

  return {
    displayEntities: snapshot.entities,
    displayTotalCount: snapshot.totalCount,
    displayOffset: snapshot.viewOffset,
    showInitialSkeleton,
    isRefreshing: refreshing && !showInitialSkeleton,
  };
}
