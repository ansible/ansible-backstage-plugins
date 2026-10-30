import { useEffect, useRef } from 'react';
import { useEntityList } from '@backstage/plugin-catalog-react';
import { addTemplatesCatalogInvalidateListener } from './invalidation';
import {
  isRefreshOffset,
  resolveCatalogOffset,
  writeCatalogOffsetToUrl,
} from './offsetRefresh';

/** Refresh the current catalog page without remounting or changing pagination. */
export const SoftRefresh = () => {
  const { refresh, offset, setOffset } = useEntityList();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let pendingTimer: number | undefined;
    const unsubscribe = addTemplatesCatalogInvalidateListener(() => {
      if (pendingTimer !== undefined) return;
      // Let JT visibility state commit before querying, and coalesce bursts.
      pendingTimer = window.setTimeout(() => {
        pendingTimer = undefined;
        refreshRef.current?.();
      }, 0);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(pendingTimer);
    };
  }, []);

  // Normalize links saved by the previous sentinel-offset refresh mechanism.
  useEffect(() => {
    if (!isRefreshOffset(offset) || !setOffset) return;
    const real = resolveCatalogOffset(offset);
    setOffset(real);
    writeCatalogOffsetToUrl(real);
  }, [offset, setOffset]);

  return null;
};
