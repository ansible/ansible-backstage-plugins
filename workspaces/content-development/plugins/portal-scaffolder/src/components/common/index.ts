// ─── Re-exports from @ansible/backstage-rhaap-react ──────────────────────────
// UI components — single source of truth going forward.
export {
  EntityLinkButton,
  ScmIntegrationAuthError,
  SkeletonLoader,
  SyncDialog,
  SyncProgressPopover,
} from '@ansible/portal-plugin-sdk';
export type {
  PageHeaderSectionProps,
  EmptyStateProps,
  SyncDialogProps,
} from '@ansible/portal-plugin-sdk';

export {
  CatalogSyncHeader,
  CollectionsEmptyState,
  CatalogSyncButton,
  CONFIGURATION_DOCS_URL,
} from '@ansible/plugin-automation-content';
export type {
  CatalogSyncHeaderProps,
  CollectionsEmptyStateProps,
} from '@ansible/plugin-automation-content';

// Icons
export { GitLabIcon, RedHatIcon } from '@ansible/portal-plugin-sdk';

// Styles
export {
  usePageHeaderStyles,
  useSharedStyles,
  useShellPageStyles,
} from '@ansible/portal-plugin-sdk';

// Sync types
export type {
  SyncStatus,
  SyncStatusMap,
  SyncFilter,
  StartedSyncInfo,
  SyncOutcome,
  SyncProgressEntry,
} from '@ansible/portal-plugin-sdk';

// Sync constants
export {
  SYNC_STARTED_CATEGORY,
  SYNC_COMPLETED_CATEGORY,
  SYNC_FAILED_CATEGORY,
  SYNC_FINISHED_CATEGORY,
  SYNC_WARNING_CATEGORY,
  FAST_POLL_INTERVAL_MS,
  SLOW_POLL_INTERVAL_MS,
  TRACKING_TIMEOUT_MS,
} from '@ansible/portal-plugin-sdk';

// Cache utilities
export * from './cache';

// ─── Self-service–specific (not in backstage-rhaap-react) ─────────────────────
export {
  fetchReadmeFromBackend,
  fetchGitFileContentFromBackend,
} from '@ansible/plugin-automation-content';
export type {
  FetchReadmeParams,
  FetchGitFileOutcome,
} from '@ansible/plugin-automation-content';
export { SCM_INTEGRATION_AUTH_FAILED_CODE } from '@ansible/backstage-rhaap-common/constants';
export type { SourcesTree } from './types';
