import type { ReactNode } from 'react';
import { Box, Button, Divider, Tooltip, Typography } from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import SyncIcon from '@material-ui/icons/Sync';
import { useIsSuperuser } from '../../hooks';
import {
  usePageHeaderStyles,
  useSharedStyles,
  useProgressTooltipStyles,
} from './styles';
import { SyncProgressPopover } from './SyncProgressPopover';
import type { SyncProgressEntry } from './types';
import { formatRelativeTime } from '../../utils/timeUtils';

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
  /** Per-source last sync timestamps shown when idle. */
  lastSyncTimes?: Array<{ label: string; time: string | null }>;
  /** Extra action buttons rendered alongside the sync button. */
  actions?: ReactNode;
  /** Content rendered below the description (e.g. a "Learn more" link). */
  descriptionExtra?: ReactNode;
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
  lastSyncTimes = [],
  actions,
  descriptionExtra,
}: PageHeaderSectionProps) => {
  const classes = usePageHeaderStyles();
  const sharedClasses = useSharedStyles();
  const tooltipClasses = useProgressTooltipStyles();
  const { isSuperuser: allowed, loading: checkingPermission } =
    useIsSuperuser();

  const showSyncButton = checkingPermission || allowed;
  const isButtonDisabled = checkingPermission || syncDisabled;

  const hasNonSuccessOutcome = syncProgress.some(e => e.outcome !== 'success');
  const showProgressPopover =
    syncProgress.length > 0 && (syncInProgress || hasNonSuccessOutcome);
  const synced = lastSyncTimes.filter(s => s.time);
  const showLastSyncPopover =
    !syncInProgress && !showProgressPopover && synced.length > 0;

  const getButtonTooltip = (): string | React.ReactElement => {
    if (checkingPermission) return 'Checking permissions...';
    if (syncDisabled && syncDisabledReason) return syncDisabledReason;
    if (showLastSyncPopover) {
      return (
        <Box style={{ width: 400, padding: '16px 20px' }}>
          <Typography
            style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}
          >
            Last synced
          </Typography>
          <Divider style={{ margin: '8px 0' }} />
          <Box style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {synced.map(s => (
              <Box
                key={s.label}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <CheckCircleIcon
                  style={{ fontSize: '1.15rem', color: '#4caf50' }}
                />
                <Typography style={{ flex: 1, fontSize: '0.85rem' }}>
                  {s.label}
                </Typography>
                <Typography
                  style={{ fontSize: '0.78rem', fontWeight: 500, opacity: 0.7 }}
                >
                  {formatRelativeTime(s.time).replace(/^Synced /i, '')}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ) as React.ReactElement;
    }
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
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {actions}
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
                classes={
                  showProgressPopover || showLastSyncPopover
                    ? tooltipClasses
                    : undefined
                }
                interactive={showProgressPopover || showLastSyncPopover}
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
      </Box>
      <Typography variant="body1" className={classes.description}>
        {description}
        {descriptionExtra && <> {descriptionExtra}</>}
      </Typography>
    </Box>
  );
};
