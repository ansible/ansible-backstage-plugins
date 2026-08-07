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
import GitHubIcon from '@material-ui/icons/GitHub';

const useStyles = makeStyles(theme => ({
  banner: {
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(2),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(33, 150, 243, 0.12)'
        : theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    color: theme.palette.text.primary,
  },
  errorBanner: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(211, 47, 47, 0.12)'
        : theme.palette.background.paper,
    borderColor:
      theme.palette.type === 'dark'
        ? 'rgba(211, 47, 47, 0.4)'
        : theme.palette.error.light,
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
  },
  message: {
    color: theme.palette.text.primary,
  },
  link: {
    color: theme.palette.primary.main,
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
  /** Compare default branch … remediation branch (GitHub Files changed view). */
  githubCompareUrl?: string | null;
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
  githubCompareUrl,
  devSpacesUrl,
  creatingPr,
  onCreatePr,
  hideCreatePrAction,
  onScanAgain,
}: PrStatusBannerProps) => {
  const classes = useStyles();

  const viewChangesOnGitHub = githubCompareUrl ? (
    <Button
      size="small"
      variant="outlined"
      color="primary"
      startIcon={<GitHubIcon style={{ fontSize: 14 }} />}
      href={githubCompareUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      View changes on GitHub
    </Button>
  ) : null;

  if (pushError) {
    return (
      <Paper
        className={`${classes.banner} ${classes.errorBanner}`}
        elevation={0}
      >
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <ErrorIcon color="error" />
          <Typography variant="body2" className={classes.message}>
            Push branch failed: {pushError}
          </Typography>
        </Box>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper
        className={`${classes.banner} ${classes.errorBanner}`}
        elevation={0}
      >
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <ErrorIcon color="error" />
          <Typography variant="body2" className={classes.message}>
            PR creation failed: {error}
          </Typography>
        </Box>
        {branchPushed && onCreatePr && (
          <Button
            size="small"
            variant="outlined"
            color="primary"
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
      <Paper className={classes.banner} elevation={0}>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <CheckCircleIcon color="primary" />
          <Typography variant="body2" className={classes.message}>
            Violations resolved · PR #{prNumber} merged
          </Typography>
        </Box>
        {onScanAgain && (
          <Button
            size="small"
            variant="outlined"
            color="primary"
            onClick={onScanAgain}
          >
            Scan again
          </Button>
        )}
      </Paper>
    );
  }

  if (prUrl) {
    return (
      <Paper className={classes.banner} elevation={0}>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <CheckCircleIcon color="primary" />
          <Typography variant="body2" className={classes.message}>
            PR #{prNumber ?? '—'} opened
            {branchName ? ` on ${branchName}` : ''} ·{' '}
            <Link
              href={prUrl}
              target="_blank"
              rel="noopener"
              className={classes.link}
            >
              View pull request
            </Link>
          </Typography>
        </Box>
        <Box className={classes.actions}>
          {viewChangesOnGitHub}
          {devSpacesUrl && (
            <Button
              size="small"
              variant="outlined"
              color="primary"
              startIcon={<CodeIcon style={{ fontSize: 14 }} />}
              href={devSpacesUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Dev Spaces
            </Button>
          )}
        </Box>
      </Paper>
    );
  }

  if (branchPushed && branchName) {
    return (
      <Paper className={classes.banner} elevation={0}>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <CheckCircleIcon color="primary" />
          <Typography variant="body2" className={classes.message}>
            Remediation branch <strong>{branchName}</strong> pushed. Create a
            pull request when you are ready to review the fixes.
          </Typography>
        </Box>
        <Box className={classes.actions}>
          {onCreatePr && !hideCreatePrAction && (
            <Button
              size="small"
              variant="outlined"
              color="primary"
              onClick={onCreatePr}
              disabled={creatingPr}
            >
              {creatingPr ? 'Creating PR…' : 'Create pull request'}
            </Button>
          )}
          {viewChangesOnGitHub}
          {devSpacesUrl && (
            <Button
              size="small"
              variant="outlined"
              color="primary"
              startIcon={<CodeIcon style={{ fontSize: 14 }} />}
              href={devSpacesUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Dev Spaces
            </Button>
          )}
        </Box>
      </Paper>
    );
  }

  return null;
};
