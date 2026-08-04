import { useState, useEffect } from 'react';
import type { FC } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  Chip,
  makeStyles,
} from '@material-ui/core';
import { useApi, alertApiRef } from '@backstage/core-plugin-api';
import { complianceApiRef } from '../../api';
import type { BaselineTarget } from '@ansible/backstage-compliance-common/types';
import { EXECUTION_COLORS } from '../shared/colors';

const useStyles = makeStyles(theme => ({
  helperText: {
    color: theme.palette.text.secondary,
    fontSize: '0.85rem',
    marginBottom: theme.spacing(2),
    lineHeight: 1.5,
  },
  inventoryRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(0.5, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': { borderBottom: 'none' },
  },
  hostCount: {
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
    marginLeft: theme.spacing(1),
  },
  pinnedChip: {
    height: 20,
    fontSize: '0.7rem',
  },
}));

interface ManageBaselinePinsDialogProps {
  open: boolean;
  onClose: () => void;
  remediationProfileId: string;
  remediationProfileName: string;
  complianceProfileId: string;
  complianceProfileName: string;
  ruleCount: number;
  currentPins: BaselineTarget[];
  onChanged: () => void;
}

export const ManageBaselinePinsDialog: FC<ManageBaselinePinsDialogProps> = ({
  open,
  onClose,
  remediationProfileId,
  remediationProfileName,
  complianceProfileId,
  complianceProfileName,
  ruleCount,
  currentPins,
  onChanged,
}) => {
  const classes = useStyles();
  const api = useApi(complianceApiRef);
  const alertApi = useApi(alertApiRef);
  const [inventories, setInventories] = useState<
    Array<{ id: number; name: string; hostCount: number }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const pinsForThisProfile = currentPins.filter(
    bt => bt.remediationProfileId === remediationProfileId,
  );
  const initialPinnedIds = new Set(
    pinsForThisProfile.map(bt => bt.inventoryId),
  );

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedIds(new Set(pinsForThisProfile.map(bt => bt.inventoryId)));
    api
      .getInventories()
      .then(setInventories)
      .catch(() => setInventories([]))
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = (inventoryId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(inventoryId)) {
        next.delete(inventoryId);
      } else {
        next.add(inventoryId);
      }
      return next;
    });
  };

  const hasChanges = (() => {
    if (selectedIds.size !== initialPinnedIds.size) return true;
    for (const id of selectedIds) {
      if (!initialPinnedIds.has(id)) return true;
    }
    return false;
  })();

  const handleApply = async () => {
    setSubmitting(true);
    try {
      const toPin = [...selectedIds].filter(id => !initialPinnedIds.has(id));
      const toUnpin = pinsForThisProfile.filter(
        bt => !selectedIds.has(bt.inventoryId),
      );

      for (const bt of toUnpin) {
        await api.unpinBaselineTarget(bt.id);
      }
      for (const invId of toPin) {
        await api.pinBaselineTarget({
          remediationProfileId,
          complianceProfileId,
          inventoryId: invId,
        });
      }

      onClose();
      onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alertApi.post({
        message: `Failed to update baseline pins: ${msg}`,
        severity: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Manage Baseline Pins</DialogTitle>
      <DialogContent>
        <Typography className={classes.helperText}>
          Select which inventories should use{' '}
          <strong>{remediationProfileName}</strong> ({ruleCount} rules) as their
          baseline for {complianceProfileName}. The dashboard will track
          progress against this curated rule set for each pinned inventory.
        </Typography>

        {(() => {
          if (loading) {
            return (
              <Box display="flex" justifyContent="center" py={3}>
                <CircularProgress size={32} />
              </Box>
            );
          }
          if (inventories.length === 0) {
            return (
              <Typography
                color="textSecondary"
                style={{ textAlign: 'center', padding: 16 }}
              >
                No inventories found.
              </Typography>
            );
          }
          return (
            <Box>
              {inventories.map(inv => {
                const isPinned = selectedIds.has(inv.id);
                const wasPinned = initialPinnedIds.has(inv.id);
                return (
                  <div key={inv.id} className={classes.inventoryRow}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={isPinned}
                          onChange={() => handleToggle(inv.id)}
                          color="primary"
                          size="small"
                        />
                      }
                      label={
                        <Box display="flex" alignItems="center">
                          <Typography variant="body2">{inv.name}</Typography>
                          <Typography className={classes.hostCount}>
                            ({inv.hostCount} hosts)
                          </Typography>
                        </Box>
                      }
                    />
                    {wasPinned && isPinned && (
                      <Chip
                        label="pinned"
                        size="small"
                        className={classes.pinnedChip}
                        style={{
                          backgroundColor: EXECUTION_COLORS.succeeded.bg,
                          color: EXECUTION_COLORS.succeeded.fg,
                        }}
                      />
                    )}
                    {!wasPinned && isPinned && (
                      <Chip
                        label="will pin"
                        size="small"
                        className={classes.pinnedChip}
                        style={{
                          backgroundColor: EXECUTION_COLORS.running.bg,
                          color: EXECUTION_COLORS.running.fg,
                        }}
                      />
                    )}
                    {wasPinned && !isPinned && (
                      <Chip
                        label="will unpin"
                        size="small"
                        className={classes.pinnedChip}
                        style={{
                          backgroundColor: EXECUTION_COLORS.pending.bg,
                          color: EXECUTION_COLORS.pending.fg,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </Box>
          );
        })()}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleApply}
          disabled={!hasChanges || submitting}
          color="primary"
          variant="contained"
        >
          {submitting ? <CircularProgress size={20} /> : 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
