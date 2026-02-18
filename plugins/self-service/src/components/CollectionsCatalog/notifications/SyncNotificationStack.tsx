import { createPortal } from 'react-dom';
import { Box } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';

import { SyncNotificationStackProps } from './types';
import { SyncNotificationCard } from './SyncNotificationCard';

const useStyles = makeStyles(theme => ({
  stack: {
    position: 'fixed',
    top: theme.spacing(2),
    right: theme.spacing(2),
    zIndex: 9999,
    maxWidth: 400,
    width: 'calc(100% - 32px)',
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    '&::-webkit-scrollbar': {
      display: 'none',
    },
    padding: theme.spacing(0.5),
    pointerEvents: 'none',
    '& > *': {
      pointerEvents: 'auto',
    },
  },
}));

export const SyncNotificationStack = ({
  notifications,
  onClose,
}: SyncNotificationStackProps) => {
  const classes = useStyles();

  if (notifications.length === 0) {
    return null;
  }

  const content = (
    <Box className={classes.stack}>
      {notifications.map(notification => (
        <SyncNotificationCard
          key={notification.id}
          notification={notification}
          onClose={onClose}
        />
      ))}
    </Box>
  );

  return createPortal(content, document.body);
};
