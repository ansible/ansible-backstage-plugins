import type { ReactNode } from 'react';
import { Box, Button, Divider, Tooltip, Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import SyncIcon from '@material-ui/icons/Sync';
import {
  PageHeader,
  SyncProgressPopover,
  useIsSuperuser,
  usePageHeaderStyles,
  useSharedStyles,
  useProgressTooltipStyles,
  formatRelativeTime,
} from '@ansible/portal-plugin-sdk';
import type { SyncProgressEntry } from '@ansible/portal-plugin-sdk';

const useStyles = makeStyles(theme => ({
  syncWrapper: {
    display: 'inline-flex',
    '&:focus': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 2,
      borderRadius: theme.shape.borderRadius,
    },
  },
}));

export interface CatalogSyncHeaderProps {
  title: string;
  tooltip: string;
  description: string;
  onSyncClick: () => void;
  syncDisabled?: boolean;
  /** Blocking explanation, or a busy fallback when detailed progress is unavailable. */
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

/** Catalog synchronization behavior for the existing scaffolder pages. */
export const CatalogSyncHeader = ({
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
}: CatalogSyncHeaderProps) => {
  const localClasses = useStyles();
  const classes = usePageHeaderStyles();
  const sharedClasses = useSharedStyles();
  const tooltipClasses = useProgressTooltipStyles();
  const { isSuperuser: allowed, loading: checkingPermission } =
    useIsSuperuser();

  const showSyncButton = checkingPermission || allowed;
  const isButtonDisabled = checkingPermission || syncDisabled;
  const hasBlockingExplanation =
    checkingPermission || (syncDisabled && Boolean(syncDisabledReason));

  const hasNonSuccessOutcome = syncProgress.some(e => e.outcome !== 'success');
  const showProgressPopover =
    !hasBlockingExplanation &&
    syncProgress.length > 0 &&
    (syncInProgress || hasNonSuccessOutcome);
  const synced = lastSyncTimes.filter(s => s.time);
  const showLastSyncPopover =
    !hasBlockingExplanation &&
    !syncInProgress &&
    !showProgressPopover &&
    synced.length > 0;

  const getButtonTooltip = (): string | React.ReactElement => {
    if (checkingPermission) return 'Checking permissions...';
    if (syncDisabled && syncDisabledReason) return syncDisabledReason;
    if (showLastSyncPopover) {
      return (
        <Box style={{ width: 400, padding: '16px 20px' }}>
          <Typography
            color="textPrimary"
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
                <Typography
                  color="textPrimary"
                  style={{ flex: 1, fontSize: '0.85rem' }}
                >
                  {s.label}
                </Typography>
                <Typography
                  color="textSecondary"
                  style={{ fontSize: '0.78rem', fontWeight: 500 }}
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
    <PageHeader
      title={title}
      tooltip={tooltip}
      description={
        <>
          {description}
          {descriptionExtra && <> {descriptionExtra}</>}
        </>
      }
      actions={
        <>
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
                <span
                  className={localClasses.syncWrapper}
                  role={isButtonDisabled ? 'button' : undefined}
                  tabIndex={isButtonDisabled ? 0 : undefined}
                  aria-label={
                    isButtonDisabled ? 'Synchronization unavailable' : undefined
                  }
                  aria-disabled={isButtonDisabled || undefined}
                >
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
        </>
      }
    />
  );
};
