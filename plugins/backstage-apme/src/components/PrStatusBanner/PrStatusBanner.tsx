/*
 * Copyright Red Hat
 */

import {
  Box,
  Button,
  Link,
  Paper,
  Typography,
  makeStyles,
} from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import CodeIcon from '@material-ui/icons/Code';

const useStyles = makeStyles(theme => ({
  banner: {
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(2),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
  },
  success: {
    backgroundColor: theme.palette.success.light,
  },
  info: {
    backgroundColor:
      theme.palette.type === 'dark' ? 'rgba(33, 150, 243, 0.15)' : '#e7f1fa',
  },
  error: {
    backgroundColor: theme.palette.error.light,
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
  },
}));

export interface PrStatusBannerProps {
  prUrl?: string;
  prNumber?: number;
  branchName?: string;
  error?: string;
  pushError?: string;
  branchPushed?: boolean;
  merged?: boolean;
  devSpacesUrl?: string | null;
  creatingPr?: boolean;
  onCreatePr?: () => void;
  hideCreatePrAction?: boolean;
  onScanAgain?: () => void;
}

export const PrStatusBanner = ({
  prUrl,
  prNumber,
  branchName,
  error,
  pushError,
  branchPushed,
  merged,
  devSpacesUrl,
  creatingPr,
  onCreatePr,
  hideCreatePrAction,
  onScanAgain,
}: PrStatusBannerProps) => {
  const classes = useStyles();

  if (pushError) {
    return (
      <Paper className={`${classes.banner} ${classes.error}`} elevation={1}>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <ErrorIcon color="error" />
          <Typography variant="body2">
            Push branch failed: {pushError}
          </Typography>
        </Box>
        {devSpacesUrl && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<CodeIcon style={{ fontSize: 14 }} />}
            href={devSpacesUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Dev Spaces
          </Button>
        )}
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper className={`${classes.banner} ${classes.error}`} elevation={1}>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <ErrorIcon color="error" />
          <Typography variant="body2">PR creation failed: {error}</Typography>
        </Box>
        {branchPushed && onCreatePr && (
          <Button
            size="small"
            variant="outlined"
            onClick={onCreatePr}
            disabled={creatingPr}
          >
            Retry create PR
          </Button>
        )}
      </Paper>
    );
  }

  if (merged) {
    return (
      <Paper className={`${classes.banner} ${classes.success}`} elevation={1}>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <CheckCircleIcon style={{ color: '#2e7d32' }} />
          <Typography variant="body2">
            Violations resolved · PR #{prNumber} merged
          </Typography>
        </Box>
        {onScanAgain && (
          <Button size="small" variant="outlined" onClick={onScanAgain}>
            Scan again
          </Button>
        )}
      </Paper>
    );
  }

  if (prUrl) {
    return (
      <Paper className={`${classes.banner} ${classes.success}`} elevation={1}>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <CheckCircleIcon style={{ color: '#2e7d32' }} />
          <Typography variant="body2">
            PR #{prNumber ?? '—'} opened
            {branchName ? ` on ${branchName}` : ''} ·{' '}
            <Link href={prUrl} target="_blank" rel="noopener">
              View pull request
            </Link>
          </Typography>
        </Box>
        <Box className={classes.actions}>
          {devSpacesUrl && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<CodeIcon style={{ fontSize: 14 }} />}
              href={devSpacesUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Edit in Dev Spaces
            </Button>
          )}
        </Box>
      </Paper>
    );
  }

  if (branchPushed && branchName) {
    return (
      <Paper className={`${classes.banner} ${classes.info}`} elevation={1}>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <CheckCircleIcon style={{ color: '#0066cc' }} />
          <Typography variant="body2">
            Remediation branch <strong>{branchName}</strong> pushed. Open in Dev
            Spaces to review the fixes and commit when ready.
          </Typography>
        </Box>
        <Box className={classes.actions}>
          {devSpacesUrl && (
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<CodeIcon style={{ fontSize: 14 }} />}
              href={devSpacesUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Dev Spaces
            </Button>
          )}
          {onCreatePr && !hideCreatePrAction && (
            <Button
              size="small"
              variant="outlined"
              onClick={onCreatePr}
              disabled={creatingPr}
            >
              {creatingPr ? 'Creating PR…' : 'Create pull request'}
            </Button>
          )}
        </Box>
      </Paper>
    );
  }

  return null;
};
