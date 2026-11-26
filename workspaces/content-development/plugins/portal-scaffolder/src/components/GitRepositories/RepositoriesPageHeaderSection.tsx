import type { ReactNode } from 'react';
import { CatalogSyncHeader } from '../common';
import type { SyncProgressEntry } from '../common';
import { REPO_TOOLTIP, REPO_DESCRIPTION } from './constants';

interface RepositoriesPageHeaderSectionProps {
  onSyncClick: () => void;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
  syncInProgress?: boolean;
  syncProgress?: SyncProgressEntry[];
  /** Extra action buttons rendered in the header alongside the sync button. */
  actions?: ReactNode;
  /** Override page title (e.g. CI Activity tab chrome). */
  title?: string;
  /** Override page description under the title. */
  description?: string;
}

export const RepositoriesPageHeaderSection = ({
  onSyncClick,
  syncDisabled = false,
  syncDisabledReason,
  syncInProgress = false,
  syncProgress,
  actions,
  title = 'Git Repositories',
  description = REPO_DESCRIPTION,
}: RepositoriesPageHeaderSectionProps) => (
  <CatalogSyncHeader
    title={title}
    tooltip={REPO_TOOLTIP}
    description={description}
    onSyncClick={onSyncClick}
    syncDisabled={syncDisabled}
    syncDisabledReason={syncDisabledReason}
    syncInProgress={syncInProgress}
    syncProgress={syncProgress}
    actions={actions}
  />
);
