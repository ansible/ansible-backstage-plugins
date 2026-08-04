import { useState, useEffect, useMemo, useCallback } from 'react';
import type { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import {
  Typography,
  Chip,
  Card,
  Drawer,
  IconButton,
  Divider,
  LinearProgress,
  Button,
  makeStyles,
} from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import WarningIcon from '@material-ui/icons/Warning';
import BookmarkIcon from '@material-ui/icons/Bookmark';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import CancelIcon from '@material-ui/icons/Cancel';
import type {
  HostPosture,
  HostFindingSummary,
} from '@ansible/backstage-compliance-common/types';
import { isOutlier } from './hostUtils';
import {
  scoreColor,
  SEVERITY_COLORS,
  STATUS_COLORS,
  SURFACE_COLORS,
} from '../shared/colors';
import { complianceApiRef } from '../../api';
import type { ResolvedDisplayConfig } from '../ResultsViewer/hooks/useDisplayConfig';

const useStyles = makeStyles(theme => ({
  drawer: { width: 420, padding: theme.spacing(3) },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  scoreRow: {
    display: 'flex',
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(2),
  },
  scoreCard: {
    flex: 1,
    padding: theme.spacing(1.5),
    textAlign: 'center' as const,
  },
  chipRow: {
    display: 'flex',
    gap: theme.spacing(0.75),
    marginBottom: theme.spacing(2),
  },
  findingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: theme.spacing(0.5, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': { borderBottom: 'none' },
  },
  findingTitle: {
    fontSize: '0.78rem',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  severityChip: { fontSize: '0.6rem', height: 18, cursor: 'pointer' },
  findingsScroll: {
    maxHeight: 300,
    overflowY: 'auto' as const,
    marginTop: theme.spacing(1),
  },
}));

interface HostDetailDrawerProps {
  host: HostPosture;
  allHosts: HostPosture[];
  onClose: () => void;
  profileLabel: string;
  baseline?: { rate: number; passCount: number; ruleCount: number };
  scanId: string;
  inventoryId: number;
  profileId: string;
  workflowJobId?: number;
  displayConfig?: ResolvedDisplayConfig;
}

export const HostDetailDrawer: FC<HostDetailDrawerProps> = ({
  host,
  allHosts,
  onClose,
  profileLabel,
  baseline,
  scanId: _scanId,
  inventoryId,
  profileId,
  workflowJobId,
  displayConfig,
}) => {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useApi(complianceApiRef);
  const mean =
    allHosts.reduce((a, h) => a + h.compliancePct, 0) / allHosts.length;

  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [findings, setFindings] = useState<HostFindingSummary[] | null>(null);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!host.hostname || !profileId || !inventoryId) return;
    setFindingsLoading(true);
    setSeverityFilter(null);
    setExpanded(false);
    api
      .getHostFindings(inventoryId, host.hostname, profileId, 100)
      .then(resp => setFindings(resp.findings))
      .catch(() => setFindings(null))
      .finally(() => setFindingsLoading(false));
  }, [api, host.hostname, profileId, inventoryId]);

  const filteredFindings = useMemo(() => {
    if (!findings) return [];
    return severityFilter
      ? findings.filter(fd => fd.severity === severityFilter)
      : findings;
  }, [findings, severityFilter]);

  const displayFindings = expanded
    ? filteredFindings
    : filteredFindings.slice(0, 15);
  const hasMore = filteredFindings.length > 15 && !expanded;

  const toggleSeverity = useCallback(
    (sev: string) => setSeverityFilter(prev => (prev === sev ? null : sev)),
    [],
  );

  const severityChipStyle = useCallback(
    (sev: string, color: string) => ({
      backgroundColor: severityFilter === sev ? color : 'transparent',
      color: severityFilter === sev ? SURFACE_COLORS.onDark : color,
      border: `1px solid ${color}`,
      cursor: 'pointer',
      fontWeight: 600,
    }),
    [severityFilter],
  );

  return (
    <Drawer anchor="right" open onClose={onClose}>
      <div className={classes.drawer}>
        {/* Header */}
        <div className={classes.header}>
          <div>
            <Typography variant="h6" style={{ fontFamily: 'monospace' }}>
              {host.hostname}
            </Typography>
            {profileLabel && (
              <Typography
                variant="caption"
                color="textSecondary"
                style={{ fontStyle: 'italic', display: 'block' }}
              >
                {profileLabel}
              </Typography>
            )}
            {host.os && (
              <Typography variant="body2" color="textSecondary">
                {host.os}
              </Typography>
            )}
          </div>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </div>

        {/* Score cards — baseline primary when available */}
        <div className={classes.scoreRow}>
          {baseline ? (
            <>
              <Card variant="outlined" className={classes.scoreCard}>
                <Typography
                  variant="h5"
                  style={{ fontWeight: 700, color: scoreColor(baseline.rate) }}
                >
                  {baseline.rate}%
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  <BookmarkIcon
                    style={{
                      fontSize: 11,
                      verticalAlign: 'middle',
                      marginRight: 2,
                      color: STATUS_COLORS.info,
                    }}
                  />
                  Baseline
                </Typography>
              </Card>
              <Card variant="outlined" className={classes.scoreCard}>
                <Typography
                  variant="h5"
                  style={{
                    fontWeight: 700,
                    color: scoreColor(host.compliancePct),
                  }}
                >
                  {host.compliancePct}%
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Standard
                </Typography>
              </Card>
            </>
          ) : (
            <Card variant="outlined" className={classes.scoreCard}>
              <Typography
                variant="h5"
                style={{
                  fontWeight: 700,
                  color: scoreColor(host.compliancePct),
                }}
              >
                {host.compliancePct}%
              </Typography>
              <Typography
                variant="caption"
                color="textSecondary"
                style={{ textTransform: 'capitalize' }}
              >
                {displayConfig?.gaugeLabel ?? 'Compliance'}
              </Typography>
            </Card>
          )}
          <Card variant="outlined" className={classes.scoreCard}>
            <Typography variant="h5" style={{ fontWeight: 700 }}>
              {host.failCount}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              Failing Rules
            </Typography>
          </Card>
        </div>

        {/* Clickable severity chips */}
        <div className={classes.chipRow}>
          {host.catIFail > 0 && (
            <Chip
              size="small"
              label={`${host.catIFail} ${
                displayConfig?.severityLabel('CAT_I') ?? 'CAT I'
              }`}
              className={classes.severityChip}
              onClick={() => toggleSeverity('CAT_I')}
              style={severityChipStyle('CAT_I', SEVERITY_COLORS.CAT_I)}
            />
          )}
          <Chip
            size="small"
            label={`${host.catIIFail} ${
              displayConfig?.severityLabel('CAT_II') ?? 'CAT II'
            }`}
            className={classes.severityChip}
            onClick={() => toggleSeverity('CAT_II')}
            style={severityChipStyle('CAT_II', SEVERITY_COLORS.CAT_II)}
          />
          <Chip
            size="small"
            label={`${host.catIIIFail} ${
              displayConfig?.severityLabel('CAT_III') ?? 'CAT III'
            }`}
            className={classes.severityChip}
            onClick={() => toggleSeverity('CAT_III')}
            style={severityChipStyle('CAT_III', SEVERITY_COLORS.CAT_III)}
          />
        </div>

        {host.naCount > 0 && (
          <Typography
            variant="caption"
            color="textSecondary"
            style={{ display: 'block', marginBottom: 12 }}
          >
            {host.naCount} rules not applicable
          </Typography>
        )}

        {isOutlier(host, allHosts) && (
          <Card
            variant="outlined"
            style={{
              padding: 12,
              marginBottom: 16,
              borderColor: STATUS_COLORS.error,
              backgroundColor: 'rgba(201,25,11,0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <WarningIcon
                style={{ color: STATUS_COLORS.error, fontSize: 20 }}
              />
              <div>
                <Typography
                  variant="body2"
                  style={{ fontWeight: 600, color: STATUS_COLORS.error }}
                >
                  Outlier Host
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Deviates significantly from the inventory average (
                  {mean.toFixed(1)}%).
                </Typography>
              </div>
            </div>
          </Card>
        )}

        <Divider style={{ margin: '8px 0 16px' }} />

        {/* Findings list */}
        <Typography variant="subtitle2" gutterBottom>
          Findings
          {severityFilter
            ? ` — ${
                displayConfig?.severityLabel(severityFilter) ??
                severityFilter.replace('_', ' ')
              }`
            : ''}
          {filteredFindings.length > 0 && (
            <Typography
              component="span"
              variant="caption"
              color="textSecondary"
              style={{ marginLeft: 8 }}
            >
              ({filteredFindings.filter(f => f.status === 'fail').length}{' '}
              failing)
            </Typography>
          )}
        </Typography>

        {findingsLoading && <LinearProgress style={{ marginBottom: 8 }} />}

        {!findingsLoading && findings && filteredFindings.length === 0 && (
          <Typography variant="body2" color="textSecondary">
            {severityFilter
              ? 'No findings at this severity level.'
              : 'No findings recorded for this host.'}
          </Typography>
        )}

        {!findingsLoading && findings && filteredFindings.length > 0 && (
          <div className={classes.findingsScroll}>
            {displayFindings.map(f => (
              <div key={f.ruleId} className={classes.findingRow}>
                {f.status === 'fail' ? (
                  <CancelIcon
                    style={{
                      fontSize: 16,
                      color: STATUS_COLORS.error,
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <CheckCircleIcon
                    style={{
                      fontSize: 16,
                      color: STATUS_COLORS.success,
                      flexShrink: 0,
                    }}
                  />
                )}
                <Chip
                  size="small"
                  label={
                    displayConfig?.severityLabel(f.severity) ??
                    f.severity.replace('_', ' ')
                  }
                  style={{
                    fontSize: '0.55rem',
                    height: 16,
                    flexShrink: 0,
                    backgroundColor:
                      SEVERITY_COLORS[
                        f.severity as keyof typeof SEVERITY_COLORS
                      ] ?? STATUS_COLORS.neutral,
                    color: SURFACE_COLORS.onDark,
                  }}
                />
                <Typography className={classes.findingTitle} title={f.title}>
                  {f.title}
                </Typography>
              </div>
            ))}
            {hasMore && (
              <Button
                size="small"
                color="primary"
                style={{ marginTop: 4, textTransform: 'none' }}
                onClick={() => setExpanded(true)}
              >
                Show all {filteredFindings.length} findings
              </Button>
            )}
          </div>
        )}

        <Divider style={{ margin: '12px 0' }} />

        <Typography
          variant="body2"
          color="textSecondary"
          style={{ marginBottom: 4 }}
        >
          {host.passCount} rules passing · {host.failCount} rules failing
          {host.naCount > 0 ? ` · ${host.naCount} not applicable` : ''}
        </Typography>

        {workflowJobId ? (
          <Typography
            variant="body2"
            color="primary"
            style={{ marginTop: 8, cursor: 'pointer' }}
            onClick={() => {
              onClose();
              navigate(
                `/compliance/results/${workflowJobId}?host=${encodeURIComponent(
                  host.hostname,
                )}`,
              );
            }}
          >
            View detailed findings for {host.hostname} →
          </Typography>
        ) : (
          <Typography
            variant="body2"
            color="textSecondary"
            style={{ marginTop: 8 }}
          >
            Run a scan to view detailed findings
          </Typography>
        )}
      </div>
    </Drawer>
  );
};
