import { Box, Button, Tooltip, Typography } from '@material-ui/core';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import SyncIcon from '@material-ui/icons/Sync';

import { useIsSuperuser } from '../../hooks';
import { useCollectionsStyles } from '../CollectionsCatalog/styles';

export interface PageHeaderSectionProps {
  title: string;
  tooltip: string;
  description: string;
  onSyncClick: () => void;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
}

export const PageHeaderSection = ({
  title,
  tooltip,
  description,
  onSyncClick,
  syncDisabled = false,
  syncDisabledReason,
}: PageHeaderSectionProps) => {
  const classes = useCollectionsStyles();
  const { isSuperuser: allowed } = useIsSuperuser();

  return (
    <Box className={classes.pageHeader}>
      <Box className={classes.headerRow}>
        <Box className={classes.headerTitle}>
          <Typography
            variant="h4"
            component="h1"
            className={classes.headerTitleText}
          >
            {title}
          </Typography>
          <Tooltip title={tooltip} arrow placement="right">
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
        {description}
      </Typography>
    </Box>
  );
};
