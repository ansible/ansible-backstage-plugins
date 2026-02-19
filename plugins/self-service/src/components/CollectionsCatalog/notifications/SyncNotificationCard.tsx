import { useState } from 'react';
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

import { SyncNotificationCardProps, SyncNotificationSeverity } from './types';

const severityColors: Record<
  SyncNotificationSeverity,
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
    animation: '$slideIn 0.3s ease-out',
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
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontWeight: 600,
    fontSize: '0.95rem',
    color: theme.palette.text.primary,
  },
  closeButton: {
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
  },
  sourcesList: {
    marginTop: theme.spacing(1),
    paddingLeft: theme.spacing(2),
    marginBottom: 0,
  },
  sourceItem: {
    fontSize: '0.85rem',
    color: theme.palette.text.secondary,
    lineHeight: 1.6,
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
  severity: SyncNotificationSeverity;
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

export const SyncNotificationCard = ({
  notification,
  onClose,
}: SyncNotificationCardProps) => {
  const classes = useStyles();
  const [expanded, setExpanded] = useState(true);

  const colors = severityColors[notification.severity];
  const hasExpandableContent =
    notification.collapsible &&
    notification.sources &&
    notification.sources.length > 0;

  return (
    <Paper
      className={classes.card}
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
          {notification.description && (
            <Typography className={classes.description}>
              {notification.description}
            </Typography>
          )}
          {hasExpandableContent && (
            <Collapse in={expanded} timeout="auto">
              <ul className={classes.sourcesList}>
                {notification.sources!.map((source, index) => (
                  <li key={index} className={classes.sourceItem}>
                    {source}
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
