/* eslint-disable no-console */
import { useEffect, useRef, useCallback, useState } from 'react';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { useNotifications, ShowNotificationOptions } from '../notifications';
import {
  SYNC_COMPLETED_CATEGORY,
  SYNC_STARTED_CATEGORY,
  SYNC_FAILED_CATEGORY,
  TRACKING_TIMEOUT_MS,
  FAST_POLL_INTERVAL_MS,
  SLOW_POLL_INTERVAL_MS,
} from './constants';

interface ProviderStatus {
  sourceId: string;
  repository?: string;
  scmProvider?: string;
  hostName?: string;
  organization?: string;
  providerName?: string;
  syncInProgress: boolean;
  lastSyncTime: string | null;
  lastSyncStatus: 'success' | 'failure' | null;
  collectionsFound: number;
  collectionsDelta: number;
}

interface TrackedSync {
  sourceId: string;
  displayName: string;
  startedAt: number;
  lastSyncTimeAtStart: string | null;
}

function buildSyncCompletedMessage(
  sourceName: string,
  collectionsFound: number,
  collectionsDelta: number,
  isFirstSync: boolean,
): string {
  const collectionWord = collectionsFound === 1 ? 'collection' : 'collections';
  const baseMessage = `${collectionsFound} ${collectionWord} synced from ${sourceName}`;

  if (isFirstSync) {
    return `${baseMessage}.`;
  }

  let deltaText: string;
  if (collectionsDelta > 0) {
    deltaText = `+${collectionsDelta} since last sync`;
  } else if (collectionsDelta < 0) {
    deltaText = `${collectionsDelta} since last sync`;
  } else {
    deltaText = 'no change since last sync';
  }

  return `${baseMessage} (${deltaText}).`;
}

export function useSyncStatusPolling() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const { showNotification } = useNotifications();

  const [isSyncInProgress, setIsSyncInProgress] = useState(false);
  const trackedSyncsRef = useRef<Map<string, TrackedSync>>(new Map());
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const isCheckingRef = useRef(false);

  const showNotificationRef =
    useRef<(options: ShowNotificationOptions) => string>(showNotification);

  useEffect(() => {
    showNotificationRef.current = showNotification;
  }, [showNotification]);

  const fetchSyncStatus = useCallback(async (): Promise<ProviderStatus[]> => {
    try {
      const baseUrl = await discoveryApi.getBaseUrl('catalog');
      const response = await fetchApi.fetch(
        `${baseUrl}/ansible/sync/status?ansible_contents=true`,
      );

      if (!response.ok) {
        console.error('Failed to fetch sync status:', response.status);
        return [];
      }

      const data = await response.json();
      return data.content?.providers || [];
    } catch (error) {
      console.error('Error fetching sync status:', error);
      return [];
    }
  }, [discoveryApi, fetchApi]);

  const checkSyncStatus = useCallback(async (): Promise<boolean> => {
    if (isCheckingRef.current) {
      return false;
    }
    isCheckingRef.current = true;

    try {
      const providers = await fetchSyncStatus();
      const anyInProgress = providers.some(p => p.syncInProgress);
      setIsSyncInProgress(anyInProgress);

      const trackedSyncs = trackedSyncsRef.current;
      const now = Date.now();

      for (const [sourceId, tracked] of trackedSyncs.entries()) {
        const provider = providers.find(p => p.sourceId === sourceId);

        if (!provider) {
          trackedSyncs.delete(sourceId);
          continue;
        }

        const syncCompleted =
          !provider.syncInProgress &&
          provider.lastSyncTime !== tracked.lastSyncTimeAtStart;

        const trackingTimedOut = now - tracked.startedAt > TRACKING_TIMEOUT_MS;

        if (syncCompleted) {
          if (provider.lastSyncStatus === 'success') {
            const isFirstSync = tracked.lastSyncTimeAtStart === null;

            const message = buildSyncCompletedMessage(
              tracked.displayName,
              provider.collectionsFound,
              provider.collectionsDelta,
              isFirstSync,
            );

            showNotificationRef.current({
              title: 'Sync completed',
              description: message,
              severity: 'success',
              category: SYNC_COMPLETED_CATEGORY,
              dismissCategories: [SYNC_STARTED_CATEGORY],
            });
          } else if (provider.lastSyncStatus === 'failure') {
            showNotificationRef.current({
              title: 'Sync failed',
              description: `Failed to sync content from ${tracked.displayName}.`,
              severity: 'error',
              category: SYNC_FAILED_CATEGORY,
              dismissCategories: [SYNC_STARTED_CATEGORY],
              autoHideDuration: 0,
            });
          }
          trackedSyncs.delete(sourceId);
        } else if (trackingTimedOut) {
          console.warn(
            `Notification tracking timed out for ${tracked.displayName}`,
          );
          trackedSyncs.delete(sourceId);
        }
      }

      return anyInProgress;
    } finally {
      isCheckingRef.current = false;
    }
  }, [fetchSyncStatus]);

  const scheduleNextPoll = useCallback(
    (anyInProgress: boolean) => {
      if (!isMountedRef.current) return;

      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }

      const interval = anyInProgress
        ? FAST_POLL_INTERVAL_MS
        : SLOW_POLL_INTERVAL_MS;

      pollTimerRef.current = setTimeout(async () => {
        if (!isMountedRef.current) return;
        const stillInProgress = await checkSyncStatus();
        scheduleNextPoll(stillInProgress);
      }, interval);
    },
    [checkSyncStatus],
  );

  const startTracking = useCallback(
    (
      syncs: Array<{
        sourceId: string;
        displayName: string;
        lastSyncTime: string | null;
      }>,
    ) => {
      const now = Date.now();

      for (const sync of syncs) {
        trackedSyncsRef.current.set(sync.sourceId, {
          sourceId: sync.sourceId,
          displayName: sync.displayName,
          startedAt: now,
          lastSyncTimeAtStart: sync.lastSyncTime,
        });
      }

      checkSyncStatus().then(anyInProgress => {
        scheduleNextPoll(anyInProgress);
      });
    },
    [checkSyncStatus, scheduleNextPoll],
  );

  useEffect(() => {
    isMountedRef.current = true;

    checkSyncStatus().then(anyInProgress => {
      if (isMountedRef.current) {
        scheduleNextPoll(anyInProgress);
      }
    });

    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [checkSyncStatus, scheduleNextPoll]);

  return {
    isSyncInProgress,
    startTracking,
  };
}
