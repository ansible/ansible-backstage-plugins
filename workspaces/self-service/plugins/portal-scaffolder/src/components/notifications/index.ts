// ─── Re-exports from @ansible/backstage-rhaap-react ──────────────────────────
// Pure UI notification components — single source of truth.
export {
  NotificationCard,
  NotificationStack,
} from '@ansible/portal-plugin-sdk';
export type {
  Notification,
  NotificationSeverity,
  NotificationCardProps,
  NotificationStackProps,
  ShowNotificationOptions,
} from '@ansible/portal-plugin-sdk';

// ─── Self-service singletons (must NOT be shimmed — module-level state) ───────
// Shimming these would create two separate instances and break runtime behaviour.
export { NotificationProvider, useNotifications } from './NotificationContext';
export type { NotificationContextValue } from './types';
export { notificationStore } from './notificationStore';
export { syncPollingService } from './syncPollingService';
