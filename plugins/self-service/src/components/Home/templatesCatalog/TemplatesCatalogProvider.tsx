import { useMemo, type ReactNode } from 'react';
import { ApiProvider } from '@backstage/core-app-api';
import { useApi, useApiHolder } from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  EntityListProvider,
} from '@backstage/plugin-catalog-react';
import { PAGE_SIZE } from '../constants';
import { createOverridingApiHolder } from '../createOverridingApiHolder';
import { createHomeCatalogApi } from './createHomeCatalogApi';
import { SoftRefresh } from './SoftRefresh';

type TemplatesCatalogProviderProps = {
  children: ReactNode;
  jobTemplateIds: number[];
  selectedSources: string[];
  /** Remount boundary — only source-filter changes, not JT sync. */
  listKey: string;
};

/**
 * Scopes EntityListProvider to the user's JT visibility set.
 * `listKey` remounts only on source-filter changes; SoftRefresh re-queries
 * the current page in place after JT sync (no EntityListProvider remount).
 */
export const TemplatesCatalogProvider = ({
  children,
  jobTemplateIds,
  selectedSources,
  listKey,
}: TemplatesCatalogProviderProps) => {
  const parentApis = useApiHolder();
  const catalogApi = useApi(catalogApiRef);
  const homeCatalogApi = useMemo(
    () => createHomeCatalogApi(catalogApi, jobTemplateIds, selectedSources),
    [catalogApi, jobTemplateIds, selectedSources],
  );
  const apis = useMemo(
    () =>
      createOverridingApiHolder(parentApis, [[catalogApiRef, homeCatalogApi]]),
    [parentApis, homeCatalogApi],
  );

  return (
    <ApiProvider apis={apis}>
      <EntityListProvider
        key={listKey}
        pagination={{ mode: 'offset', limit: PAGE_SIZE }}
      >
        <SoftRefresh />
        {children}
      </EntityListProvider>
    </ApiProvider>
  );
};
