/*
 * Copyright Red Hat
 */

import {
  Box,
  LinearProgress,
  Paper,
  Typography,
  makeStyles,
} from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  banner: {
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(2),
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: theme.spacing(0.5),
  },
}));

export interface FixProgressBannerProps {
  message: string;
  progress?: number;
}

export const FixProgressBanner = ({
  message,
  progress,
}: FixProgressBannerProps) => {
  const classes = useStyles();
  return (
    <Paper className={classes.banner} elevation={1}>
      <LinearProgress
        variant={progress !== undefined ? 'determinate' : 'indeterminate'}
        value={progress}
      />
      <Box className={classes.row}>
        <Typography variant="caption" color="textSecondary">
          {message}
        </Typography>
        {progress !== undefined && (
          <Typography variant="caption">{Math.round(progress)}%</Typography>
        )}
      </Box>
    </Paper>
  );
};
