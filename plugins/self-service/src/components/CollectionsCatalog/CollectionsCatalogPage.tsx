import { useState, useCallback } from 'react';
import { Page, Content } from '@backstage/core-components';

import { PageHeaderSection } from './PageHeaderSection';
import { SyncDialog } from './SyncDialog';
import { CollectionsContent } from './CollectionsListPage';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
} from '../notifications';
import { useSyncStatusPolling } from './useSyncStatusPolling';
import { StartedSyncInfo } from './types';

const CollectionsCatalogPageInner = () => {
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [hasConfiguredSources, setHasConfiguredSources] = useState<
    boolean | null
  >(null);
  const { notifications, removeNotification } = useNotifications();
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
        />
        <SyncDialog
          open={syncDialogOpen}
          onClose={() => setSyncDialogOpen(false)}
          onSyncsStarted={handleSyncsStarted}
        />
      </Content>
      <NotificationStack
        notifications={notifications}
        onClose={removeNotification}
      />
    </Page>
  );
};

export const CollectionsCatalogPage = () => {
  return (
    <NotificationProvider>
      <CollectionsCatalogPageInner />
    </NotificationProvider>
  );
};
