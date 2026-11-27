import type { ReactElement } from 'react';
import { Button, Tooltip } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import SyncIcon from '@material-ui/icons/Sync';
import {
  useProgressTooltipStyles,
  useSharedStyles,
} from '@ansible/portal-plugin-sdk';

const useStyles = makeStyles(theme => ({
  button: {
    '&[aria-disabled="true"]': {
      color: theme.palette.action.disabled,
      borderColor: theme.palette.action.disabledBackground,
      cursor: 'default',
    },
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 2,
    },
  },
}));

/** Keep disabled explanations focusable while blocking pointer and keyboard activation. */
export function CatalogSyncButton({
  disabled,
  running,
  onSync,
  tooltip,
  detailed = false,
  placement = 'bottom',
  className,
}: Readonly<{
  disabled: boolean;
  running: boolean;
  onSync: () => void;
  tooltip: string | ReactElement;
  detailed?: boolean;
  placement?: 'bottom' | 'bottom-end';
  className?: string;
}>) {
  const classes = useStyles();
  const shared = useSharedStyles();
  const tooltipClasses = useProgressTooltipStyles();
  return (
    <Tooltip
      title={tooltip}
      classes={detailed ? tooltipClasses : undefined}
      interactive={detailed}
      placement={placement}
      arrow
    >
      <Button
        variant="outlined"
        color="primary"
        className={`${classes.button} ${className ?? ''}`}
        aria-disabled={disabled || undefined}
        startIcon={
          <SyncIcon className={running ? shared.syncIconSpinning : undefined} />
        }
        onClick={() => {
          if (!disabled) onSync();
        }}
      >
        Sync Now
      </Button>
    </Tooltip>
  );
}
