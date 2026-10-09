import { useEffect, useRef } from 'react';
import { useEntityList } from '@backstage/plugin-catalog-react';
import { addTemplatesCatalogInvalidateListener } from './invalidation';
import {
  isRefreshOffset,
  resolveCatalogOffset,
  toRefreshOffset,
  writeCatalogOffsetToUrl,
} from './offsetRefresh';

/**
 * Listens for {@link invalidateTemplatesCatalog} and re-queries the current
 * page without remounting EntityListProvider (pagination + card DOM stay put).
 *
 * Invalidation defers one macrotask (`setTimeout(0)`) so JT state that bumps
 * `createHomeCatalogApi` in the same turn commits before the sentinel offset runs.
 *
 * Invalidates that arrive while a refresh is in flight set a dirty flag and
 * re-queue after restore. Sentinel offsets are stripped from the URL so
 * EntityListProvider's offset→URL sync does not leak `?offset=1e9+n`.
 */
export const SoftRefresh = () => {
  const { offset, setOffset, loading } = useEntityList();
  const offsetRef = useRef(offset);
  const setOffsetRef = useRef(setOffset);
  /** Real page offset to restore after the sentinel refetch finishes. */
  const restoreOffsetRef = useRef<number | null>(null);
  /** Coalesce burst invalidations into one deferred refresh. */
  const pendingTimerRef = useRef<number | null>(null);
  /** Invalidation arrived while a sentinel refresh was in flight. */
  const dirtyRef = useRef(false);
  const urlRewriteTimerRef = useRef<number | null>(null);

  offsetRef.current = offset;
  setOffsetRef.current = setOffset;

  const scheduleRefresh = () => {
    if (pendingTimerRef.current !== null) {
      return;
    }
    pendingTimerRef.current = window.setTimeout(() => {
      pendingTimerRef.current = null;
      const applyOffset = setOffsetRef.current;
      if (!applyOffset) {
        return;
      }
      if (restoreOffsetRef.current !== null) {
        dirtyRef.current = true;
        return;
      }
      const current = resolveCatalogOffset(offsetRef.current);
      restoreOffsetRef.current = current;
      applyOffset(toRefreshOffset(current));
    }, 0);
  };

  useEffect(() => {
    const unsubscribe = addTemplatesCatalogInvalidateListener(() => {
      if (restoreOffsetRef.current !== null) {
        dirtyRef.current = true;
      }
      // Always schedule; timer no-ops into dirty if a refresh is already in flight.
      scheduleRefresh();
    });

    return () => {
      unsubscribe();
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      if (urlRewriteTimerRef.current !== null) {
        window.clearTimeout(urlRewriteTimerRef.current);
        urlRewriteTimerRef.current = null;
      }
    };
  }, []);

  // Reload / share-link safety: sentinel left in URL must not stick.
  useEffect(() => {
    if (restoreOffsetRef.current !== null || !setOffset) {
      return;
    }
    if (!isRefreshOffset(offset)) {
      return;
    }
    const real = resolveCatalogOffset(offset);
    setOffset(real);
    writeCatalogOffsetToUrl(real);
    // Mount-only hydrate from a stale sentinel URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional once on mount
  }, []);

  // EntityListProvider writes offset→URL after child effects; defer rewrite.
  useEffect(() => {
    if (!isRefreshOffset(offset)) {
      return undefined;
    }
    const real = resolveCatalogOffset(offset);
    urlRewriteTimerRef.current = window.setTimeout(() => {
      urlRewriteTimerRef.current = null;
      writeCatalogOffsetToUrl(real);
    }, 0);
    return () => {
      if (urlRewriteTimerRef.current !== null) {
        window.clearTimeout(urlRewriteTimerRef.current);
        urlRewriteTimerRef.current = null;
      }
    };
  }, [offset]);

  useEffect(() => {
    const restore = restoreOffsetRef.current;
    if (loading || restore === null || !setOffset) {
      return;
    }
    if (!isRefreshOffset(offset)) {
      restoreOffsetRef.current = null;
      if (dirtyRef.current) {
        dirtyRef.current = false;
        scheduleRefresh();
      }
      return;
    }

    restoreOffsetRef.current = null;
    setOffset(restore);
    writeCatalogOffsetToUrl(restore);
    if (dirtyRef.current) {
      dirtyRef.current = false;
      scheduleRefresh();
    }
  }, [loading, offset, setOffset]);

  return null;
};
