import { useEffect, useState, useCallback } from 'react';
import { syncPollingService } from '../components/notifications/syncPollingService';

/**
 * Hook that provides sync status polling functionality.
 * Uses the global syncPollingService to ensure polling continues
 * even when navigating between pages.
 *
 * Initialization (`initialize` with discovery/fetch APIs) is owned by the app shell
 * (e.g. RouteView) so only one poll loop starts. This hook only subscribes to status.
 */
export function useSyncStatusPolling() {
  const [isSyncInProgress, setIsSyncInProgress] = useState(
    syncPollingService.getIsSyncInProgress(),
  );

  useEffect(() => {
    const unsubscribe = syncPollingService.subscribe(inProgress => {
      setIsSyncInProgress(inProgress);
    });

    return unsubscribe;
  }, []);

  const startTracking = useCallback(
    (
      syncs: Array<{
        sourceId: string;
        displayName: string;
        lastSyncTime: string | null;
      }>,
    ) => {
      syncPollingService.startTracking(syncs);
    },
    [],
  );

  return {
    isSyncInProgress,
    startTracking,
  };
}
