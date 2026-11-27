import type { ReactNode } from 'react';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SyncIcon from '@mui/icons-material/Sync';
import { formatTimeAgo } from '../../utils';

export interface SyncNowLastSyncTime {
  label: string;
  time: string | null;
}

export interface SyncNowButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  checkingPermission?: boolean;
  disabledReason?: string;
  lastSyncTimes?: readonly SyncNowLastSyncTime[];
}

/** MUI v5 Sync Now action for Portal plugins. */
export function SyncNowButton({
  onClick,
  disabled = false,
  loading = false,
  checkingPermission = false,
  disabledReason,
  lastSyncTimes = [],
}: Readonly<SyncNowButtonProps>) {
  const synced = lastSyncTimes.filter(
    (entry): entry is SyncNowLastSyncTime & { time: string } =>
      Boolean(entry.time),
  );
  let tooltipTitle: ReactNode = '';
  if (checkingPermission) {
    tooltipTitle = 'Checking permissions...';
  } else if (disabledReason) {
    tooltipTitle = disabledReason;
  } else if (synced.length > 0) {
    tooltipTitle = (
      <Box sx={{ width: 400, px: 2.5, py: 2 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 600, mb: 0.5 }}>
          Last synced
        </Typography>
        <Divider sx={{ my: 1 }} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {synced.map(entry => (
            <Box
              key={entry.label}
              sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
            >
              <CheckCircleIcon
                sx={{ fontSize: '1.15rem', color: 'success.main' }}
              />
              <Typography sx={{ flex: 1, fontSize: '0.85rem' }}>
                {entry.label}
              </Typography>
              <Typography
                sx={{ fontSize: '0.78rem', fontWeight: 500 }}
                color="text.secondary"
              >
                {formatTimeAgo(entry.time)}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Tooltip
      title={tooltipTitle}
      arrow
      placement="bottom-end"
      slotProps={{
        tooltip: {
          sx: {
            maxWidth: 'none',
            p: 0,
            bgcolor: 'background.paper',
            color: 'text.primary',
            borderRadius: 3,
            boxShadow: '0 4px 24px rgba(0,0,0,0.55)',
            border: '1px solid rgba(255,255,255,0.08)',
          },
        },
        arrow: {
          sx: { color: 'background.paper' },
        },
      }}
    >
      <span style={{ display: 'inline-flex' }}>
        <Button
          variant="outlined"
          color="primary"
          startIcon={
            loading ? (
              <CircularProgress color="inherit" size={18} />
            ) : (
              <SyncIcon />
            )
          }
          onClick={onClick}
          disabled={disabled || loading}
        >
          Sync Now
        </Button>
      </span>
    </Tooltip>
  );
}
