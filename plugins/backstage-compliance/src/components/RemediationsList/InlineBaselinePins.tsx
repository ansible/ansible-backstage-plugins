import { useState, useEffect, useMemo } from 'react';
import {
  Typography,
  Checkbox,
  FormControlLabel,
  Chip,
  Button,
  Box,
  CircularProgress,
  makeStyles,
} from '@material-ui/core';
import { useApi, alertApiRef } from '@backstage/core-plugin-api';
import type { BaselineTarget } from '@ansible/backstage-compliance-common/types';
import { complianceApiRef } from '../../api';
import { scoreColor, EXECUTION_COLORS } from '../shared/colors';

const useStyles = makeStyles(theme => ({
  inventoryRow: {
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(0.5, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': { borderBottom: 'none' },
  },
  inventoryLabel: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  chip: {
    height: 20,
    fontSize: '0.7rem',
  },
  rateChip: {
    height: 20,
    fontSize: '0.7rem',
    fontWeight: 600,
  },
}));

interface InlineBaselinePinsProps {
  remediationProfileId: string;
  complianceProfileId: string;
  inventories: Array<{ id: number; name: string; hostCount: number }>;
  currentPins: BaselineTarget[];
  onChanged: () => void;
}

export const InlineBaselinePins = ({
  remediationProfileId,
  complianceProfileId,
  inventories,
  currentPins,
  onChanged,
}: InlineBaselinePinsProps) => {
  const classes = useStyles();
  const api = useApi(complianceApiRef);
  const alertApi = useApi(alertApiRef);

  const pinsForThis = useMemo(
    () =>
      currentPins.filter(
        bt =>
          bt.remediationProfileId === remediationProfileId &&
          bt.complianceProfileId === complianceProfileId,
      ),
    [currentPins, remediationProfileId, complianceProfileId],
  );
  const initialPinnedIds = useMemo(
    () => new Set(pinsForThis.map(bt => bt.inventoryId)),
    [pinsForThis],
  );
  const pinsKey = useMemo(
    () =>
      pinsForThis
        .map(p => p.inventoryId)
        .sort()
        .join(','),
    [pinsForThis],
  );

  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(initialPinnedIds),
  );
  const [submitting, setSubmitting] = useState(false);
  const [scores, setScores] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    setSelectedIds(new Set(initialPinnedIds));
  }, [initialPinnedIds]);

  useEffect(() => {
    if (pinsForThis.length === 0) return;
    api
      .getBaselineScores(remediationProfileId)
      .then(data => {
        const map = new Map<number, number>();
        for (const s of data) map.set(s.inventoryId, s.passRate);
        setScores(map);
      })
      .catch(() => {});
  }, [api, remediationProfileId, pinsKey, pinsForThis.length]);

  const hasChanges = (() => {
    if (selectedIds.size !== initialPinnedIds.size) return true;
    for (const id of selectedIds) {
      if (!initialPinnedIds.has(id)) return true;
    }
    return false;
  })();

  const handleToggle = (inventoryId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(inventoryId)) next.delete(inventoryId);
      else next.add(inventoryId);
      return next;
    });
  };

  const handleApply = async () => {
    setSubmitting(true);
    try {
      const toPin = [...selectedIds].filter(id => !initialPinnedIds.has(id));
      const toUnpin = pinsForThis.filter(
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

  const getRateColor = (rate: number) => ({ bg: scoreColor(rate), fg: '#fff' });

  return (
    <div>
      <Typography variant="subtitle2" gutterBottom>
        Baseline Inventories
      </Typography>
      {inventories.map(inv => {
        const isPinned = selectedIds.has(inv.id);
        const wasPinned = initialPinnedIds.has(inv.id);
        const rate = scores.get(inv.id);

        let statusChip = null;
        if (wasPinned && isPinned) {
          statusChip = (
            <Chip
              label="pinned"
              size="small"
              className={classes.chip}
              style={{
                backgroundColor: EXECUTION_COLORS.succeeded.bg,
                color: EXECUTION_COLORS.succeeded.fg,
              }}
            />
          );
        } else if (!wasPinned && isPinned) {
          statusChip = (
            <Chip
              label="will pin"
              size="small"
              className={classes.chip}
              style={{
                backgroundColor: EXECUTION_COLORS.running.bg,
                color: EXECUTION_COLORS.running.fg,
              }}
            />
          );
        } else if (wasPinned && !isPinned) {
          statusChip = (
            <Chip
              label="will unpin"
              size="small"
              className={classes.chip}
              style={{
                backgroundColor: EXECUTION_COLORS.pending.bg,
                color: EXECUTION_COLORS.pending.fg,
              }}
            />
          );
        }

        const rateColors = rate !== undefined ? getRateColor(rate) : null;

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
              label=""
              style={{ marginRight: 0 }}
            />
            <div className={classes.inventoryLabel}>
              <Typography variant="body2">{inv.name}</Typography>
              <Typography variant="caption" color="textSecondary">
                ({inv.hostCount} hosts)
              </Typography>
              {statusChip}
              {rateColors && wasPinned && isPinned && (
                <Chip
                  label={`${rate}%`}
                  size="small"
                  className={classes.rateChip}
                  style={{
                    backgroundColor: rateColors.bg,
                    color: rateColors.fg,
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
      {hasChanges && (
        <Box mt={1} display="flex" justifyContent="flex-end">
          <Button
            variant="contained"
            color="primary"
            size="small"
            disabled={submitting}
            onClick={handleApply}
          >
            {submitting ? <CircularProgress size={16} /> : 'Apply'}
          </Button>
        </Box>
      )}
    </div>
  );
};
