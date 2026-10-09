import { useEffect, useRef } from 'react';
import { useEntityList } from '@backstage/plugin-catalog-react';
import { addTemplatesCatalogInvalidateListener } from './invalidation';
import {
  isRefreshOffset,
  resolveCatalogOffset,
  toRefreshOffset,
} from './offsetRefresh';

/**
 * Listens for {@link invalidateTemplatesCatalog} and re-queries the current
 * page without remounting EntityListProvider (pagination + card DOM stay put).
 *
 * Invalidation defers one macrotask (`setTimeout(0)`) so JT state that bumps
 * `createHomeCatalogApi` in the same turn commits before the sentinel offset runs.
 */
export const SoftRefresh = () => {
  const { offset, setOffset, loading } = useEntityList();
  const offsetRef = useRef(offset);
  const setOffsetRef = useRef(setOffset);
  /** Real page offset to restore after the sentinel refetch finishes. */
  const restoreOffsetRef = useRef<number | null>(null);
  /** Coalesce burst invalidations into one deferred refresh. */
  const pendingTimerRef = useRef<number | null>(null);

  offsetRef.current = offset;
  setOffsetRef.current = setOffset;

  useEffect(() => {
    const unsubscribe = addTemplatesCatalogInvalidateListener(() => {
      if (pendingTimerRef.current !== null) {
        return;
      }
      pendingTimerRef.current = window.setTimeout(() => {
        pendingTimerRef.current = null;
        const applyOffset = setOffsetRef.current;
        // Skip if unmounted or a refresh is already in flight.
        if (!applyOffset || restoreOffsetRef.current !== null) {
          return;
        }
        const current = resolveCatalogOffset(offsetRef.current);
        restoreOffsetRef.current = current;
        applyOffset(toRefreshOffset(current));
      }, 0);
    });

    return () => {
      unsubscribe();
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const restore = restoreOffsetRef.current;
    if (loading || restore === null || !setOffset) {
      return;
    }
    if (!isRefreshOffset(offset)) {
      restoreOffsetRef.current = null;
      return;
    }

    restoreOffsetRef.current = null;
    setOffset(restore);
  }, [loading, offset, setOffset]);

  return null;
};
