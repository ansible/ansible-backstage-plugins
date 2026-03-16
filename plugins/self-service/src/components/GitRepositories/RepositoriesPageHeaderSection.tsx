import { PageHeaderSection } from '../common';
import { REPO_TOOLTIP, REPO_DESCRIPTION } from './constants';

interface RepositoriesPageHeaderSectionProps {
  onSyncClick: () => void;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
}

export const RepositoriesPageHeaderSection = ({
  onSyncClick,
  syncDisabled = false,
  syncDisabledReason,
}: RepositoriesPageHeaderSectionProps) => (
  <PageHeaderSection
    title="Git Repositories"
    tooltip={REPO_TOOLTIP}
    description={REPO_DESCRIPTION}
    onSyncClick={onSyncClick}
    syncDisabled={syncDisabled}
    syncDisabledReason={syncDisabledReason}
  />
);
