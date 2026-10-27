import { SyncPollingService } from '@ansible/portal-plugin-sdk';
import { notificationStore } from './notificationStore';

// Keep this plugin's polling state and notification destination independent.
export const syncPollingService = new SyncPollingService(notificationStore);
