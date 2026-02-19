export type SyncNotificationSeverity = 'info' | 'success' | 'error' | 'warning';

export type SyncNotificationCategory =
  | 'sync-started'
  | 'sync-completed'
  | 'sync-failed'
  | 'general';

export interface SyncNotification {
  id: string;
  title: string;
  description?: string;
  sources?: string[];
  severity: SyncNotificationSeverity;
  collapsible?: boolean;
  timestamp: Date;
  autoHideDuration?: number;
  category?: SyncNotificationCategory;
}

export interface SyncNotificationContextValue {
  notifications: SyncNotification[];
  addNotification: (
    notification: Omit<SyncNotification, 'id' | 'timestamp'>,
  ) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  showSyncStarted: (sources: string[]) => string;
  showSyncCompleted: (sourceName: string) => string;
  showSyncFailed: (sourceName: string, error?: string) => string;
}

export interface SyncNotificationCardProps {
  notification: SyncNotification;
  onClose: (id: string) => void;
}

export interface SyncNotificationStackProps {
  notifications: SyncNotification[];
  onClose: (id: string) => void;
}
