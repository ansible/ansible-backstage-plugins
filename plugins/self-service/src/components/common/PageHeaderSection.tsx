import { Box, Button, Tooltip, Typography } from '@material-ui/core';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import SyncIcon from '@material-ui/icons/Sync';

import { useIsSuperuser } from '../../hooks';
import { useCollectionsStyles } from '../CollectionsCatalog/styles';
import { useSharedStyles } from './styles';

export interface PageHeaderSectionProps {
  title: string;
  tooltip: string;
  description: string;
  onSyncClick: () => void;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
  /** When true, the sync icon animates (e.g. catalog sync in progress). */
  syncInProgress?: boolean;
}

export const PageHeaderSection = ({
  title,
  tooltip,
  description,
  onSyncClick,
  syncDisabled = false,
  syncDisabledReason,
  syncInProgress = false,
}: PageHeaderSectionProps) => {
  const classes = useCollectionsStyles();
  const sharedClasses = useSharedStyles();
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
                startIcon={
                  <SyncIcon
                    className={
                      syncInProgress
                        ? sharedClasses.syncIconSpinning
                        : undefined
                    }
                  />
                }
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
