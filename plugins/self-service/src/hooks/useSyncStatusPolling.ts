import { useEffect, useState, useCallback } from 'react';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { syncPollingService } from '../components/notifications/syncPollingService';
import type { StartedSyncInfo } from '../components/common';

/**
 * Hook that provides sync status polling functionality.
 * Uses the global syncPollingService to ensure polling continues
 * even when navigating between pages.
 *
 * Calls `syncPollingService.initialize` on each mount (idempotent) so a dead
 * poll loop can re-arm when the self-service shell (RouteView) effect does
 * not re-run after in-app navigation.
 */
export function useSyncStatusPolling() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const [isSyncInProgress, setIsSyncInProgress] = useState(
    syncPollingService.getIsSyncInProgress(),
  );

  useEffect(() => {
    syncPollingService.initialize(discoveryApi, fetchApi);
  }, [discoveryApi, fetchApi]);

  useEffect(() => {
    const unsubscribe = syncPollingService.subscribe(inProgress => {
      setIsSyncInProgress(inProgress);
    });

    return unsubscribe;
  }, []);

  const startTracking = useCallback((syncs: StartedSyncInfo[]) => {
    syncPollingService.startTracking(syncs);
  }, []);

  return {
    isSyncInProgress,
    startTracking,
  };
}
