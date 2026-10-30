import type { ReactNode } from 'react';
import { Box, Typography } from '@material-ui/core';
import { useSharedStyles } from '../../styles';

export interface EmptyStateViewProps {
  title: string;
  description?: ReactNode;
  /** Decorative illustration. Put information needed by all users in the text. */
  icon?: ReactNode;
  /** Consumer-owned controls, including their permissions and handlers. */
  actions?: ReactNode;
}

/** Empty-state presentation without catalog, authentication, or synchronization policy. */
export const EmptyStateView = ({
  title,
  description,
  icon,
  actions,
}: EmptyStateViewProps) => {
  const classes = useSharedStyles();
  return (
    <Box className={classes.emptyState}>
      {icon !== undefined && icon !== null && (
        <Box
          className={classes.emptyStateIcon}
          display="flex"
          aria-hidden="true"
        >
          {icon}
        </Box>
      )}
      <Typography
        variant="h5"
        component="h2"
        className={classes.emptyStateTitle}
      >
        {title}
      </Typography>
      {description !== undefined && description !== null && (
        <Typography
          variant="body1"
          component="div"
          className={classes.emptyStateDescription}
        >
          {description}
        </Typography>
      )}
      {actions !== undefined && actions !== null && (
        <Box
          style={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
};
