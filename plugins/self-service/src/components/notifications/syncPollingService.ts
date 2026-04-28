import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { notificationStore } from './notificationStore';
import {
  SYNC_COMPLETED_CATEGORY,
  SYNC_FAILED_CATEGORY,
  SYNC_FINISHED_CATEGORY,
  SYNC_STARTED_CATEGORY,
  FAST_POLL_INTERVAL_MS,
  SLOW_POLL_INTERVAL_MS,
  TRACKING_TIMEOUT_MS,
} from '../common/constants';
import type {
  StartedSyncInfo,
  SyncOutcome,
  SyncProgressEntry,
} from '../common/types';
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
  lastFailedSyncTime?: string | null;
  collectionsFound: number;
  collectionsDelta: number;
}

interface TrackedSync {
  sourceId: string;
  displayName: string;
  startedAt: number;
  lastSyncTimeAtStart: string | null;
  lastSyncStatusAtStart: 'success' | 'failure' | null;
  lastFailedSyncTimeAtStart: string | null;
}

type SyncStatusListener = (isSyncInProgress: boolean) => void;
type SyncProgressListener = (entries: SyncProgressEntry[]) => void;

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

function displayNameFromProvider(p: ProviderStatus): string {
  if (p.repository) return `PAH:${p.repository}`;
  const parts = [p.hostName, p.organization].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  return parts.length > 0 ? parts.join(':') : p.sourceId;
}

function providerFinishedRunSinceLastPoll(
  prev: { lastSyncTime: string | null; syncInProgress: boolean } | undefined,
  curr: { lastSyncTime: string | null; syncInProgress: boolean },
): boolean {
  if (curr.syncInProgress || !prev) {
    return false;
  }
  return curr.lastSyncTime !== prev.lastSyncTime || prev.syncInProgress;
}

class SyncPollingService {
  private discoveryApi: DiscoveryApi | null = null;
  private fetchApi: FetchApi | null = null;
  private readonly trackedSyncs: Map<string, TrackedSync> = new Map();
  private providerSyncSnapshot = new Map<
    string,
    { lastSyncTime: string | null; syncInProgress: boolean }
  >();
  private providerSyncBaselineCaptured = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private pollLoopStarted = false;
  private pollGeneration = 0;
  private checkSyncStatusInFlight: Promise<boolean> | null = null;
  private isSyncInProgress = false;
  private readonly listeners: Set<SyncStatusListener> = new Set();
  private readonly syncProgress: Map<string, SyncProgressEntry> = new Map();
  private readonly progressListeners: Set<SyncProgressListener> = new Set();
  /** Display names for which a sync-outcome notification has already been sent
   *  in the current session. Prevents duplicate toasts regardless of which
   *  code path (tracked / untracked / timing race) fires first. Cleared on
   *  each new {@link startTracking} call and on {@link clear}. */
  private readonly notifiedDisplayNames: Set<string> = new Set();

  private isCurrentGeneration(gen: number): boolean {
    return gen === this.pollGeneration;
  }

