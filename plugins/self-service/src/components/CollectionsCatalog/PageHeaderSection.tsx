import { Box, Button, Tooltip, Typography } from '@material-ui/core';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import SyncIcon from '@material-ui/icons/Sync';
import { usePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';

import { PageHeaderSectionProps } from './types';
import { useCollectionsStyles } from './styles';
import { COLLECTION_TOOLTIP, COLLECTION_DESCRIPTION } from './constants';

export const PageHeaderSection = ({
  onSyncClick,
  syncDisabled = false,
  syncDisabledReason,
}: PageHeaderSectionProps) => {
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
            Collections
          </Typography>
          <Tooltip title={COLLECTION_TOOLTIP} arrow placement="right">
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
        {COLLECTION_DESCRIPTION}
      </Typography>
    </Box>
  );
};
