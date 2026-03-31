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
  const { isSuperuser: allowed, loading: checkingPermission } =
    useIsSuperuser();

  const showSyncButton = checkingPermission || allowed;
  const isButtonDisabled = checkingPermission || syncDisabled;

  const getButtonTooltip = () => {
    if (checkingPermission) return 'Checking permissions...';
    if (syncDisabled && syncDisabledReason) return syncDisabledReason;
    return '';
  };
  const buttonTooltip = getButtonTooltip();

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
        {showSyncButton && (
          <Tooltip title={buttonTooltip} arrow>
            <span>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<SyncIcon />}
                onClick={onSyncClick}
                className={classes.syncButton}
                disabled={isButtonDisabled}
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
