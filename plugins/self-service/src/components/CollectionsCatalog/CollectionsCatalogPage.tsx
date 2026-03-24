import { useState, useCallback } from 'react';
import { Page, Content } from '@backstage/core-components';
import { Navigate, Route, Routes } from 'react-router-dom';

import { PageHeaderSection } from './PageHeaderSection';
import { CollectionDetailsPage } from './CollectionDetailsPage';
import { SyncDialog, StartedSyncInfo } from '../common';
import { CollectionsContent } from './CollectionsListPage';
import { useSyncStatusPolling } from '../../hooks';

export const CollectionsCatalogPage = () => {
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [hasConfiguredSources, setHasConfiguredSources] = useState<
    boolean | null
  >(null);
  const { isSyncInProgress, startTracking } = useSyncStatusPolling();

  const handleSyncClick = () => setSyncDialogOpen(true);

  const handleSourcesStatusChange = useCallback((status: boolean | null) => {
    setHasConfiguredSources(status);
  }, []);

  const handleSyncsStarted = useCallback(
    (syncs: StartedSyncInfo[]) => {
      startTracking(syncs);
    },
    [startTracking],
  );

  const syncDisabled = hasConfiguredSources === false || isSyncInProgress;

  let syncDisabledReason: string | undefined;
  if (hasConfiguredSources === false) {
    syncDisabledReason = 'No content sources configured';
  } else if (isSyncInProgress) {
    syncDisabledReason = 'Sync in progress';
  }

  return (
    <Page themeId="app">
      <Content>
        <PageHeaderSection
          onSyncClick={handleSyncClick}
          syncDisabled={syncDisabled}
          syncDisabledReason={syncDisabledReason}
        />
        <CollectionsContent
          onSyncClick={handleSyncClick}
          onSourcesStatusChange={handleSourcesStatusChange}
          syncDisabled={syncDisabled}
          syncDisabledReason={syncDisabledReason}
        />
        <SyncDialog
          open={syncDialogOpen}
          onClose={() => setSyncDialogOpen(false)}
          onSyncsStarted={handleSyncsStarted}
        />
      </Content>
    </Page>
  );
};

// Standalone route wrapper used by the dynamic plugin mount at /self-service/collections
// so detail URLs like /self-service/collections/:collectionName resolve correctly.
export const CollectionsRoutesPage = () => {
  return (
    <Routes>
      <Route index element={<CollectionsCatalogPage />} />
      <Route path=":collectionName" element={<CollectionDetailsPage />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
};
