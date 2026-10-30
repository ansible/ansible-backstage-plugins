import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  CircularProgress,
  makeStyles,
} from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import WarningIcon from '@material-ui/icons/Warning';
import StorageIcon from '@material-ui/icons/Storage';
import { useApi } from '@backstage/core-plugin-api';
import { complianceApiRef } from '../../api';
import { STATUS_COLORS } from '../shared/colors';

const useStyles = makeStyles(theme => ({
  field: {
    marginBottom: theme.spacing(2),
  },
  inventoryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
    padding: theme.spacing(1.5),
    borderRadius: 4,
    backgroundColor: theme.palette.action.hover,
  },
  scanCheck: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
    padding: theme.spacing(1),
    borderRadius: 4,
    fontSize: '0.85rem',
  },
  profileSelect: {
    minWidth: 280,
  },
}));

interface LaunchScanDialogProps {
  open: boolean;
  onClose: () => void;
  inventoryId: number;
  inventoryName: string;
  profileOptions: Array<{ value: string; label: string }>;
  initialProfileId: string;
}

export const LaunchScanDialog: React.FC<LaunchScanDialogProps> = ({
  open,
  onClose,
  inventoryId,
  inventoryName,
  profileOptions,
  initialProfileId,
}) => {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useApi(complianceApiRef);
  const [profileId, setProfileId] = useState(initialProfileId);
  const [checking, setChecking] = useState(false);
  const [lastScan, setLastScan] = useState<{ passRate: number; date: string } | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProfileId(initialProfileId);
    setError(null);
    setLaunching(false);
  }, [open, initialProfileId]);

  useEffect(() => {
    if (!open || !profileId) return;
    setChecking(true);
    setLastScan(null);
    api.getAuthoritativeScan(profileId, inventoryId)
      .then(result => {
        if (result) {
          setLastScan({
            passRate: result.passRate,
            date: new Date(result.scan.completedAt ?? result.scan.startedAt).toLocaleString(),
          });
        }
      })
      .catch(() => { /* Expected: no previous scan for this profile/inventory pair */ })
      .finally(() => setChecking(false));
  }, [api, open, profileId, inventoryId]);

  const handleLaunch = async () => {
    setLaunching(true);
    setError(null);
    try {
      const result = await api.launchScan({ profileId, inventoryId });
      onClose();
      navigate(`/compliance/results/${result.workflowJobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLaunching(false);
    }
  };

  const selectedLabel = profileOptions.find(p => p.value === profileId)?.label ?? '';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Launch Scan</DialogTitle>
      <DialogContent>
        <div className={classes.inventoryRow}>
          <StorageIcon fontSize="small" color="action" />
          <Typography variant="body2">
            <strong>Inventory:</strong> {inventoryName}
          </Typography>
        </div>

        <FormControl variant="outlined" size="small" fullWidth className={classes.field}>
          <InputLabel id="scan-profile-label">Compliance Profile</InputLabel>
          <Select
            labelId="scan-profile-label"
            value={profileId}
            onChange={e => setProfileId(e.target.value as string)}
            label="Compliance Profile"
          >
            {profileOptions.map(opt => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {checking && (
          <div className={classes.scanCheck}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="textSecondary">
              Checking for previous scan...
            </Typography>
          </div>
        )}

        {!checking && lastScan && (
          <div className={classes.scanCheck} style={{ backgroundColor: 'rgba(62,134,53,0.06)' }}>
            <CheckCircleIcon fontSize="small" style={{ color: STATUS_COLORS.success }} />
            <Typography variant="body2">
              Last scan: <strong>{lastScan.passRate}%</strong> pass rate ({lastScan.date})
            </Typography>
          </div>
        )}

        {!checking && !lastScan && profileId && (
          <div className={classes.scanCheck} style={{ backgroundColor: 'rgba(240,171,0,0.06)' }}>
            <WarningIcon fontSize="small" style={{ color: STATUS_COLORS.warning }} />
            <Typography variant="body2">
              No previous scan for {selectedLabel} on this inventory
            </Typography>
          </div>
        )}

        {error && (
          <Box mt={1} p={1} style={{ backgroundColor: 'rgba(201,25,11,0.06)', borderRadius: 4 }}>
            <Typography variant="body2" style={{ color: STATUS_COLORS.error }}>
              {error}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={launching}>Cancel</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleLaunch}
          disabled={!profileId || launching}
          startIcon={launching ? <CircularProgress size={16} /> : undefined}
        >
          {launching ? 'Launching...' : 'Launch Scan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
