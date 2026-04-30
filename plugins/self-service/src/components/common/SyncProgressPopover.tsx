import { Box, Divider, LinearProgress, Typography } from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import SyncIcon from '@material-ui/icons/Sync';
import { makeStyles } from '@material-ui/core/styles';

import type { SyncProgressEntry } from './types';
import { useSharedStyles } from './styles';

const useStyles = makeStyles(theme => ({
  root: {
    width: 400,
    boxSizing: 'border-box' as const,
    padding: theme.spacing(2, 2.5),
    borderRadius: 12,
    overflow: 'hidden',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(0.5),
  },
  title: {
    fontSize: '1rem',
    fontWeight: 600,
    color: theme.palette.text.primary,
  },
  percentBadge: {
    backgroundColor: theme.palette.action.selected,
    borderRadius: 12,
    padding: theme.spacing(0.25, 1),
    fontSize: '0.8rem',
    fontWeight: 600,
    color: theme.palette.text.primary,
    whiteSpace: 'nowrap' as const,
  },
  subHeader: {
    fontSize: '0.8rem',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1.25),
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: theme.spacing(1.5),
    backgroundColor: theme.palette.action.selected,
  },
  progressBarFill: {
    borderRadius: 3,
  },
  divider: {
    backgroundColor: theme.palette.divider,
    marginBottom: theme.spacing(1),
  },
  sourceList: {
    display: 'flex',
    flexDirection: 'column',
  },
  sourceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(0.75, 0),
  },
  sourceIcon: {
    fontSize: '1.15rem',
    flexShrink: 0,
  },
  successIcon: { color: theme.palette.success.main },
  failureIcon: { color: theme.palette.error.main },
  pendingIcon: { color: theme.palette.primary.main },
  ambiguousIcon: { color: theme.palette.warning.main },
  sourceName: {
    flex: 1,
    minWidth: 0,
    fontSize: '0.85rem',
    color: theme.palette.text.primary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  statusLabel: {
    fontSize: '0.78rem',
    fontWeight: 500,
    flexShrink: 0,
  },
  statusCompleted: { color: theme.palette.text.secondary },
  statusFailed: { color: theme.palette.error.main },
  statusInProgress: { color: theme.palette.primary.main },
  statusAmbiguous: { color: theme.palette.warning.main },
}));

function getStatusClass(
  outcome: string,
  classes: ReturnType<typeof useStyles>,
): string {
  if (outcome === 'success') return classes.statusCompleted;
  if (outcome === 'failure') return classes.statusFailed;
  if (outcome === 'pending') return classes.statusInProgress;
  return classes.statusAmbiguous;
}

const OUTCOME_LABEL: Record<string, string> = {
  success: 'Completed',
  failure: 'Failed',
  pending: 'In progress',
  ambiguous: 'Finished',
};

interface SyncProgressPopoverProps {
  entries: SyncProgressEntry[];
}

export const SyncProgressPopover = ({ entries }: SyncProgressPopoverProps) => {
  const classes = useStyles();
  const sharedClasses = useSharedStyles();

  const total = entries.length;
  const resolved = entries.filter(e => e.outcome !== 'pending').length;
  const percent = total > 0 ? Math.round((resolved / total) * 100) : 0;

  const allDone = resolved === total;
  const hasFailures = entries.some(e => e.outcome === 'failure');

  let titleText = 'Syncing\u2026';
  if (allDone) {
    titleText = hasFailures
      ? 'Last sync completed with errors'
      : 'Sync completed';
  }

  return (
    <Box className={classes.root}>
      {/* Header */}
      <Box className={classes.headerRow}>
        <Typography className={classes.title}>{titleText}</Typography>
        <Typography className={classes.percentBadge}>{percent}%</Typography>
      </Box>

      {/* Sub-header */}
      <Typography className={classes.subHeader}>
        {resolved} of {total} task{total !== 1 ? 's' : ''} completed
      </Typography>

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={percent}
        className={classes.progressBar}
        classes={{ bar: classes.progressBarFill }}
        color="primary"
      />

      <Divider className={classes.divider} />

      {/* Source rows */}
      <Box className={classes.sourceList}>
        {entries.map(entry => (
          <Box key={entry.sourceId} className={classes.sourceRow}>
            {entry.outcome === 'success' && (
              <CheckCircleIcon
                className={`${classes.sourceIcon} ${classes.successIcon}`}
              />
            )}
            {entry.outcome === 'failure' && (
              <ErrorIcon
                className={`${classes.sourceIcon} ${classes.failureIcon}`}
              />
            )}
            {entry.outcome === 'ambiguous' && (
              <HelpOutlineIcon
                className={`${classes.sourceIcon} ${classes.ambiguousIcon}`}
              />
            )}
            {entry.outcome === 'pending' && (
              <SyncIcon
                className={`${classes.sourceIcon} ${classes.pendingIcon} ${sharedClasses.syncIconSpinning}`}
              />
            )}

            <Typography className={classes.sourceName}>
              {entry.displayName}
            </Typography>

            <Typography
              className={`${classes.statusLabel} ${getStatusClass(entry.outcome, classes)}`}
            >
              {OUTCOME_LABEL[entry.outcome]}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
