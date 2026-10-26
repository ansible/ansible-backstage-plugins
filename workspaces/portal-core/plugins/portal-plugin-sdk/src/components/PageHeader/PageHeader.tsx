import type { ReactNode } from 'react';
import { Box, Tooltip, Typography } from '@material-ui/core';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import { usePageHeaderStyles } from '../../styles';

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  tooltip?: string;
  /** Consumer-owned controls, including their visibility and permission checks. */
  actions?: ReactNode;
}

/** Shared page-heading layout without domain actions or authorization dependencies. */
export const PageHeader = ({
  title,
  description,
  tooltip,
  actions,
}: PageHeaderProps) => {
  const classes = usePageHeaderStyles();

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
          {tooltip && (
            <Tooltip title={tooltip} arrow placement="right">
              <button
                type="button"
                className={classes.helpIcon}
                aria-label={tooltip}
                style={{
                  background: 'none',
                  border: 0,
                  padding: 0,
                  display: 'inline-flex',
                }}
              >
                <HelpOutlineIcon fontSize="inherit" />
              </button>
            </Tooltip>
          )}
        </Box>
        {actions !== undefined && actions !== null && (
          <Box style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {actions}
          </Box>
        )}
      </Box>
      {description !== undefined && description !== null && (
        <Typography
          variant="body1"
          component="div"
          className={classes.description}
        >
          {description}
        </Typography>
      )}
    </Box>
  );
};
