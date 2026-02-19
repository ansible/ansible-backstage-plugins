import { useState, useCallback } from 'react';
import { Page, Content } from '@backstage/core-components';

import { PageHeaderSection } from './PageHeaderSection';
import { SyncDialog } from './SyncDialog';
import { CollectionsContent } from './CollectionsListPage';
import {
  SyncNotificationProvider,
  SyncNotificationStack,
  useSyncNotifications,
} from './notifications';

const CollectionsCatalogPageInner = () => {
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [hasConfiguredSources, setHasConfiguredSources] = useState<
    boolean | null
  >(null);
  const { notifications, removeNotification } = useSyncNotifications();

  const handleSyncClick = () => setSyncDialogOpen(true);

  const handleSourcesStatusChange = useCallback((status: boolean | null) => {
    setHasConfiguredSources(status);
  }, []);

  const syncDisabled = hasConfiguredSources === false;

  return (
    <Page themeId="app">
      <Content>
        <PageHeaderSection
          onSyncClick={handleSyncClick}
          syncDisabled={syncDisabled}
        />
        <CollectionsContent
          onSyncClick={handleSyncClick}
          onSourcesStatusChange={handleSourcesStatusChange}
        />
        <SyncDialog
          open={syncDialogOpen}
          onClose={() => setSyncDialogOpen(false)}
        />
      </Content>
      <SyncNotificationStack
        notifications={notifications}
        onClose={removeNotification}
      />
    </Page>
  );
};

export const CollectionsCatalogPage = () => {
  return (
    <SyncNotificationProvider>
      <CollectionsCatalogPageInner />
    </SyncNotificationProvider>
  );
};
