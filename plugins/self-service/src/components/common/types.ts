export interface SyncStatus {
  lastSyncTime: string | null;
  lastFailedSyncTime: string | null;
}

export type SyncStatusMap = Record<string, SyncStatus>;

export type SourcesTree = Record<string, Record<string, string[]>>;

export interface SyncFilter {
  scmProvider?: string;
  hostName?: string;
  organization?: string;
}

export interface StartedSyncInfo {
  sourceId: string;
  displayName: string;
  lastSyncTime: string | null;
  /** From `/ansible/sync/status` when sync starts; used to ignore stale catalog failure rows. */
  lastSyncStatus: 'success' | 'failure' | null;
  lastFailedSyncTime: string | null;
}

/**
 * Per-source outcome within an active or recently completed sync batch.
 *
 * - `pending`   — sync has been requested but the catalog has not yet reported
 *                 a terminal status for this source.
 * - `success`   — catalog reported `lastSyncStatus === 'success'`.
 * - `failure`   — catalog reported `lastSyncStatus === 'failure'` (terminal),
 *                 or the source disappeared from the catalog, or tracking timed
 *                 out before a terminal status was observed.
 * - `ambiguous` — the provider's run finished (syncInProgress → false) but
 *                 `lastSyncStatus` is `null` — the catalog did not record a
 *                 clear success or failure result. Shown as "Sync finished" in
 *                 the UI with a warning-level toast.
 */
export type SyncOutcome = 'pending' | 'success' | 'failure' | 'ambiguous';

export interface SyncProgressEntry {
  sourceId: string;
  displayName: string;
  outcome: SyncOutcome;
}

export interface SyncDialogProps {
  open: boolean;
  onClose: () => void;
  onSyncsStarted?: (syncs: StartedSyncInfo[]) => void;
}

export interface EmptyStateProps {
  onSyncClick?: () => void;
  hasConfiguredSources?: boolean | null;
  repositoryFilter?: boolean;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
  syncInProgress?: boolean;
  syncProgress?: SyncProgressEntry[];
}
