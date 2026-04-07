import { useState, useRef, useEffect, type ReactNode } from 'react';
import {
  Box,
  Collapse,
  IconButton,
  Paper,
  Typography,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import CloseIcon from '@material-ui/icons/Close';
import InfoIcon from '@material-ui/icons/Info';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import WarningIcon from '@material-ui/icons/Warning';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';

import { NotificationCardProps, NotificationSeverity } from './types';

function hasRenderableDescription(
  description: string | ReactNode | undefined,
): boolean {
  if (description === undefined || description === null) {
    return false;
  }
  if (typeof description === 'string') {
    return description.trim().length > 0;
  }
  return true;
}

const severityColors: Record<
  NotificationSeverity,
  { border: string; icon: string }
> = {
  info: {
    border: '#7C4DFF',
    icon: '#7C4DFF',
  },
  success: {
    border: '#4CAF50',
    icon: '#4CAF50',
  },
  error: {
    border: '#F44336',
    icon: '#F44336',
  },
  warning: {
    border: '#FF9800',
    icon: '#FF9800',
  },
};

const useStyles = makeStyles(theme => ({
  card: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: theme.shadows[3],
    marginBottom: theme.spacing(1.5),
  },
  cardEntering: {
    animation: '$slideIn 0.3s ease-out forwards',
  },
  cardExiting: {
    animation: '$slideOut 0.3s ease-out forwards',
  },
  '@keyframes slideIn': {
    '0%': {
      opacity: 0,
      transform: 'translateX(100%)',
    },
    '100%': {
      opacity: 1,
      transform: 'translateX(0)',
    },
  },
  '@keyframes slideOut': {
    '0%': {
      opacity: 1,
      transform: 'translateX(0)',
      maxHeight: 200,
      marginBottom: theme.spacing(1.5),
    },
    '100%': {
      opacity: 0,
      transform: 'translateX(100%)',
      maxHeight: 0,
      marginBottom: 0,
    },
  },
  cardContent: {
    padding: theme.spacing(1.5, 2),
    display: 'flex',
    alignItems: 'flex-start',
  },
  expandButtonContainer: {
    marginRight: theme.spacing(0.5),
    display: 'flex',
    alignItems: 'center',
    marginTop: -2,
  },
  expandButton: {
    padding: 4,
  },
  expandIcon: {
    fontSize: '1.25rem',
    color: theme.palette.text.secondary,
  },
  expandPlaceholder: {
    width: 28,
    marginRight: theme.spacing(0.5),
  },
  iconContainer: {
    marginRight: theme.spacing(1.5),
    display: 'flex',
    alignItems: 'center',
    paddingTop: 2,
  },
  icon: {
    fontSize: '1.5rem',
  },
  contentArea: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontWeight: 600,
    fontSize: '0.95rem',
    color: theme.palette.text.primary,
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
  },
  closeButton: {
    flexShrink: 0,
    padding: 4,
    marginTop: -4,
    marginRight: -8,
  },
  closeIcon: {
    fontSize: '1.1rem',
    color: theme.palette.text.secondary,
  },
  description: {
    marginTop: theme.spacing(0.5),
    fontSize: '0.85rem',
    color: theme.palette.text.secondary,
    lineHeight: 1.4,
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
  },
  itemsList: {
    marginTop: theme.spacing(1),
    paddingLeft: theme.spacing(2),
    marginBottom: 0,
  },
  listItem: {
    fontSize: '0.85rem',
    color: theme.palette.text.secondary,
    lineHeight: 1.6,
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
    '&::marker': {
      color: theme.palette.text.disabled,
    },
  },
}));

const SeverityIcon = ({
  severity,
  color,
  className,
}: {
  severity: NotificationSeverity;
  color: string;
  className?: string;
}) => {
  const iconProps = { style: { color }, className };

  switch (severity) {
    case 'success':
      return <CheckCircleIcon {...iconProps} />;
    case 'error':
      return <ErrorIcon {...iconProps} />;
    case 'warning':
      return <WarningIcon {...iconProps} />;
    case 'info':
    default:
      return <InfoIcon {...iconProps} />;
  }
};

export const NotificationCard = ({
  notification,
  onClose,
}: NotificationCardProps) => {
  const classes = useStyles();
  const [expanded, setExpanded] = useState(true);
  const [hasEntered, setHasEntered] = useState(false);
  const isFirstRender = useRef(true);

  const colors = severityColors[notification.severity];
  const hasExpandableContent =
    notification.collapsible &&
    notification.items &&
    notification.items.length > 0;
  const isExiting = notification.isExiting ?? false;

  const isEntering = isFirstRender.current && !hasEntered;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      const timer = setTimeout(() => setHasEntered(true), 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  let animationClass = '';
  if (isExiting) {
    animationClass = classes.cardExiting;
  } else if (isEntering) {
    animationClass = classes.cardEntering;
  }

  return (
    <Paper
      className={`${classes.card} ${animationClass}`}
      style={{
        borderLeft: `4px solid ${colors.border}`,
      }}
    >
      <Box className={classes.cardContent}>
        {hasExpandableContent ? (
          <Box className={classes.expandButtonContainer}>
            <IconButton
              className={classes.expandButton}
              onClick={() => setExpanded(!expanded)}
              size="small"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? (
                <ExpandLessIcon className={classes.expandIcon} />
              ) : (
                <ExpandMoreIcon className={classes.expandIcon} />
              )}
            </IconButton>
          </Box>
        ) : (
          <Box className={classes.expandPlaceholder} />
        )}

        <Box className={classes.iconContainer}>
          <SeverityIcon
            severity={notification.severity}
            color={colors.icon}
            className={classes.icon}
          />
        </Box>

        <Box className={classes.contentArea}>
          <Box className={classes.header}>
            <Typography className={classes.title}>
              {notification.title}
            </Typography>
            <IconButton
              className={classes.closeButton}
              onClick={() => onClose(notification.id)}
              size="small"
              aria-label="Close notification"
            >
              <CloseIcon className={classes.closeIcon} />
            </IconButton>
          </Box>

          {hasRenderableDescription(notification.description) && (
            <Typography component="div" className={classes.description}>
              {notification.description}
            </Typography>
          )}

          {hasExpandableContent && (
            <Collapse in={expanded} timeout="auto">
              <ul className={classes.itemsList}>
                {notification.items?.map(item => (
                  <li key={item} className={classes.listItem}>
                    {item}
                  </li>
                ))}
              </ul>
            </Collapse>
          )}
        </Box>
      </Box>
    </Paper>
  );
};
