import { useState, useCallback } from 'react';
import { Page, Content } from '@backstage/core-components';
import { matchPath, Navigate, useLocation } from 'react-router-dom';
import type { PropsWithChildren } from 'react';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { collectionsViewPermission } from '@ansible/backstage-rhaap-common/permissions';

import { PageHeaderSection } from './PageHeaderSection';
import { CollectionDetailsPage } from './CollectionDetailsPage';
import { SyncDialog, StartedSyncInfo } from '../common';
import { CollectionsContent } from './CollectionsListPage';
import { useSyncStatusPolling } from '../../hooks';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
} from '../notifications';

export const CollectionsCatalogPage = () => {
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [hasConfiguredSources, setHasConfiguredSources] = useState<
    boolean | null
  >(null);
  const { isSyncInProgress, syncProgress, startTracking } =
    useSyncStatusPolling();

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
          syncInProgress={isSyncInProgress}
          syncProgress={syncProgress}
        />
        <CollectionsContent
          onSyncClick={handleSyncClick}
          onSourcesStatusChange={handleSourcesStatusChange}
          syncDisabled={syncDisabled}
          syncDisabledReason={syncDisabledReason}
          syncInProgress={isSyncInProgress}
          syncProgress={syncProgress}
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

export const SELF_SERVICE_COLLECTIONS = '/self-service/collections';

const resolveCollectionsRouteElement = (pathname: string) => {
  if (
    pathname === SELF_SERVICE_COLLECTIONS ||
    pathname === `${SELF_SERVICE_COLLECTIONS}/`
  ) {
    return <CollectionsCatalogPage />;
  }
  if (
    matchPath(
      { path: '/self-service/collections/:collectionName', end: true },
      pathname,
    ) ||
    matchPath({ path: ':collectionName', end: true }, pathname)
  ) {
    return <CollectionDetailsPage />;
  }
  return <Navigate to={SELF_SERVICE_COLLECTIONS} replace />;
};

const CollectionsPageProviders = ({ children }: PropsWithChildren) => (
  <RequirePermission permission={collectionsViewPermission}>
    <NotificationProvider>{children}</NotificationProvider>
  </RequirePermission>
);

const CollectionsRoutesContent = () => {
  const { pathname } = useLocation();
  const { notifications, removeNotification } = useNotifications();

  return (
    <>
      {resolveCollectionsRouteElement(pathname)}
      <NotificationStack
        notifications={notifications}
        onClose={removeNotification}
      />
    </>
  );
};

/** RHDH 2.1 NFS: list and detail paths without `/self-service/collections/*` splat. */
export const CollectionsSectionPage = () => (
  <CollectionsPageProviders>
    <CollectionsRoutesContent />
  </CollectionsPageProviders>
);

/**
 * Standalone route wrapper used by the dynamic plugin mount at /self-service/collections.
 * Scalprum / RHDH 1.10: mounted once at `/self-service/collections/*`.
 */
export const CollectionsRoutesPage = () => (
  <CollectionsPageProviders>
    <CollectionsRoutesContent />
  </CollectionsPageProviders>
);
