import { Box, Button, Tooltip, Typography } from '@material-ui/core';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import SyncIcon from '@material-ui/icons/Sync';
import { usePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';

import { useCollectionsStyles } from '../CollectionsCatalog/styles';
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
}: RepositoriesPageHeaderSectionProps) => {
  const classes = useCollectionsStyles();
  const { allowed } = usePermission({
    permission: catalogEntityCreatePermission,
  });

  return (
    <Box className={classes.pageHeader}>
      <Box className={classes.headerRow}>
        <Box className={classes.headerTitle}>
          <Typography
            variant="h4"
            component="h1"
            className={classes.headerTitleText}
          >
            Git Repositories
          </Typography>
          <Tooltip title={REPO_TOOLTIP} arrow placement="right">
            <HelpOutlineIcon className={classes.helpIcon} />
          </Tooltip>
        </Box>
        {allowed && (
          <Tooltip
            title={syncDisabled && syncDisabledReason ? syncDisabledReason : ''}
            arrow
          >
            <span>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<SyncIcon />}
                onClick={onSyncClick}
                className={classes.syncButton}
                disabled={syncDisabled}
              >
                Sync Now
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>
      <Typography variant="body1" className={classes.description}>
        {REPO_DESCRIPTION}
      </Typography>
    </Box>
  );
};
