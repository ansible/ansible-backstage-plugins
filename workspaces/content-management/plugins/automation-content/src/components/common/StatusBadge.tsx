import type { ReactElement, ReactNode } from 'react';
import { Badge } from '@backstage/ui';
import CheckCircleOutlineIcon from '@material-ui/icons/CheckCircleOutline';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import SyncIcon from '@material-ui/icons/Sync';
import WarningIcon from '@material-ui/icons/Warning';
import styles from './StatusBadge.module.css';

export type StatusBadgeTone =
  | 'success'
  | 'info'
  | 'danger'
  | 'warning'
  | 'neutral';

/** Shared icon mapping for reconciliation status labels. */
export function syncStatusIcon(status: string): ReactElement {
  if (status === 'Available') {
    return <CheckCircleOutlineIcon aria-hidden="true" />;
  }
  if (status === 'Syncing') return <SyncIcon aria-hidden="true" />;
  if (status === 'Stale') return <WarningIcon aria-hidden="true" />;
  if (status === 'Failed') return <ErrorOutlineIcon aria-hidden="true" />;
  return <InfoOutlinedIcon aria-hidden="true" />;
}

/** BUI Badge with the shared semantic colors used for inventory status and source. */
export function StatusBadge({
  children,
  tone,
  icon,
  size = 'small',
  variant = 'filled',
}: Readonly<{
  children: string;
  tone: StatusBadgeTone;
  icon?: ReactNode;
  size?: 'small' | 'medium';
  variant?: 'filled' | 'outline';
}>): ReactElement {
  return (
    <span data-status={tone}>
      <Badge
        className={[
          tone === 'neutral' ? styles.neutral : styles[tone],
          icon ? styles.withIcon : '',
          variant === 'outline' ? styles.outline : '',
        ].join(' ')}
        icon={icon}
        size={size}
      >
        {children}
      </Badge>
    </span>
  );
}
