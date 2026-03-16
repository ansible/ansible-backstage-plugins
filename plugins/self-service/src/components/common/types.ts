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
}
