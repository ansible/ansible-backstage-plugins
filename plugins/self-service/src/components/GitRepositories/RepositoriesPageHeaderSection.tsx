import { PageHeaderSection } from '../common';
import type { SyncProgressEntry } from '../common';
import { REPO_TOOLTIP, REPO_DESCRIPTION } from './constants';

interface RepositoriesPageHeaderSectionProps {
  onSyncClick: () => void;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
  syncInProgress?: boolean;
  syncProgress?: SyncProgressEntry[];
  /** ADR-010: optional actions from gitRepositoriesExtensionsApiRef (e.g. APME Add repository). */
  extensionHeaderActions?: React.ReactNode;
}

export const RepositoriesPageHeaderSection = ({
  onSyncClick,
  syncDisabled = false,
  syncDisabledReason,
  syncInProgress = false,
  syncProgress,
  extensionHeaderActions,
}: RepositoriesPageHeaderSectionProps) => (
  <PageHeaderSection
    title="Git Repositories"
    tooltip={REPO_TOOLTIP}
    description={REPO_DESCRIPTION}
    onSyncClick={onSyncClick}
    syncDisabled={syncDisabled}
    syncDisabledReason={syncDisabledReason}
    extraHeaderActions={extensionHeaderActions}
    syncInProgress={syncInProgress}
    syncProgress={syncProgress}
  />
);
