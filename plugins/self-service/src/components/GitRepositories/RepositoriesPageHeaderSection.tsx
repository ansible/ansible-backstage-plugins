import { PageHeaderSection } from '../common';
import type { SyncProgressEntry } from '../common';
import {
  REPO_TOOLTIP,
  REPO_DESCRIPTION,
  CONTENT_QUALITY_TOOLTIP,
  CONTENT_QUALITY_DESCRIPTION,
} from './constants';

interface RepositoriesPageHeaderSectionProps {
  onSyncClick: () => void;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
  syncInProgress?: boolean;
  syncProgress?: SyncProgressEntry[];
  /** ADR-010: optional actions from gitRepositoriesExtensionsApiRef (e.g. APME Add repository). */
  extensionHeaderActions?: React.ReactNode;
  /** When set, overrides the default Git Repositories page header copy. */
  title?: string;
  tooltip?: string;
  description?: string;
}

export const RepositoriesPageHeaderSection = ({
  onSyncClick,
  syncDisabled = false,
  syncDisabledReason,
  syncInProgress = false,
  syncProgress,
  extensionHeaderActions,
  title = 'Git Repositories',
  tooltip = REPO_TOOLTIP,
  description = REPO_DESCRIPTION,
}: RepositoriesPageHeaderSectionProps) => (
  <PageHeaderSection
    title={title}
    tooltip={tooltip}
    description={description}
    onSyncClick={onSyncClick}
    syncDisabled={syncDisabled}
    syncDisabledReason={syncDisabledReason}
    extraHeaderActions={extensionHeaderActions}
    syncInProgress={syncInProgress}
    syncProgress={syncProgress}
  />
);
