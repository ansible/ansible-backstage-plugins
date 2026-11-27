import { useEffect, type ReactNode } from 'react';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { DynamicExtensionDiscovery } from '@ansible/portal-extension-host';
import { automationContentManifest } from '../manifest';
import { invalidateCollections } from './CollectionsCatalog/collectionsInvalidation';
import { gitReposCache } from './GitRepositories/gitReposCache';
import { syncPollingService } from './notifications';

/** Shared lifecycle and extension discovery for the moved content catalog pages. */
export function ContentCatalogBoundary({
  children,
}: Readonly<{ children: ReactNode }>) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  useEffect(() => {
    syncPollingService.initialize(discoveryApi, fetchApi);
  }, [discoveryApi, fetchApi]);

  useEffect(() => {
    const unsubscribeCollections = syncPollingService.addInvalidator(() =>
      invalidateCollections(),
    );
    const unsubscribeRepositories = syncPollingService.addInvalidator(() =>
      gitReposCache.invalidateFetchedData(),
    );

    return () => {
      unsubscribeCollections();
      unsubscribeRepositories();
    };
  }, []);

  return (
    <>
      <DynamicExtensionDiscovery manifests={[automationContentManifest]} />
      {children}
    </>
  );
}
