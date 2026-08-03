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
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import { useApi, alertApiRef } from '@backstage/core-plugin-api';
import { complianceApiRef } from '../../api';
import type { RemediationProfile, BaselineTarget } from '@ansible/backstage-compliance-common/types';

const useStyles = makeStyles(theme => ({
  helperText: {
    color: theme.palette.text.secondary,
    fontSize: '0.85rem',
    marginBottom: theme.spacing(2),
    lineHeight: 1.5,
  },
  currentBaseline: {
    padding: theme.spacing(1.5),
    backgroundColor: theme.palette.type === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(2),
  },
  ruleCount: {
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
  },
  emptyState: {
    padding: theme.spacing(2),
    backgroundColor: theme.palette.type === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
    borderRadius: theme.shape.borderRadius,
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1.5),
  },
}));

interface PinBaselineDialogProps {
  open: boolean;
  onClose: () => void;
  complianceProfileId: string;
  complianceProfileName: string;
  inventoryId?: number;
  inventoryName?: string;
  existingBaseline?: BaselineTarget;
  onPinned: () => void;
  preselectedRemediationProfileId?: string;
}

export const PinBaselineDialog: React.FC<PinBaselineDialogProps> = ({
  open,
  onClose,
  complianceProfileId,
  complianceProfileName,
  inventoryId,
  inventoryName,
  existingBaseline,
  onPinned,
  preselectedRemediationProfileId,
}) => {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useApi(complianceApiRef);
  const alertApi = useApi(alertApiRef);
  const [profiles, setProfiles] = useState<RemediationProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [inventories, setInventories] = useState<Array<{ id: number; name: string; hostCount: number }>>([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState<number | ''>('');
  const needsInventorySelection = inventoryId === undefined;

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    const fetchProfiles = api.getRemediationProfiles?.('saved')
      .then(rps => {
        const matching = rps.filter(rp => rp.complianceProfileId === complianceProfileId);
        setProfiles(matching);
        if (preselectedRemediationProfileId) {
          setSelectedProfileId(preselectedRemediationProfileId);
        } else if (existingBaseline) {
          setSelectedProfileId(existingBaseline.remediationProfileId);
        } else if (matching.length === 1) {
          setSelectedProfileId(matching[0].id);
        } else {
          setSelectedProfileId('');
        }
      })
      .catch(() => setProfiles([]));

    const fetchInventories = needsInventorySelection
      ? api.getInventories().then(setInventories).catch(() => setInventories([]))
      : Promise.resolve();

    Promise.all([fetchProfiles, fetchInventories]).finally(() => setLoading(false));

    if (!needsInventorySelection) {
      setSelectedInventoryId(inventoryId!);
    } else {
      setSelectedInventoryId('');
    }
  }, [open, api, complianceProfileId, existingBaseline, inventoryId, needsInventorySelection, preselectedRemediationProfileId]);

  const finalInventoryId = inventoryId ?? (selectedInventoryId || undefined);
  const finalInventoryName = inventoryName ?? inventories.find(i => i.id === selectedInventoryId)?.name;

  const handlePin = async () => {
    if (!selectedProfileId || !finalInventoryId) return;
    setSubmitting(true);
    try {
      if (existingBaseline) {
        await api.unpinBaselineTarget(existingBaseline.id);
      }
      await api.pinBaselineTarget({
        remediationProfileId: selectedProfileId,
        complianceProfileId,
        inventoryId: finalInventoryId,
      });
      onClose();
      onPinned();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alertApi.post({ message: `Failed to pin baseline: ${msg}`, severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnpin = async () => {
    if (!existingBaseline) return;
    setSubmitting(true);
    try {
      await api.unpinBaselineTarget(existingBaseline.id);
      onClose();
      onPinned();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alertApi.post({ message: `Failed to unpin baseline: ${msg}`, severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProfile = profiles.find(p => p.id === selectedProfileId);
  const enabledRules = selectedProfile?.selections?.filter(s => s.enabled).length ?? 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {existingBaseline ? 'Manage Baseline' : 'Pin a Baseline'}
      </DialogTitle>
      <DialogContent>
        <Typography className={classes.helperText}>
          A baseline is a curated set of rules you've chosen to enforce.
          Pinning it here lets you track progress toward your specific
          compliance target, separate from the full {complianceProfileName} standard.
        </Typography>

        {inventoryName ? (
          <Typography variant="body2" style={{ marginBottom: 16 }}>
            <strong>Inventory:</strong> {inventoryName}
          </Typography>
        ) : needsInventorySelection && !loading && (
          <FormControl fullWidth variant="outlined" size="small" style={{ marginBottom: 16 }}>
            <InputLabel>Target inventory</InputLabel>
            <Select
              value={selectedInventoryId}
              onChange={e => setSelectedInventoryId(e.target.value as number)}
              label="Target inventory"
            >
              {inventories.map(inv => (
                <MenuItem key={inv.id} value={inv.id}>
                  {inv.name} ({inv.hostCount} hosts)
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {existingBaseline && (
          <Box className={classes.currentBaseline}>
            <Typography variant="body2">
              <strong>Current baseline:</strong>{' '}
              {profiles.find(p => p.id === existingBaseline.remediationProfileId)?.name
                ?? existingBaseline.remediationProfileId}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              Pinned {new Date(existingBaseline.pinnedAt).toLocaleDateString()}
            </Typography>
          </Box>
        )}

        {loading ? (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress size={32} />
          </Box>
        ) : profiles.length === 0 ? (
          <Box className={classes.emptyState}>
            <InfoOutlinedIcon color="action" style={{ marginTop: 2 }} />
            <div>
              <Typography variant="body2">
                No saved remediation profiles found for <strong>{complianceProfileName}</strong>.
              </Typography>
              <Typography variant="body2" color="textSecondary" style={{ marginTop: 4 }}>
                Create a remediation profile first by scanning your inventory and selecting
                rules to enforce, then come back here to pin it as your baseline.
              </Typography>
              <Button
                variant="text"
                color="primary"
                size="small"
                style={{ marginTop: 8, padding: '4px 8px' }}
                onClick={() => { onClose(); navigate('/compliance/remediations'); }}
              >
                Go to Remediations
              </Button>
            </div>
          </Box>
        ) : (
          <>
            <FormControl fullWidth variant="outlined" size="small">
              <InputLabel>Remediation profile</InputLabel>
              <Select
                value={selectedProfileId}
                onChange={e => setSelectedProfileId(e.target.value as string)}
                label="Remediation profile"
              >
                {profiles.map(rp => {
                  const count = rp.selections?.filter(s => s.enabled).length ?? 0;
                  return (
                    <MenuItem key={rp.id} value={rp.id}>
                      {rp.name} ({count} rules)
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
            {selectedProfile && (
              <Typography className={classes.ruleCount} style={{ marginTop: 8 }}>
                This baseline covers {enabledRules} rules.
                {finalInventoryName
                  ? ` The dashboard will show your compliance against these ${enabledRules} rules for ${finalInventoryName}.`
                  : ` The dashboard will show your compliance against these ${enabledRules} rules alongside the full ${complianceProfileName} score.`}
              </Typography>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {existingBaseline && (
          <Button onClick={handleUnpin} disabled={submitting} color="secondary">
            Unpin
          </Button>
        )}
        <Box flex={1} />
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handlePin}
          disabled={!selectedProfileId || !finalInventoryId || submitting || profiles.length === 0}
          color="primary"
          variant="contained"
        >
          {submitting ? <CircularProgress size={20} /> : existingBaseline ? 'Replace' : 'Pin'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
