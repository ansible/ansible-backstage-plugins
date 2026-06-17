import { Box, Button, Tooltip, Typography } from '@material-ui/core';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import SyncIcon from '@material-ui/icons/Sync';
import { useIsSuperuser } from '../../hooks';
import { useCollectionsStyles } from '../CollectionsCatalog/styles';
import { useSharedStyles, useProgressTooltipStyles } from './styles';
import { SyncProgressPopover } from './SyncProgressPopover';
import type { SyncProgressEntry } from './types';

export interface PageHeaderSectionProps {
  title: string;
  tooltip: string;
  description: string;
  onSyncClick: () => void;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
  /** When true, the sync icon animates (e.g. catalog sync in progress). */
  syncInProgress?: boolean;
  /** Per-source progress entries surfaced from syncPollingService. */
  syncProgress?: SyncProgressEntry[];
}

export const PageHeaderSection = ({
  title,
  tooltip,
  description,
  onSyncClick,
  syncDisabled = false,
  syncDisabledReason,
  syncInProgress = false,
  syncProgress = [],
}: PageHeaderSectionProps) => {
  const classes = useCollectionsStyles();
  const sharedClasses = useSharedStyles();
  const tooltipClasses = useProgressTooltipStyles();
  const { isSuperuser: allowed, loading: checkingPermission } =
    useIsSuperuser();

  const showSyncButton = checkingPermission || allowed;
  const isButtonDisabled = checkingPermission || syncDisabled;

  // Keep the popover visible after sync ends if any source has a failure or
  // ambiguous outcome so users can inspect per-source results on hover.
  // Success-only completions are adequately communicated by the auto-hiding
  // success toast and do not need a persistent popover.
  const hasFailureOrAmbiguous = syncProgress.some(
    e => e.outcome === 'failure' || e.outcome === 'ambiguous',
  );
  const showProgressPopover =
    (syncInProgress || hasFailureOrAmbiguous) && syncProgress.length > 0;

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
          <Box
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
            }}
          >
            <Tooltip
              title={
                showProgressPopover ? (
                  <SyncProgressPopover entries={syncProgress} />
                ) : (
                  buttonTooltip
                )
              }
              classes={showProgressPopover ? tooltipClasses : undefined}
              interactive={showProgressPopover}
              arrow
              placement="bottom-end"
            >
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
          </Box>
        )}
      </Box>
      <Typography variant="body1" className={classes.description}>
        {description}
      </Typography>
    </Box>
  );
};
