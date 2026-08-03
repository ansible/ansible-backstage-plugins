import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUrlToggle } from '../../hooks/useUrlToggle';
import {
  InfoCard,
  StatusOK,
  StatusError,
  StatusWarning,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import {
  Card,
  CardContent,
  CardActionArea,
  Typography,
  LinearProgress,
  Chip,
  Box,
  Button,
  ButtonGroup,
  Tooltip,
  makeStyles,
} from '@material-ui/core';
import PlayCircleFilledIcon from '@material-ui/icons/PlayCircleFilled';
import SecurityIcon from '@material-ui/icons/Security';
import HistoryIcon from '@material-ui/icons/History';
import SettingsIcon from '@material-ui/icons/Settings';
import AssessmentIcon from '@material-ui/icons/Assessment';
import BuildIcon from '@material-ui/icons/Build';

import TrendingUpIcon from '@material-ui/icons/TrendingUp';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
import ArrowDownwardIcon from '@material-ui/icons/ArrowDownward';
import { ComplianceGauge } from './ComplianceGauge';
import { ContributingScansPopover } from './ContributingScansPopover';
import { InventoryPostureView } from './InventoryPostureView';
import { PinBaselineDialog } from './PinBaselineDialog';
import { PostureTrendChart } from './PostureTrendChart';
import { complianceApiRef } from '../../api';
import { CertificationBadge } from '../shared/CertificationBadge';
import { scoreColor, STATUS_COLORS, THRESHOLDS } from '../shared/colors';
import type { DashboardStats, PostureSnapshot, ComplianceProfile, BaselineTarget } from '@ansible/backstage-compliance-common/types';

const useStyles = makeStyles(theme => ({
  section: {
    marginBottom: theme.spacing(2),
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(2),
  },
  gaugeItem: {
    flex: '1 1 120px',
    minWidth: 120,
    maxWidth: 200,
    textAlign: 'center' as const,
  },
  statItem: {
    flex: '1 1 140px',
    minWidth: 140,
  },
  actionsColumn: {
    flex: '1 1 280px',
    maxWidth: 400,
  },
  scansColumn: {
    flex: '2 1 400px',
  },
  frameworkItem: {
    flex: '1 1 250px',
  },
  statCard: {
    textAlign: 'center',
    padding: theme.spacing(1.5),
  },
  statValue: {
    fontSize: '1.75rem',
    fontWeight: 700,
    lineHeight: 1.2,
  },
  statLabel: {
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
    marginTop: theme.spacing(0.5),
  },
  critical: { color: STATUS_COLORS.error },
  warning: { color: STATUS_COLORS.warning },
  success: { color: STATUS_COLORS.success },
  statDelta: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '0.75rem',
    fontWeight: 600,
    marginTop: theme.spacing(0.25),
    gap: 2,
    '& svg': { fontSize: '0.85rem' },
  },
  quickAction: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    padding: theme.spacing(2),
  },
  actionIcon: {
    fontSize: '2rem',
    color: theme.palette.primary.main,
  },
  complianceBar: {
    height: 6,
    borderRadius: 3,
  },
  scanRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing(1.5, 1),
    borderBottom: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    '&:last-child': { borderBottom: 'none' },
    '&:hover': { backgroundColor: theme.palette.action.hover },
    transition: 'background-color 0.15s ease',
  },
  frameworkCard: {
    height: '100%',
  },
  welcomeCard: {
    textAlign: 'center',
    padding: theme.spacing(6, 4),
  },
  welcomeStep: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(2),
    padding: theme.spacing(1.5, 0),
    textAlign: 'left',
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    backgroundColor: theme.palette.primary.main,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    flexShrink: 0,
  },
}));

