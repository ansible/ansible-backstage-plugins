import { useEffect, useState, useCallback } from 'react';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { syncPollingService } from '../components/notifications/syncPollingService';

/**
 * Hook that provides sync status polling functionality.
 * Uses the global syncPollingService to ensure polling continues
 * even when navigating between pages.
 */
export function useSyncStatusPolling() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const [isSyncInProgress, setIsSyncInProgress] = useState(
    syncPollingService.getIsSyncInProgress(),
  );

  useEffect(() => {
    syncPollingService.initialize(discoveryApi, fetchApi);

    const unsubscribe = syncPollingService.subscribe(inProgress => {
      setIsSyncInProgress(inProgress);
    });

    return unsubscribe;
  }, [discoveryApi, fetchApi]);

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
