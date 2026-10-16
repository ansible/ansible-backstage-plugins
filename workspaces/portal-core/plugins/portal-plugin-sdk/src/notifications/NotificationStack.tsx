import { createPortal } from 'react-dom';
import { Box } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';

import { NotificationStackProps } from './types';
import { NotificationCard } from './NotificationCard';

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

export const NotificationStack = ({
  notifications,
  onClose,
}: NotificationStackProps) => {
  const classes = useStyles();

  if (notifications.length === 0) {
    return null;
  }

  const content = (
    <Box className={classes.stack}>
      {notifications.map(notification => (
        <NotificationCard
          key={notification.id}
          notification={notification}
          onClose={onClose}
        />
      ))}
    </Box>
  );

  return createPortal(content, document.body);
};