export const ComplianceDashboard = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useApi(complianceApiRef);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [postureHistory, setPostureHistory] = useState<PostureSnapshot[]>([]);
  const [profiles, setProfiles] = useState<ComplianceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [postureView, setPostureView] = useUrlToggle<'profile' | 'inventory'>('postureView', 'profile');
  const [postureMode, setPostureMode] = useUrlToggle<'standard' | 'baseline'>('postureMode', 'standard');
  const [baselineTargets, setBaselineTargets] = useState<BaselineTarget[]>([]);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
  const [popoverProfile, setPopoverProfile] = useState<{ name: string; profileId: string; scans: Array<{ scanId: string; inventoryId: number; inventoryName: string; passRate: number; passCount: number; failCount: number; ruleCount: number; timestamp: string }> }>({ name: '', profileId: '', scans: [] });
  const [pinDialogFromPopover, setPinDialogFromPopover] = useState<{
    profileId: string;
    profileName: string;
    inventoryId: number;
    inventoryName: string;
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (refreshKey > 0) setLoading(true);
    Promise.all([
      api.getDashboardStats().catch(err => {
        console.error('Failed to load dashboard stats:', err);
        return null;
      }),
      api.getPostureHistory(undefined, 90).catch(err => {
        console.error('Failed to load posture history:', err);
        return [] as PostureSnapshot[];
      }),
      api.getRegisteredProfiles({ includeDisconnected: true }).catch(() => [] as ComplianceProfile[]),
      api.getBaselineTargets().catch(() => [] as BaselineTarget[]),
    ]).then(([dashboardStats, history, carts, baselines]) => {
      if (cancelled) return;
      setStats(dashboardStats);
      setPostureHistory(history);
      setProfiles(carts);
      setBaselineTargets(baselines);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, refreshKey]);

  // Determine if this is an "empty" state (no scan history)
  const isEmpty = !stats || (stats.recentScans.length === 0 && stats.hostsScanned === 0);

  const popoverBaselineMap = React.useMemo(() => {
    if (!stats || !popoverProfile.profileId) return new Map();
    const map = new Map<number, { remediationProfileName: string; rate: number; passCount: number; ruleCount: number }>();
    for (const inv of stats.byInventory) {
      const ps = inv.profileScores.find(p => p.profileId === popoverProfile.profileId);
      if (ps?.baseline) {
        map.set(inv.inventoryId, {
          remediationProfileName: ps.baseline.remediationProfileName,
          rate: ps.baseline.rate,
          passCount: ps.baseline.passCount,
          ruleCount: ps.baseline.ruleCount,
        });
      }
    }
    return map;
  }, [stats, popoverProfile.profileId]);

  if (loading) {
    return (
      <Box p={4}>
        <LinearProgress />
        <Typography variant="body2" align="center" style={{ marginTop: 16 }}>
          Loading dashboard...
        </Typography>
      </Box>
    );
  }

  // P3-3: Welcome / empty state when no scan history exists
  if (isEmpty) {
    return (
      <div>
        <div className={classes.section}>
          <InfoCard title="Welcome to AAP Compliance">
            <div className={classes.welcomeCard}>
              <SecurityIcon style={{ fontSize: 64, color: STATUS_COLORS.info, marginBottom: 16 }} />
              <Typography variant="h5" gutterBottom>
                Get Started with Compliance Scanning
              </Typography>
              <Typography variant="body1" color="textSecondary" paragraph>
                Scan your infrastructure against industry compliance frameworks like DISA STIG,
                CIS Benchmarks, and PCI-DSS. Review findings, build remediations, and
                bring your systems into compliance.
              </Typography>

              <Box maxWidth={480} mx="auto" mt={4}>
                <div className={classes.welcomeStep}>
                  <div className={classes.stepNumber}>1</div>
                  <div>
                    <Typography variant="subtitle1">Add a Compliance Profile</Typography>
                    <Typography variant="body2" color="textSecondary">
                      Map a compliance standard to a workflow job template in Settings.
                    </Typography>
                  </div>
                </div>
                <div className={classes.welcomeStep}>
                  <div className={classes.stepNumber}>2</div>
                  <div>
                    <Typography variant="subtitle1">Launch a Scan</Typography>
                    <Typography variant="body2" color="textSecondary">
                      Select a profile, choose an inventory, and run a compliance scan.
                    </Typography>
                  </div>
                </div>
                <div className={classes.welcomeStep}>
                  <div className={classes.stepNumber}>3</div>
                  <div>
                    <Typography variant="subtitle1">Review Findings</Typography>
                    <Typography variant="body2" color="textSecondary">
                      Analyze per-host results, build remediations, and apply fixes.
                    </Typography>
                  </div>
                </div>
              </Box>

              <Box mt={4} display="flex" justifyContent="center" style={{ gap: 16 }}>
                <Card variant="outlined">
                  <CardActionArea onClick={() => navigate('settings')}>
                    <div className={classes.quickAction}>
                      <SettingsIcon className={classes.actionIcon} />
                      <Typography variant="subtitle2">Configure Settings</Typography>
                    </div>
                  </CardActionArea>
                </Card>
                <Card variant="outlined">
                  <CardActionArea onClick={() => navigate('scan')}>
                    <div className={classes.quickAction}>
                      <PlayCircleFilledIcon className={classes.actionIcon} />
                      <Typography variant="subtitle2">New Scan</Typography>
                    </div>
                  </CardActionArea>
                </Card>
              </Box>
            </div>
          </InfoCard>
        </div>
      </div>
    );
  }

  const handleGaugeClick = (event: React.MouseEvent<HTMLElement>, fw: typeof stats.frameworkScores[0]) => {
    setPopoverProfile({ name: fw.name, profileId: fw.profileId, scans: fw.contributingScans });
    setPopoverAnchor(event.currentTarget);
  };

  return (
    <div>
      {/* Compliance Posture */}
      <div className={classes.section}>
        <InfoCard title="Compliance Posture" action={
          <Box display="flex" alignItems="center" style={{ gap: 12 }}>
            <ButtonGroup size="small" variant="outlined">
              <Tooltip title="Show compliance against the full standard">
                <Button
                  color={postureMode === 'standard' ? 'primary' : 'default'}
                  variant={postureMode === 'standard' ? 'contained' : 'outlined'}
                  onClick={() => setPostureMode('standard')}
                >
                  Standard
                </Button>
              </Tooltip>
              <Tooltip title="Show compliance against your pinned baseline (curated rule set)">
                <Button
                  color={postureMode === 'baseline' ? 'primary' : 'default'}
                  variant={postureMode === 'baseline' ? 'contained' : 'outlined'}
                  onClick={() => setPostureMode('baseline')}
                >
                  Baseline
                </Button>
              </Tooltip>
            </ButtonGroup>
            <ButtonGroup size="small" variant="outlined">
              <Button
                color={postureView === 'profile' ? 'primary' : 'default'}
                variant={postureView === 'profile' ? 'contained' : 'outlined'}
                onClick={() => setPostureView('profile')}
              >
                By Profile
              </Button>
              <Button
                color={postureView === 'inventory' ? 'primary' : 'default'}
                variant={postureView === 'inventory' ? 'contained' : 'outlined'}
                onClick={() => setPostureView('inventory')}
              >
                By Inventory
              </Button>
            </ButtonGroup>
          </Box>
        }>
          {postureView === 'profile' ? (
            <div className={classes.row} style={{ justifyContent: 'center' }}>
              {stats.frameworkScores.map(fw => {
                const showBaseline = postureMode === 'baseline' && fw.baseline;
                const gaugeValue = showBaseline ? fw.baseline!.rate : fw.rate;
                const gaugeSubtitle = showBaseline
                  ? `${Math.round(fw.baseline!.ruleCount / fw.baseline!.inventoryCount)} rules · ${fw.baseline!.inventoryCount} of ${fw.contributingScans.length} inv.`
                  : `${fw.passCount}/${fw.passCount + fw.failCount} rules passing`;
                return (
                  <div className={classes.gaugeItem} key={fw.profileId}>
                    <ComplianceGauge
                      value={gaugeValue}
                      label={fw.name}
                      subtitle={gaugeSubtitle}
                      onClick={e => handleGaugeClick(e, fw)}
                      clickable
                      dimmed={postureMode === 'baseline' && !fw.baseline}
                    />
                    {postureMode === 'standard' && fw.baseline && (
                      <Typography variant="caption" style={{ display: 'block', marginTop: 4, fontWeight: 600, color: scoreColor(fw.baseline.rate) }}>
                        Baseline: {fw.baseline.rate}%
                        <span style={{ fontWeight: 400, color: STATUS_COLORS.neutral }}> ({fw.baseline.inventoryCount} inv.)</span>
                      </Typography>
                    )}
                    {postureMode === 'baseline' && fw.baseline && (
                      <Typography variant="caption" style={{ display: 'block', marginTop: 4, fontWeight: 600, color: scoreColor(fw.rate) }}>
                        Standard: {fw.rate}%
                        <span style={{ fontWeight: 400, color: STATUS_COLORS.neutral }}> ({fw.passCount}/{fw.passCount + fw.failCount})</span>
                      </Typography>
                    )}
                    {postureMode === 'baseline' && !fw.baseline && (
                      <Typography variant="caption" style={{ display: 'block', marginTop: 4, color: STATUS_COLORS.neutral }}>
                        No baseline pinned
                      </Typography>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <InventoryPostureView
              byInventory={stats.byInventory}
              postureMode={postureMode}
              baselineTargets={baselineTargets}
              onBaselineChanged={(switchToBaseline) => {
                setRefreshKey(k => k + 1);
                if (switchToBaseline) setPostureMode('baseline');
              }}
              onGaugeClick={(profileId, inventoryId) => {
                const fw = stats.frameworkScores.find(f => f.profileId === profileId);
                const scan = fw?.contributingScans.find(s => s.inventoryId === inventoryId);
                if (scan) {
                  navigate(`results/${scan.workflowJobId ?? scan.scanId}`);
                }
              }}
            />
          )}
        </InfoCard>
      </div>

      <ContributingScansPopover
        anchorEl={popoverAnchor}
        onClose={() => setPopoverAnchor(null)}
        profileName={popoverProfile.name}
        scans={popoverProfile.scans}
        mode={postureMode}
        baselineByInventory={popoverBaselineMap}
        onPinBaseline={(inventoryId, inventoryName) => {
          setPopoverAnchor(null);
          setPinDialogFromPopover({
            profileId: popoverProfile.profileId,
            profileName: popoverProfile.name,
            inventoryId,
            inventoryName,
          });
        }}
      />

      {pinDialogFromPopover && (
        <PinBaselineDialog
          open
          onClose={() => setPinDialogFromPopover(null)}
          complianceProfileId={pinDialogFromPopover.profileId}
          complianceProfileName={pinDialogFromPopover.profileName}
          inventoryId={pinDialogFromPopover.inventoryId}
          inventoryName={pinDialogFromPopover.inventoryName}
          onPinned={() => {
            setPinDialogFromPopover(null);
            setRefreshKey(k => k + 1);
            setPostureMode('baseline');
          }}
        />
      )}

      {/* Key Metrics */}
      <div className={classes.section}>
        <div className={classes.row}>
          <div className={classes.statItem}>
            <InfoCard>
              <div className={classes.statCard}>
                <Typography className={classes.statValue}>{stats.hostsScanned}</Typography>
                <Typography className={classes.statLabel}>Hosts Scanned</Typography>
              </div>
            </InfoCard>
          </div>
          <div className={classes.statItem}>
            <InfoCard>
              <div className={classes.statCard}>
                <Typography className={`${classes.statValue} ${classes.critical}`}>{stats.criticalFindings}</Typography>
                <Typography className={classes.statLabel}>Critical (CAT I)</Typography>
                {stats.criticalFindingsDelta != null && stats.criticalFindingsDelta !== 0 && (
                  <Typography className={classes.statDelta} style={{ color: stats.criticalFindingsDelta > 0 ? STATUS_COLORS.error : STATUS_COLORS.success }}>
                    {stats.criticalFindingsDelta > 0
                      ? <><ArrowUpwardIcon />{stats.criticalFindingsDelta}</>
                      : <><ArrowDownwardIcon />{Math.abs(stats.criticalFindingsDelta)}</>
                    }
                  </Typography>
                )}
              </div>
            </InfoCard>
          </div>
          <div className={classes.statItem}>
            <InfoCard>
              <div className={classes.statCard}>
                <Typography className={`${classes.statValue} ${classes.warning}`}>{stats.pendingRemediation}</Typography>
                <Typography className={classes.statLabel}>Pending Remediation</Typography>
                {stats.pendingRemediationDelta != null && stats.pendingRemediationDelta !== 0 && (
                  <Typography className={classes.statDelta} style={{ color: stats.pendingRemediationDelta > 0 ? STATUS_COLORS.error : STATUS_COLORS.success }}>
                    {stats.pendingRemediationDelta > 0
                      ? <><ArrowUpwardIcon />{stats.pendingRemediationDelta}</>
                      : <><ArrowDownwardIcon />{Math.abs(stats.pendingRemediationDelta)}</>
                    }
                  </Typography>
                )}
              </div>
            </InfoCard>
          </div>
          <div className={classes.statItem}>
            <InfoCard>
              <div className={classes.statCard}>
                <Typography className={`${classes.statValue} ${classes.success}`}>{stats.activeProfiles}</Typography>
                <Typography className={classes.statLabel}>Active Profiles</Typography>
              </div>
            </InfoCard>
          </div>
        </div>
      </div>

      {/* Compliance Score Trend */}
      <div className={classes.section}>
        <InfoCard
          title="Compliance Score Trend"
          action={
            <Chip
              icon={<TrendingUpIcon />}
              label="Last 90 days"
              variant="outlined"
              size="small"
            />
          }
        >
          <PostureTrendChart
            initialData={postureHistory}
            stats={stats}
            allProfiles={profiles}
            api={api}
            onPointClick={snap => {
              const navId = snap.workflowJobId ?? snap.scanId;
              if (navId) navigate(`/compliance/results/${navId}`);
            }}
          />
        </InfoCard>
      </div>

      {/* Quick Actions + Recent Activity */}
      <div className={classes.section}>
        <div className={classes.row}>
          <div className={classes.actionsColumn}>
            <InfoCard title="Quick Actions">
              <Card variant="outlined">
                <CardActionArea onClick={() => navigate('scan')}>
                  <div className={classes.quickAction}>
                    <PlayCircleFilledIcon className={classes.actionIcon} />
                    <div>
                      <Typography variant="subtitle1">New Scan</Typography>
                      <Typography variant="body2" color="textSecondary">
                        Scan infrastructure against a compliance profile
                      </Typography>
                    </div>
                  </div>
                </CardActionArea>
              </Card>
              <Box mt={1} />
              <Card variant="outlined">
                <CardActionArea onClick={() => navigate('remediations')}>
                  <div className={classes.quickAction}>
                    <BuildIcon className={classes.actionIcon} />
                    <div>
                      <Typography variant="subtitle1">Remediations</Typography>
                      <Typography variant="body2" color="textSecondary">
                        View saved remediations or launch one
                      </Typography>
                    </div>
                  </div>
                </CardActionArea>
              </Card>
              <Box mt={1} />
              <Card variant="outlined">
                <CardActionArea onClick={() => navigate('profiles/all')}>
                  <div className={classes.quickAction}>
                    <SecurityIcon className={classes.actionIcon} />
                    <div>
                      <Typography variant="subtitle1">Browse Profiles</Typography>
                      <Typography variant="body2" color="textSecondary">
                        View compliance frameworks and benchmarks
                      </Typography>
                    </div>
                  </div>
                </CardActionArea>
              </Card>
            </InfoCard>
          </div>
          <div className={classes.scansColumn}>
            <InfoCard
              title="Recent Activity"
              action={
                <Chip
                  icon={<HistoryIcon />}
                  label="View All"
                  variant="outlined"
                  size="small"
                  clickable
                  onClick={() => navigate('results')}
                />
              }
            >
              {stats.recentScans.map(scan => {
                const isRemediation = scan.scanner === 'remediation';
                const activityLabel = isRemediation
                  ? 'Remediation'
                  : scan.scanType === 'verification'
                    ? 'Verification'
                    : 'Assessment';
                const activityColor = isRemediation
                  ? 'primary'
                  : scan.scanType === 'verification'
                    ? 'secondary'
                    : 'default';

                return (
                  <div
                    key={scan.id}
                    className={classes.scanRow}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const navId = scan.workflowJobId ?? scan.id;
                      navigate(isRemediation ? `remediation-result/${navId}` : `results/${navId}`);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const navId = scan.workflowJobId ?? scan.id;
                        navigate(isRemediation ? `remediation-result/${navId}` : `results/${navId}`);
                      }
                    }}
                  >
                    <div>
                      <Box display="flex" alignItems="center" style={{ gap: 6 }}>
                        <Typography variant="subtitle2">{scan.profileName}</Typography>
                        <Chip
                          icon={isRemediation ? <BuildIcon style={{ fontSize: 12 }} /> : undefined}
                          label={activityLabel}
                          size="small"
                          variant="outlined"
                          color={activityColor as 'primary' | 'secondary' | 'default'}
                          style={isRemediation
                            ? { height: 18, fontSize: '0.65rem', borderColor: STATUS_COLORS.success, color: STATUS_COLORS.success }
                            : { height: 18, fontSize: '0.65rem' }}
                        />
                      </Box>
                      <Box display="flex" alignItems="center" style={{ gap: 6, marginTop: 2 }}>
                        <Chip
                          label={scan.inventoryName}
                          size="small"
                          variant="outlined"
                          style={{ height: 18, fontSize: '0.65rem', fontFamily: 'monospace' }}
                        />
                        <Typography variant="caption" color="textSecondary">
                          {new Date(scan.timestamp).toLocaleString()}
                        </Typography>
                      </Box>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {scan.status === 'failed' ? (
                        <StatusError />
                      ) : isRemediation ? (
                        <StatusOK />
                      ) : scan.passRate >= THRESHOLDS.excellent ? (
                        <StatusOK />
                      ) : scan.passRate >= THRESHOLDS.good ? (
                        <StatusWarning />
                      ) : (
                        <StatusError />
                      )}
                      <Typography variant="subtitle2">
                        {scan.status === 'failed' ? 'Failed' : isRemediation ? scan.status : `${scan.passRate}%`}
                      </Typography>
                    </div>
                  </div>
                );
              })}
            </InfoCard>
          </div>
        </div>
      </div>

      {/* Active Compliance Profiles */}
      <div className={classes.section}>
        <InfoCard title="Active Compliance Profiles">
          <div className={classes.row}>
            {stats.frameworkScores.map(fw => (
              <div className={classes.frameworkItem} key={fw.name}>
                <Card variant="outlined" className={classes.frameworkCard}>
                  <CardContent>
                    <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                      <Typography variant="h6" gutterBottom>{fw.name}</Typography>
                      {(() => {
                        const cart = profiles.find(c => c.id === fw.profileId);
                        if (!cart?.certification) return null;
                        return <CertificationBadge certification={cart.certification} style={{ marginBottom: 8 }} />;
                      })()}
                    </Box>
                    <Typography variant="body2" color="textSecondary">
                      {fw.target} &middot; {fw.rules} rules
                    </Typography>
                    <Box mt={2}>
                      <Box display="flex" justifyContent="space-between" mb={0.5}>
                        <Typography variant="caption">Compliance</Typography>
                        <Typography variant="caption">{fw.rate}%</Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={fw.rate}
                        className={classes.complianceBar}
                        classes={{ barColorPrimary: '' }}
                        style={{ backgroundColor: 'rgba(0,0,0,0.08)' }}
                        ref={(el: HTMLElement | null) => { if (el) { const bar = el.querySelector('.MuiLinearProgress-bar') as HTMLElement; if (bar) bar.style.backgroundColor = scoreColor(fw.rate); } }}
                      />
                    </Box>
                    <Box mt={1.5} display="flex" justifyContent="space-between" alignItems="center">
                      <Typography
                        variant="caption"
                        color="textSecondary"
                      >
                        {fw.lastScan ? `Last scan: ${new Date(fw.lastScan).toLocaleDateString()}` : 'No scans yet'}
                      </Typography>
                      <Chip
                        icon={<AssessmentIcon style={{ fontSize: 14 }} />}
                        label="Scan"
                        size="small"
                        color="primary"
                        variant="outlined"
                        clickable
                        onClick={() => navigate(`scan?profile=${fw.profileId}`)}
                      />
                    </Box>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </InfoCard>
      </div>
    </div>
  );
};
