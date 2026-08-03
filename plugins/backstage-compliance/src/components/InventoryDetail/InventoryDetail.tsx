import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useUrlToggle } from '../../hooks/useUrlToggle';
import { InfoCard } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import {
  Typography,
  LinearProgress,
  Card,
  Chip,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  Button,
  ButtonGroup,
  makeStyles,
} from '@material-ui/core';
import AssessmentIcon from '@material-ui/icons/Assessment';
import VerifiedUserIcon from '@material-ui/icons/VerifiedUser';
import BookmarkIcon from '@material-ui/icons/Bookmark';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import type { DashboardStats, HostPostureResponse, ProfileDisplayConfig } from '@ansible/backstage-compliance-common/types';
import { complianceApiRef } from '../../api';
import { HostPostureView } from './HostPostureView';
import { LaunchScanDialog } from './LaunchScanDialog';
import { isOutlier } from './hostUtils';
import { STATUS_COLORS, scoreColor } from '../shared/colors';
import { useDisplayConfig } from '../ResultsViewer/hooks/useDisplayConfig';

const useStyles = makeStyles(theme => ({
  summaryRow: {
    display: 'flex', gap: theme.spacing(2), marginBottom: theme.spacing(2), flexWrap: 'wrap' as const,
  },
  summaryCard: {
    padding: theme.spacing(1.5, 2), textAlign: 'center' as const, minWidth: 90, flex: '1 1 90px',
  },
  summaryValue: { fontSize: '1.5rem', fontWeight: 700 },
  summaryLabel: { fontSize: '0.75rem', color: theme.palette.text.secondary },
  osChip: {
    cursor: 'pointer', marginTop: 4,
    transition: 'box-shadow 0.15s ease',
    '&:hover': { boxShadow: '0 1px 4px rgba(0,0,0,0.15)' },
  },
  osChipActive: {
    backgroundColor: `${theme.palette.primary.main} !important`,
    color: '#fff !important',
  },
  legend: {
    display: 'flex', gap: theme.spacing(2), marginBottom: theme.spacing(1.5), flexWrap: 'wrap' as const,
  },
  legendItem: {
    display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: theme.palette.text.secondary,
  },
  legendDot: { width: 12, height: 12, borderRadius: '50%', border: '2px solid' },
  controls: {
    display: 'flex', alignItems: 'center', gap: theme.spacing(2), marginBottom: theme.spacing(1),
  },
  profileSelect: { minWidth: 200 },
  empty: {
    textAlign: 'center' as const, padding: theme.spacing(6), color: theme.palette.text.secondary,
  },
  subheaderRow: {
    display: 'flex', alignItems: 'center', gap: theme.spacing(1.5),
  },
  clickableCard: {
    cursor: 'pointer',
    transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
    '&:hover': {
      boxShadow: '0 1px 6px rgba(0,0,0,0.12)',
      borderColor: theme.palette.primary.main,
    },
  },
}));

