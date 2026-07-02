import { Button } from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeaderSection } from '../common';
import type { SyncProgressEntry } from '../common';
import { REPO_TOOLTIP, REPO_DESCRIPTION } from './constants';

const APME_REGISTER_TEMPLATE_PATH =
  '/self-service/create/templates/default/apme-register-git-repository';

interface RepositoriesPageHeaderSectionProps {
  onSyncClick: () => void;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
  syncInProgress?: boolean;
  syncProgress?: SyncProgressEntry[];
}

export const RepositoriesPageHeaderSection = ({
  onSyncClick,
  syncDisabled = false,
  syncDisabledReason,
  syncInProgress = false,
  syncProgress,
}: RepositoriesPageHeaderSectionProps) => (
  <PageHeaderSection
    title="Git Repositories"
    tooltip={REPO_TOOLTIP}
    description={REPO_DESCRIPTION}
    onSyncClick={onSyncClick}
    syncDisabled={syncDisabled}
    syncDisabledReason={syncDisabledReason}
    extraHeaderActions={
      <Button
        variant="contained"
        color="primary"
        startIcon={<AddIcon />}
        component={RouterLink}
        to={APME_REGISTER_TEMPLATE_PATH}
      >
        Add repository
      </Button>
    }
    syncInProgress={syncInProgress}
    syncProgress={syncProgress}
  />
);
