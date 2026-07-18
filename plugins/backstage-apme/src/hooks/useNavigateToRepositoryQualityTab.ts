/*
 * Copyright Red Hat
 */

import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Entity } from '@backstage/catalog-model';

export type NavigateRepositoryQualityTabOptions = {
  /** When true, Quality tab auto-starts a scan (via `scan=1` query param). */
  triggerScan?: boolean;
};

/** Switch to the repository Quality tab (in-place or via self-service route). */
export function useNavigateToRepositoryQualityTab(entity?: Entity) {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  return useCallback(
    (
      entityName?: string,
      options?: NavigateRepositoryQualityTabOptions,
    ) => {
      const slug = entityName ?? entity?.metadata?.name;
      const query = new URLSearchParams();
      query.set('tab', 'quality');
      if (options?.triggerScan) {
        query.set('scan', '1');
      }
      if (
        slug &&
        window.location.pathname.includes(`/repositories/${slug}`)
      ) {
        setSearchParams(query, { replace: true });
        return;
      }
      if (slug) {
        navigate(`/self-service/repositories/${slug}?${query.toString()}`);
      }
    },
    [entity?.metadata?.name, navigate, setSearchParams],
  );
}
