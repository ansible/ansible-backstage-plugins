import { useState } from 'react';
import type { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Typography,
  Tooltip,
  IconButton,
  makeStyles,
} from '@material-ui/core';
import BookmarkIcon from '@material-ui/icons/Bookmark';
import BookmarkBorderIcon from '@material-ui/icons/BookmarkBorder';
import type {
  InventoryPosture,
  BaselineTarget,
} from '@ansible/backstage-compliance-common/types';
import { ComplianceGauge, getColor } from './ComplianceGauge';
import { PinBaselineDialog } from './PinBaselineDialog';
import { STATUS_COLORS } from '../shared/colors';

const useStyles = makeStyles(theme => ({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: theme.spacing(2),
    padding: theme.spacing(1, 0),
  },
  card: {
    padding: theme.spacing(2),
  },
  inventoryName: {
    fontWeight: 600,
    marginBottom: theme.spacing(1),
  },
  gaugeRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
    gap: theme.spacing(3),
  },
  gaugeSlot: {
    flex: '0 0 120px',
    maxWidth: 140,
    textAlign: 'center' as const,
  },
  pinRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    height: 24,
    marginBottom: -4,
  },
  pinButton: {
    padding: 2,
  },
  baselineAnnotation: {
    textAlign: 'center' as const,
    marginTop: theme.spacing(0.5),
    fontSize: '0.75rem',
    lineHeight: 1.4,
  },
  baselineRate: {
    fontWeight: 600,
  },
  baselineRemaining: {
    color: theme.palette.text.secondary,
    fontSize: '0.7rem',
  },
}));

type PostureMode = 'standard' | 'baseline';

interface InventoryPostureViewProps {
  byInventory: InventoryPosture[];
  postureMode: PostureMode;
  baselineTargets: BaselineTarget[];
  onGaugeClick?: (profileId: string, inventoryId: number) => void;
  onBaselineChanged?: (switchToBaseline?: boolean) => void;
}

export const InventoryPostureView: FC<InventoryPostureViewProps> = ({
  byInventory,
  postureMode,
  baselineTargets,
  onGaugeClick,
  onBaselineChanged,
}) => {
  const classes = useStyles();
  const navigate = useNavigate();
  const [pinDialog, setPinDialog] = useState<{
    complianceProfileId: string;
    complianceProfileName: string;
    inventoryId: number;
    inventoryName: string;
    existing?: BaselineTarget;
  } | null>(null);

  if (byInventory.length === 0) {
    return (
      <Typography
        variant="body2"
        color="textSecondary"
        style={{ textAlign: 'center', padding: 24 }}
      >
        No inventory-level posture data available. Run scans to see
        per-inventory scores.
      </Typography>
    );
  }

  const getBaselineForPair = (profileId: string, inventoryId: number) =>
    baselineTargets.find(
      bt =>
        bt.complianceProfileId === profileId && bt.inventoryId === inventoryId,
    );

  return (
    <>
      <div className={classes.grid}>
        {byInventory.map(inv => (
          <Card
            key={inv.inventoryId}
            variant="outlined"
            className={classes.card}
          >
            <Typography
              className={classes.inventoryName}
              style={{ cursor: 'pointer', color: STATUS_COLORS.info }}
              onClick={() =>
                navigate(`/compliance/inventories/${inv.inventoryId}`)
              }
            >
              {inv.inventoryName}
            </Typography>
            <div className={classes.gaugeRow}>
              {inv.profileScores.map(ps => {
                const bl = ps.baseline;
                const existing = getBaselineForPair(
                  ps.profileId,
                  inv.inventoryId,
                );
                const showBaseline = postureMode === 'baseline' && bl;
                const gaugeValue = showBaseline ? bl!.rate : ps.rate;
                const gaugeSubtitle = showBaseline
                  ? `${bl!.passCount}/${bl!.ruleCount} baseline rules`
                  : `${ps.passCount}/${ps.passCount + ps.failCount}`;

                return (
                  <div key={ps.profileId} className={classes.gaugeSlot}>
                    <div className={classes.pinRow}>
                      <Tooltip
                        title={
                          existing
                            ? `Baseline: ${
                                bl?.remediationProfileName ?? 'pinned'
                              } — click to manage`
                            : 'Pin a baseline to track targeted compliance'
                        }
                      >
                        <IconButton
                          className={classes.pinButton}
                          size="small"
                          aria-label={
                            existing
                              ? 'Manage pinned baseline'
                              : 'Pin a baseline'
                          }
                          onClick={e => {
                            e.stopPropagation();
                            setPinDialog({
                              complianceProfileId: ps.profileId,
                              complianceProfileName: ps.name,
                              inventoryId: inv.inventoryId,
                              inventoryName: inv.inventoryName,
                              existing,
                            });
                          }}
                        >
                          {existing ? (
                            <BookmarkIcon
                              fontSize="small"
                              style={{ color: STATUS_COLORS.info }}
                            />
                          ) : (
                            <BookmarkBorderIcon
                              fontSize="small"
                              color="disabled"
                            />
                          )}
                        </IconButton>
                      </Tooltip>
                    </div>
                    <ComplianceGauge
                      value={gaugeValue}
                      label={ps.name}
                      subtitle={gaugeSubtitle}
                      clickable={!!onGaugeClick}
                      onClick={() =>
                        onGaugeClick?.(ps.profileId, inv.inventoryId)
                      }
                      dimmed={postureMode === 'baseline' && !bl}
                    />
                    {postureMode === 'standard' && bl && (
                      <div className={classes.baselineAnnotation}>
                        <span
                          className={classes.baselineRate}
                          style={{ color: getColor(bl.rate) }}
                        >
                          Baseline: {bl.rate}%
                        </span>
                        <br />
                        <span className={classes.baselineRemaining}>
                          {bl.ruleCount - bl.passCount > 0
                            ? `${bl.ruleCount - bl.passCount} rules to go`
                            : 'target met'}
                        </span>
                      </div>
                    )}
                    {postureMode === 'baseline' && bl && (
                      <div className={classes.baselineAnnotation}>
                        <span
                          className={classes.baselineRate}
                          style={{ color: getColor(ps.rate) }}
                        >
                          Standard: {ps.rate}%
                        </span>
                        <br />
                        <span className={classes.baselineRemaining}>
                          {ps.passCount}/{ps.passCount + ps.failCount} rules
                        </span>
                      </div>
                    )}
                    {postureMode === 'baseline' && !bl && (
                      <Typography
                        variant="caption"
                        color="textSecondary"
                        style={{
                          textAlign: 'center',
                          display: 'block',
                          marginTop: 4,
                        }}
                      >
                        No baseline pinned
                      </Typography>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {pinDialog && (
        <PinBaselineDialog
          open
          onClose={() => setPinDialog(null)}
          complianceProfileId={pinDialog.complianceProfileId}
          complianceProfileName={pinDialog.complianceProfileName}
          inventoryId={pinDialog.inventoryId}
          inventoryName={pinDialog.inventoryName}
          existingBaseline={pinDialog.existing}
          onPinned={() => onBaselineChanged?.(true)}
        />
      )}
    </>
  );
};
