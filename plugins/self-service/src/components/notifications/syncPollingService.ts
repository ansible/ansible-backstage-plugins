import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { notificationStore } from './notificationStore';
import {
  SYNC_COMPLETED_CATEGORY,
  SYNC_STARTED_CATEGORY,
  SYNC_FAILED_CATEGORY,
  TRACKING_TIMEOUT_MS,
  FAST_POLL_INTERVAL_MS,
  SLOW_POLL_INTERVAL_MS,
} from '../common/constants';
import { collectionsCache } from '../CollectionsCatalog/collectionsCache';

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

type SyncStatusListener = (isSyncInProgress: boolean) => void;

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

class SyncPollingService {
  private discoveryApi: DiscoveryApi | null = null;
  private fetchApi: FetchApi | null = null;
  private readonly trackedSyncs: Map<string, TrackedSync> = new Map();
  private pollTimer: NodeJS.Timeout | null = null;
  private isChecking = false;
  private isSyncInProgress = false;
  private readonly listeners: Set<SyncStatusListener> = new Set();

  initialize(discoveryApi: DiscoveryApi, fetchApi: FetchApi): void {
    const isFirstInit = this.discoveryApi === null;
    this.discoveryApi = discoveryApi;
    this.fetchApi = fetchApi;

    // start initial poll if not already polling or if this is the first init
    if (this.pollTimer === null || isFirstInit) {
      this.checkSyncStatus().then(anyInProgress => {
        this.scheduleNextPoll(anyInProgress);
      });
    }
  }

  subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.isSyncInProgress);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.isSyncInProgress));
  }

  getIsSyncInProgress(): boolean {
    return this.isSyncInProgress;
  }

  private async fetchSyncStatus(): Promise<ProviderStatus[]> {
    if (!this.discoveryApi || !this.fetchApi) {
      return [];
    }

    try {
      const baseUrl = await this.discoveryApi.getBaseUrl('catalog');
      const response = await this.fetchApi.fetch(
        `${baseUrl}/ansible/sync/status?ansible_contents=true`,
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.content?.providers || [];
    } catch {
      return [];
    }
  }

  private async checkSyncStatus(): Promise<boolean> {
    if (this.isChecking) {
      return this.isSyncInProgress;
    }
    this.isChecking = true;

    try {
      const providers = await this.fetchSyncStatus();
      const anyInProgress = providers.some(p => p.syncInProgress);

      if (this.isSyncInProgress !== anyInProgress) {
        this.isSyncInProgress = anyInProgress;
        this.notifyListeners();
      }

      const now = Date.now();

      for (const [sourceId, tracked] of this.trackedSyncs.entries()) {
        const provider = providers.find(p => p.sourceId === sourceId);

        if (!provider) {
          this.trackedSyncs.delete(sourceId);
          continue;
        }

        const syncCompleted =
          !provider.syncInProgress &&
          provider.lastSyncTime !== tracked.lastSyncTimeAtStart;

        const trackingTimedOut = now - tracked.startedAt > TRACKING_TIMEOUT_MS;

        if (syncCompleted) {
          // Invalidate the collections cache so new data is fetched
          collectionsCache.clear();

          if (provider.lastSyncStatus === 'success') {
            const isFirstSync = tracked.lastSyncTimeAtStart === null;

            const message = buildSyncCompletedMessage(
              tracked.displayName,
              provider.collectionsFound,
              provider.collectionsDelta,
              isFirstSync,
            );

            notificationStore.showNotification({
              title: 'Sync completed',
              description: message,
              severity: 'success',
              category: SYNC_COMPLETED_CATEGORY,
              dismissCategories: [SYNC_STARTED_CATEGORY],
            });
          } else if (provider.lastSyncStatus === 'failure') {
            notificationStore.showNotification({
              title: 'Sync failed',
              description: `Failed to sync content from ${tracked.displayName}.`,
              severity: 'error',
              category: SYNC_FAILED_CATEGORY,
              dismissCategories: [SYNC_STARTED_CATEGORY],
              autoHideDuration: 0,
            });
          }
          this.trackedSyncs.delete(sourceId);
        } else if (trackingTimedOut) {
          this.trackedSyncs.delete(sourceId);
        }
      }

      return anyInProgress;
    } finally {
      this.isChecking = false;
    }
  }

  private scheduleNextPoll(anyInProgress: boolean): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
    }

    const interval = anyInProgress
      ? FAST_POLL_INTERVAL_MS
      : SLOW_POLL_INTERVAL_MS;

    this.pollTimer = setTimeout(async () => {
      const stillInProgress = await this.checkSyncStatus();
      this.scheduleNextPoll(stillInProgress);
    }, interval);
  }

  startTracking(
    syncs: Array<{
      sourceId: string;
      displayName: string;
      lastSyncTime: string | null;
    }>,
  ): void {
    if (syncs.length === 0) {
      return;
    }

    const now = Date.now();

    for (const sync of syncs) {
      this.trackedSyncs.set(sync.sourceId, {
        sourceId: sync.sourceId,
        displayName: sync.displayName,
        startedAt: now,
        lastSyncTimeAtStart: sync.lastSyncTime,
      });
    }

    if (!this.isSyncInProgress) {
      this.isSyncInProgress = true;
      this.notifyListeners();
    }

    this.checkSyncStatus().then(anyInProgress => {
      this.scheduleNextPoll(anyInProgress);
    });
  }

  clear(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.trackedSyncs.clear();
    this.isSyncInProgress = false;
    this.listeners.clear();
    this.discoveryApi = null;
    this.fetchApi = null;
  }
}

export const syncPollingService = new SyncPollingService();
