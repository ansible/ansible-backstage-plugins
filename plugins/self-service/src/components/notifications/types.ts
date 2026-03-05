export type NotificationSeverity = 'info' | 'success' | 'error' | 'warning';

export interface Notification {
  id: string;
  title: string;
  description?: string;
  items?: string[];
  severity: NotificationSeverity;
  collapsible?: boolean;
  timestamp: Date;
  autoHideDuration?: number;
  category?: string;
  isExiting?: boolean;
}

export interface ShowNotificationOptions {
  title: string;
  description?: string;
  items?: string[];
  severity?: NotificationSeverity;
  collapsible?: boolean;
  category?: string;
  autoHideDuration?: number;
  dismissCategories?: string[];
}

export interface NotificationContextValue {
  notifications: Notification[];
  showNotification: (options: ShowNotificationOptions) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

export interface NotificationCardProps {
  notification: Notification;
  onClose: (id: string) => void;
}

export interface NotificationStackProps {
  notifications: Notification[];
  onClose: (id: string) => void;
}
