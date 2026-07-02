/*
 * Copyright Red Hat
 */

import { Chip, makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  chip: {
    marginLeft: theme.spacing(1),
    height: 20,
    fontSize: '0.6875rem',
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
}));

/** ADR-012 — labels non-GA Plugin Factory surfaces (UI only, not a config toggle). */
export const PreviewChip = () => {
  const classes = useStyles();
  return (
    <Chip
      label="Preview"
      size="small"
      variant="outlined"
      className={classes.chip}
      data-testid="preview-chip"
    />
  );
};