  initialize(discoveryApi: DiscoveryApi, fetchApi: FetchApi): void {
    this.discoveryApi = discoveryApi;
    this.fetchApi = fetchApi;

    const startPollChain = () => {
      const gen = this.pollGeneration;
      this.checkSyncStatus().then(anyInProgress => {
        if (!this.isCurrentGeneration(gen)) {
          return;
        }
        this.scheduleNextPoll(anyInProgress);
      });
    };

    if (!this.pollLoopStarted) {
      this.pollLoopStarted = true;
      startPollChain();
      return;
    }

    // Re-enter (e.g. new RouteView after navigation): loop should already be
    // running. If the timer chain stopped while pollLoopStarted is true, restart.
    if (this.pollTimer === null && this.checkSyncStatusInFlight === null) {
      startPollChain();
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

  subscribeProgress(listener: SyncProgressListener): () => void {
    this.progressListeners.add(listener);
    listener(Array.from(this.syncProgress.values()));
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  getSyncProgress(): SyncProgressEntry[] {
    return Array.from(this.syncProgress.values());
  }

  private notifyProgressListeners(): void {
    const entries = Array.from(this.syncProgress.values());
    this.progressListeners.forEach(listener => listener(entries));
  }

  private setSyncProgressOutcome(sourceId: string, outcome: SyncOutcome): void {
    const entry = this.syncProgress.get(sourceId);
    if (entry) {
      this.syncProgress.set(sourceId, { ...entry, outcome });
    }
  }

  private async fetchSyncStatus(): Promise<{
    providers: ProviderStatus[];
    contentSyncInProgress?: boolean;
  } | null> {
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
      const providers = (data.content?.providers ?? []) as ProviderStatus[];
      const contentSyncInProgress =
        typeof data.content?.syncInProgress === 'boolean'
          ? data.content.syncInProgress
          : undefined;
      return { providers, contentSyncInProgress };
    } catch {
      return null;
    }
  }

  private updateInProgressFromProviders(
    providers: ProviderStatus[],
    contentSyncInProgress?: boolean,
  ): boolean {
    const anyProviderInProgress = providers.some(p => p.syncInProgress);
    const aggregateInProgress =
      typeof contentSyncInProgress === 'boolean'
        ? contentSyncInProgress || anyProviderInProgress
        : anyProviderInProgress;
    const effectiveInProgress =
      aggregateInProgress || this.trackedSyncs.size > 0;

    if (this.isSyncInProgress !== effectiveInProgress) {
      this.isSyncInProgress = effectiveInProgress;
      this.notifyListeners();
    }
    return aggregateInProgress;
  }

  private notifyTrackedFailure(
    sourceId: string,
    displayName: string,
    description: string,
  ): void {
    this.setSyncProgressOutcome(sourceId, 'failure');
    this.notifyProgressListeners();
    if (!this.notifiedDisplayNames.has(displayName)) {
      this.notifiedDisplayNames.add(displayName);
      notificationStore.showNotification({
        title: 'Sync failed',
        description,
        severity: 'error',
        category: SYNC_FAILED_CATEGORY,
        dismissCategories: [SYNC_STARTED_CATEGORY],
        autoHideDuration: 0,
      });
    }
  }

  private showSyncOutcome(
    provider: ProviderStatus,
    displayName: string,
    isFirstSync: boolean,
  ): void {
    let outcome: SyncOutcome = 'ambiguous';
    if (provider.lastSyncStatus === 'success') {
      outcome = 'success';
    } else if (provider.lastSyncStatus === 'failure') {
      outcome = 'failure';
    }
    this.setSyncProgressOutcome(provider.sourceId, outcome);
    this.notifyProgressListeners();

    if (this.notifiedDisplayNames.has(displayName)) {
      return;
    }
    this.notifiedDisplayNames.add(displayName);

    if (provider.lastSyncStatus === 'success') {
      notificationStore.showNotification({
        title: 'Sync completed',
        description: buildSyncCompletedMessage(
          displayName,
          provider.collectionsFound,
          provider.collectionsDelta,
          isFirstSync,
        ),
        severity: 'success',
        category: SYNC_COMPLETED_CATEGORY,
        dismissCategories: [SYNC_STARTED_CATEGORY],
      });
      return;
    }
    if (provider.lastSyncStatus === 'failure') {
      notificationStore.showNotification({
        title: 'Sync failed',
        description: `Failed to sync content from ${displayName}.`,
        severity: 'error',
        category: SYNC_FAILED_CATEGORY,
        dismissCategories: [SYNC_STARTED_CATEGORY],
        autoHideDuration: 0,
      });
      return;
    }
    notificationStore.showNotification({
      title: 'Sync finished',
      description: `Catalog did not report a clear success or failure for ${displayName}.`,
      severity: 'warning',
      category: SYNC_FINISHED_CATEGORY,
      dismissCategories: [SYNC_STARTED_CATEGORY],
      autoHideDuration: 20000,
    });
  }

  private showTrackedSyncOutcome(
    provider: ProviderStatus,
    tracked: TrackedSync,
  ): void {
    this.showSyncOutcome(
      provider,
      tracked.displayName,
      tracked.lastSyncTimeAtStart === null,
    );
  }

  /**
   * When provider payloads are unavailable (fetch failed or non-2xx), still
   * remove entries past {@link TRACKING_TIMEOUT_MS} so isSyncInProgress
   * cannot stay true indefinitely from stale local tracking.
   *
   * Shows the same timeout failure toast as the normal timeout path in
   * {@link processTrackedSyncCompletions} so users are not left with a silently
   * dismissed progress indicator.
   *
   * @returns `true` if at least one entry was evicted (caller should invalidate
   * the collections cache).
   */
  private evictTimedOutTrackedSyncs(now: number): boolean {
    let anyEvicted = false;
    for (const [sourceId, tracked] of this.trackedSyncs.entries()) {
      if (now - tracked.startedAt > TRACKING_TIMEOUT_MS) {
        this.notifyTrackedFailure(
          sourceId,
          tracked.displayName,
          `Could not confirm sync completion for ${tracked.displayName} within the expected time.`,
        );
        this.trackedSyncs.delete(sourceId);
        anyEvicted = true;
      }
    }
    return anyEvicted;
  }

  private processTrackedSyncCompletions(
    providers: ProviderStatus[],
    now: number,
  ): void {
    let anyTrackedSyncCompleted = false;

    for (const [sourceId, tracked] of this.trackedSyncs.entries()) {
      const provider = providers.find(p => p.sourceId === sourceId);

      if (!provider) {
        this.notifyTrackedFailure(
          sourceId,
          tracked.displayName,
          `Source is no longer available in the catalog for ${tracked.displayName}.`,
        );
        this.trackedSyncs.delete(sourceId);
        anyTrackedSyncCompleted = true;
        continue;
      }

      const prevSnapshot = this.providerSyncSnapshot.get(sourceId);
      const providerFailedTime = provider.lastFailedSyncTime ?? null;
      const catalogAdvancedSinceTrackingStart =
        provider.lastSyncTime !== tracked.lastSyncTimeAtStart ||
        (provider.lastSyncStatus ?? null) !== tracked.lastSyncStatusAtStart ||
        providerFailedTime !== tracked.lastFailedSyncTimeAtStart;
      const terminalFailure =
        !provider.syncInProgress &&
        provider.lastSyncStatus === 'failure' &&
        catalogAdvancedSinceTrackingStart;
      const syncCompleted =
        terminalFailure ||
        (!provider.syncInProgress &&
          provider.lastSyncStatus !== 'failure' &&
          (provider.lastSyncTime !== tracked.lastSyncTimeAtStart ||
            providerFinishedRunSinceLastPoll(prevSnapshot, provider)));

      const trackingTimedOut = now - tracked.startedAt > TRACKING_TIMEOUT_MS;

      if (syncCompleted) {
        anyTrackedSyncCompleted = true;
        this.showTrackedSyncOutcome(provider, tracked);
        this.trackedSyncs.delete(sourceId);
      } else if (trackingTimedOut) {
        this.notifyTrackedFailure(
          sourceId,
          tracked.displayName,
          `Could not confirm sync completion for ${tracked.displayName} within the expected time.`,
        );
        this.trackedSyncs.delete(sourceId);
        anyTrackedSyncCompleted = true;
      }
    }

    if (anyTrackedSyncCompleted) {
      collectionsCache.invalidateFetchedData();
    }
  }

  private checkUntrackedProviderFinishedRuns(
    providers: ProviderStatus[],
    trackedProvidersAtStart: Set<string>,
  ): void {
    if (!this.providerSyncBaselineCaptured) {
      this.providerSyncBaselineCaptured = true;
      return;
    }

    let anyFinished = false;
    for (const p of providers) {
      if (trackedProvidersAtStart.has(p.sourceId)) {
        continue;
      }
      const prev = this.providerSyncSnapshot.get(p.sourceId);
      if (!prev) {
        continue;
      }
      if (providerFinishedRunSinceLastPoll(prev, p)) {
        this.showSyncOutcome(p, displayNameFromProvider(p), false);
        anyFinished = true;
      }
    }
    if (anyFinished) {
      collectionsCache.invalidateFetchedData();
    }
  }

  private replaceProviderSnapshot(providers: ProviderStatus[]): void {
    this.providerSyncSnapshot = new Map(
      providers.map(p => [
        p.sourceId,
        { lastSyncTime: p.lastSyncTime, syncInProgress: p.syncInProgress },
      ]),
    );
  }

  /**
   * After a page refresh, `trackedSyncs` and `syncProgress` are empty even
   * though the catalog API may still report providers as in-progress.  This
   * method adds a synthetic `pending` entry to `syncProgress` for every
   * in-progress provider that has no existing entry (tracked or otherwise).
   * Those entries are later updated to their final outcome by
   * `showSyncOutcome` when `checkUntrackedProviderFinishedRuns` detects
   * the run finishing on a subsequent poll.
   */
  private backfillProgressFromInProgressProviders(
    providers: ProviderStatus[],
  ): void {
    let changed = false;
    for (const p of providers) {
      if (p.syncInProgress && !this.syncProgress.has(p.sourceId)) {
        this.syncProgress.set(p.sourceId, {
          sourceId: p.sourceId,
          displayName: displayNameFromProvider(p),
          outcome: 'pending',
        });
        changed = true;
      }
    }
    if (changed) {
      this.notifyProgressListeners();
    }
  }

  private checkSyncStatus(): Promise<boolean> {
    if (this.checkSyncStatusInFlight !== null) {
      return this.checkSyncStatusInFlight;
    }

    const genAtStart = this.pollGeneration;

    const inFlightRef: { promise: Promise<boolean> | null } = {
      promise: null,
    };
    inFlightRef.promise = (async (): Promise<boolean> => {
      try {
        const fetched = await this.fetchSyncStatus();
        if (!this.isCurrentGeneration(genAtStart)) {
          return this.isSyncInProgress;
        }
        if (fetched === null) {
          const anyEvicted = this.evictTimedOutTrackedSyncs(Date.now());
          if (anyEvicted) {
            collectionsCache.invalidateFetchedData();
            this.updateInProgressFromProviders([], undefined);
          }
          return this.isSyncInProgress || this.trackedSyncs.size > 0;
        }

        const { providers, contentSyncInProgress } = fetched;

        const trackedProvidersAtStart = new Set(this.trackedSyncs.keys());
        this.processTrackedSyncCompletions(providers, Date.now());
        this.checkUntrackedProviderFinishedRuns(
          providers,
          trackedProvidersAtStart,
        );
        this.backfillProgressFromInProgressProviders(providers);
        this.replaceProviderSnapshot(providers);

        const anyInProgress = this.updateInProgressFromProviders(
          providers,
          contentSyncInProgress,
        );

        return anyInProgress || this.trackedSyncs.size > 0;
      } finally {
        if (this.checkSyncStatusInFlight === inFlightRef.promise) {
          this.checkSyncStatusInFlight = null;
        }
      }
    })();

    this.checkSyncStatusInFlight = inFlightRef.promise;
    return inFlightRef.promise;
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

  startTracking(syncs: StartedSyncInfo[]): void {
    if (syncs.length === 0) {
      return;
    }

    this.syncProgress.clear();
    this.notifiedDisplayNames.clear();
    for (const sync of syncs) {
      this.syncProgress.set(sync.sourceId, {
        sourceId: sync.sourceId,
        displayName: sync.displayName,
        outcome: 'pending',
      });
    }
    this.notifyProgressListeners();

    const now = Date.now();

    for (const sync of syncs) {
      this.trackedSyncs.set(sync.sourceId, {
        sourceId: sync.sourceId,
        displayName: sync.displayName,
        startedAt: now,
        lastSyncTimeAtStart: sync.lastSyncTime,
        lastSyncStatusAtStart: sync.lastSyncStatus ?? null,
        lastFailedSyncTimeAtStart: sync.lastFailedSyncTime ?? null,
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
    this.syncProgress.clear();
    this.notifiedDisplayNames.clear();
    this.providerSyncSnapshot.clear();
    this.providerSyncBaselineCaptured = false;
    this.checkSyncStatusInFlight = null;
    this.isSyncInProgress = false;
    this.listeners.clear();
    this.progressListeners.clear();
    this.discoveryApi = null;
    this.fetchApi = null;
  }
}

export const syncPollingService = new SyncPollingService();
