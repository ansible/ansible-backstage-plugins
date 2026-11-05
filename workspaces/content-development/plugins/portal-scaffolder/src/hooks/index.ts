// ─── Re-exports from @ansible/backstage-rhaap-react ──────────────────────────
export { useIsSuperuser } from '@ansible/portal-plugin-sdk';
export type { UseIsSuperuserResult } from '@ansible/portal-plugin-sdk';

// ─── Self-service–specific ────────────────────────────────────────────────────
// useSyncStatusPolling is kept here because it subscribes to the self-service
// syncPollingService singleton. Shimming it to backstage-rhaap-react would
// subscribe to that package's own (disconnected) polling instance.
export { useSyncStatusPolling } from './useSyncStatusPolling';