export const InventoryDetail: React.FC = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const { inventoryId } = useParams<{ inventoryId: string }>();
  const [searchParams] = useSearchParams();
  const api = useApi(complianceApiRef);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [hostData, setHostData] = useState<HostPostureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [osFilter, setOsFilter] = useUrlToggle<string>('osFilter', '');
  const [postureMode, setPostureMode] = useUrlToggle<'standard' | 'baseline'>('postureMode', 'standard');
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [workflowJobId, setWorkflowJobId] = useState<number | undefined>();
  const [rawDisplayConfig, setRawDisplayConfig] = useState<ProfileDisplayConfig | undefined>(undefined);

  const invId = Number(inventoryId);

  const inventory = useMemo(
    () => stats?.byInventory.find(inv => inv.inventoryId === invId),
    [stats, invId],
  );

  const profileOptions = useMemo(
    () => inventory?.profileScores.map(ps => ({ value: ps.profileId, label: ps.name })) ?? [],
    [inventory],
  );

  const selectedProfileName = useMemo(
    () => profileOptions.find(p => p.value === selectedProfileId)?.label ?? '',
    [profileOptions, selectedProfileId],
  );

  useEffect(() => {
    api.getDashboardStats().then(s => {
      setStats(s);
      const inv = s.byInventory.find(i => i.inventoryId === invId);
      if (inv?.profileScores.length) {
        const urlProfile = searchParams.get('profile') || searchParams.get('profileId');
        const match = urlProfile && inv.profileScores.find(
          ps => ps.profileId === urlProfile || ps.scanTags === urlProfile,
        );
        setSelectedProfileId(match ? match.profileId : inv.profileScores[0].profileId);
      }
    }).catch(err => { console.error('Failed to load dashboard stats:', err); }).finally(() => setLoading(false));
  }, [api, invId, searchParams]);

  useEffect(() => {
    if (!selectedProfileId) return;
    api.getRegisteredProfile(selectedProfileId).then(profile => {
      setRawDisplayConfig(profile?.displayConfig);
    }).catch(err => { console.warn('Failed to load profile display config:', err); });
  }, [api, selectedProfileId]);

  const displayConfig = useDisplayConfig(rawDisplayConfig);

  useEffect(() => {
    if (!selectedProfileId || !invId) return;
    setLoading(true);
    api.getHostPosture(invId, selectedProfileId, { baselineView: postureMode === 'baseline' })
      .then(setHostData)
      .catch(err => { console.error('Failed to load host posture:', err); setHostData(null); })
      .finally(() => setLoading(false));
    api.getAuthoritativeScan(selectedProfileId, invId)
      .then(result => setWorkflowJobId(result?.scan.workflowJobId ?? undefined))
      .catch(() => setWorkflowJobId(undefined));
  }, [api, invId, selectedProfileId, postureMode]);

  const hosts = hostData?.hosts ?? [];
  const filteredHosts = useMemo(
    () => osFilter ? hosts.filter(h => h.os === osFilter) : hosts,
    [hosts, osFilter],
  );

  const { outlierCount, overallCompliance } = useMemo(() => {
    const outliers = filteredHosts.filter(h => isOutlier(h, filteredHosts)).length;
    const pass = filteredHosts.reduce((a, h) => a + h.passCount, 0);
    const fail = filteredHosts.reduce((a, h) => a + h.failCount, 0);
    const total = filteredHosts.reduce((a, h) => a + h.passCount + h.failCount, 0);
    const compliance = displayConfig.computeScore(pass, fail, total);
    return { outlierCount: outliers, totalPass: pass, totalApplicable: total, overallCompliance: compliance };
  }, [filteredHosts, displayConfig]);

  const selectedBaseline = useMemo(
    () => inventory?.profileScores.find(ps => ps.profileId === selectedProfileId)?.baseline ?? null,
    [inventory, selectedProfileId],
  );

  const osEntries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hosts) if (h.os) counts.set(h.os, (counts.get(h.os) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [hosts]);

  const navigateToScanResults = useCallback(async (baselineView = false) => {
    if (!selectedProfileId || !invId) return;
    try {
      const result = await api.getAuthoritativeScan(selectedProfileId, invId);
      if (result?.scan.workflowJobId) {
        const path = `/compliance/results/${result.scan.workflowJobId}`;
        navigate(baselineView ? `${path}?baselineView=true` : path);
      }
    } catch { /* no scan available */ }
  }, [api, selectedProfileId, invId, navigate]);

  if (loading && !stats) return <LinearProgress />;

  return (
    <InfoCard
      title={inventory?.inventoryName ?? `Inventory ${inventoryId}`}
      subheader={
        hostData ? (
          <div className={classes.subheaderRow}>
            <Typography variant="body2" color="textSecondary">
              Last scanned {new Date(hostData.scanTimestamp).toLocaleString()}
            </Typography>
            <Tooltip title={hostData.scanType === 'verification'
              ? 'Verification scan — a post-remediation re-assessment that evaluates all rules to confirm remediation effectiveness'
              : 'Assessment scan — a full compliance evaluation of all rules in the profile against the target inventory'}>
              <Chip
                size="small"
                variant="outlined"
                icon={hostData.scanType === 'verification' ? <VerifiedUserIcon style={{ fontSize: 14 }} /> : <AssessmentIcon style={{ fontSize: 14 }} />}
                label={hostData.scanType === 'verification' ? 'Verification' : 'Assessment'}
                style={hostData.scanType === 'verification'
                  ? { borderColor: STATUS_COLORS.info, color: STATUS_COLORS.info, fontSize: '0.7rem', height: 22 }
                  : { fontSize: '0.7rem', height: 22 }}
              />
            </Tooltip>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PlayArrowIcon />}
              onClick={e => { e.stopPropagation(); setScanDialogOpen(true); }}
              style={{ textTransform: 'none', fontSize: '0.8rem' }}
            >
              Scan Now
            </Button>
          </div>
        ) : undefined
      }
    >
      {loading && <LinearProgress />}

      {hosts.length === 0 && !loading ? (
        <div className={classes.empty}>
          <AssessmentIcon style={{ fontSize: 64, color: STATUS_COLORS.neutral, marginBottom: 16 }} />
          <Typography variant="h6" color="textSecondary" gutterBottom>
            {hostData?.scanTimestamp ? 'Scan completed but no findings recorded' : 'No scan data for this profile'}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {hostData?.scanTimestamp
              ? 'The scan completed but produced no host-level findings. This may indicate a scanner configuration issue.'
              : `Run a compliance scan against this inventory with the "${selectedProfileName || 'selected'}" profile to see per-host results.`}
          </Typography>
        </div>
      ) : (
        <>
          {/* Profile selector */}
          {profileOptions.length > 1 && (
            <div className={classes.controls}>
              <FormControl variant="outlined" size="small" className={classes.profileSelect}>
                <InputLabel id="inv-profile-label">Compliance Profile</InputLabel>
                <Select labelId="inv-profile-label" value={selectedProfileId}
                  onChange={e => { setSelectedProfileId(e.target.value as string); setOsFilter(''); }}
                  label="Compliance Profile"
                >
                  {profileOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </div>
          )}

          {/* Baseline / Standard toggle */}
          {selectedBaseline && (
            <div className={classes.controls}>
              <ButtonGroup size="small" variant="outlined">
                <Tooltip title="Show compliance against the full standard" arrow>
                  <Button
                    variant={postureMode === 'standard' ? 'contained' : 'outlined'}
                    color={postureMode === 'standard' ? 'primary' : 'default'}
                    onClick={() => setPostureMode('standard')}
                    startIcon={<AssessmentIcon style={{ fontSize: 16 }} />}
                  >
                    Standard
                  </Button>
                </Tooltip>
                <Tooltip title="Show compliance against your pinned baseline (curated rule set)" arrow>
                  <Button
                    variant={postureMode === 'baseline' ? 'contained' : 'outlined'}
                    color={postureMode === 'baseline' ? 'primary' : 'default'}
                    onClick={() => setPostureMode('baseline')}
                    startIcon={<BookmarkIcon style={{ fontSize: 16 }} />}
                  >
                    Baseline
                  </Button>
                </Tooltip>
              </ButtonGroup>
            </div>
          )}

          {/* Summary row */}
          <div className={classes.summaryRow}>
            <Card variant="outlined" className={classes.summaryCard}>
              <Typography className={classes.summaryValue}>
                {osFilter ? `${filteredHosts.length}/${hosts.length}` : hosts.length}
              </Typography>
              <Typography className={classes.summaryLabel}>
                {osFilter ? 'Filtered / Total' : 'Total Hosts'}
              </Typography>
            </Card>
            {osEntries.length > 0 && (
              <Card variant="outlined" className={classes.summaryCard}>
                <Typography className={classes.summaryLabel} style={{ marginBottom: 4 }}>Operating Systems</Typography>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                  {osEntries.map(([os, count]) => (
                    <Tooltip key={os} title={osFilter === os ? 'Click to clear filter' : `Filter to ${os} only`} arrow>
                      <Chip size="small" label={`${os} (${count})`}
                        className={`${classes.osChip} ${osFilter === os ? classes.osChipActive : ''}`}
                        variant={osFilter === os ? 'default' : 'outlined'}
                        onClick={() => setOsFilter(osFilter === os ? '' : os)}
                      />
                    </Tooltip>
                  ))}
                </div>
              </Card>
            )}
            <Card variant="outlined" className={classes.summaryCard}>
              <Typography className={classes.summaryValue} style={{ color: STATUS_COLORS.success }}>
                {filteredHosts.length - outlierCount}
              </Typography>
              <Typography className={classes.summaryLabel}>Compliant</Typography>
            </Card>
            <Card variant="outlined" className={classes.summaryCard}>
              <Typography className={classes.summaryValue} style={{ color: STATUS_COLORS.error }}>
                {outlierCount}
              </Typography>
              <Typography className={classes.summaryLabel}>Outliers</Typography>
            </Card>
            <Tooltip title="View scan results" arrow>
              <Card variant="outlined" className={`${classes.summaryCard} ${classes.clickableCard}`}
                onClick={e => { e.stopPropagation(); navigateToScanResults(false); }}>
                <Typography className={classes.summaryValue}>{overallCompliance}%</Typography>
                <Typography className={classes.summaryLabel} style={{ textTransform: 'capitalize' }}>{displayConfig.gaugeLabel}</Typography>
              </Card>
            </Tooltip>
            {selectedBaseline && (
              <Tooltip title="View baseline scan results" arrow>
                <Card variant="outlined" className={`${classes.summaryCard} ${classes.clickableCard}`}
                  onClick={e => { e.stopPropagation(); navigateToScanResults(true); }}>
                  <Typography className={classes.summaryValue} style={{ color: scoreColor(selectedBaseline.rate) }}>
                    {selectedBaseline.rate}%
                  </Typography>
                  <Typography className={classes.summaryLabel}>
                    <BookmarkIcon style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2, color: STATUS_COLORS.info }} />
                    Baseline ({selectedBaseline.passCount}/{selectedBaseline.ruleCount} rules)
                  </Typography>
                </Card>
              </Tooltip>
            )}
          </div>

          {/* Legend */}
          <div className={classes.legend}>
            <div className={classes.legendItem}>
              <div className={classes.legendDot} style={{ borderColor: STATUS_COLORS.success, backgroundColor: 'rgba(62,134,53,0.08)' }} />
              Compliant
            </div>
            <div className={classes.legendItem}>
              <div className={classes.legendDot} style={{ borderColor: STATUS_COLORS.warning, backgroundColor: 'rgba(240,171,0,0.08)' }} />
              {displayConfig.severityLabel('CAT_I')} findings
            </div>
            <div className={classes.legendItem}>
              <div className={classes.legendDot} style={{ borderColor: STATUS_COLORS.error, backgroundColor: 'rgba(201,25,11,0.08)' }} />
              Outlier
            </div>
          </div>

          <Divider style={{ margin: '12px 0 16px' }} />

          {/* Host posture visualization */}
          <HostPostureView
            hosts={hosts}
            osFilter={osFilter}
            profileLabel={selectedProfileName}
            baseline={selectedBaseline ? { rate: selectedBaseline.rate, passCount: selectedBaseline.passCount, ruleCount: selectedBaseline.ruleCount } : undefined}
            scanId={hostData?.scanId ?? ''}
            inventoryId={invId}
            profileId={selectedProfileId}
            workflowJobId={workflowJobId}
            displayConfig={displayConfig}
          />
        </>
      )}
      <LaunchScanDialog
        open={scanDialogOpen}
        onClose={() => setScanDialogOpen(false)}
        inventoryId={invId}
        inventoryName={inventory?.inventoryName ?? ''}
        profileOptions={profileOptions}
        initialProfileId={selectedProfileId}
      />
    </InfoCard>
  );
};
