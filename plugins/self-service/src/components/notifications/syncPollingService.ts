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
  private pollLoopStarted = false;
  private pollGeneration = 0;
  private isChecking = false;
  private isSyncInProgress = false;
  private readonly listeners: Set<SyncStatusListener> = new Set();

  private isCurrentGeneration(gen: number): boolean {
    return gen === this.pollGeneration;
  }

  initialize(discoveryApi: DiscoveryApi, fetchApi: FetchApi): void {
    this.discoveryApi = discoveryApi;
    this.fetchApi = fetchApi;

    if (this.pollLoopStarted) {
      return;
    }
    this.pollLoopStarted = true;

    const gen = this.pollGeneration;
    this.checkSyncStatus().then(anyInProgress => {
      if (!this.isCurrentGeneration(gen)) {
        return;
      }
      this.scheduleNextPoll(anyInProgress);
    });
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

  private async fetchSyncStatus(): Promise<ProviderStatus[] | null> {
    if (!this.discoveryApi || !this.fetchApi) {
      return null;
    }

    try {
      const baseUrl = await this.discoveryApi.getBaseUrl('catalog');
      const response = await this.fetchApi.fetch(
        `${baseUrl}/ansible/sync/status?ansible_contents=true`,
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.content?.providers ?? [];
    } catch {
      return null;
    }
  }

  private async checkSyncStatus(): Promise<boolean> {
    if (this.isChecking) {
      return this.isSyncInProgress;
    }
    const genAtStart = this.pollGeneration;
    this.isChecking = true;

    try {
      const providers = await this.fetchSyncStatus();
      if (!this.isCurrentGeneration(genAtStart)) {
        return this.isSyncInProgress;
      }
      if (providers === null) {
        return this.isSyncInProgress || this.trackedSyncs.size > 0;
      }

      const anyProviderInProgress = providers.some(p => p.syncInProgress);
      const effectiveInProgress =
        anyProviderInProgress || this.trackedSyncs.size > 0;

      if (this.isSyncInProgress !== effectiveInProgress) {
        this.isSyncInProgress = effectiveInProgress;
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
          collectionsCache.invalidateFetchedData();

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

      return anyProviderInProgress || this.trackedSyncs.size > 0;
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

    const gen = this.pollGeneration;
    this.pollTimer = setTimeout(async () => {
      if (!this.isCurrentGeneration(gen)) {
        return;
      }
      const stillInProgress = await this.checkSyncStatus();
      if (!this.isCurrentGeneration(gen)) {
        return;
      }
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

    const gen = this.pollGeneration;
    this.checkSyncStatus().then(anyInProgress => {
      if (!this.isCurrentGeneration(gen)) {
        return;
      }
      this.scheduleNextPoll(anyInProgress);
    });
  }

  clear(): void {
    this.pollGeneration += 1;
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.pollLoopStarted = false;
    this.trackedSyncs.clear();
    this.isSyncInProgress = false;
    this.listeners.clear();
    this.discoveryApi = null;
    this.fetchApi = null;
  }
}

export const syncPollingService = new SyncPollingService();
