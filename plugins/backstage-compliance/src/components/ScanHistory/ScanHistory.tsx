import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUrlToggle } from '../../hooks/useUrlToggle';
import {
  InfoCard,
  Progress,
  StatusOK,
  StatusError,
  StatusWarning,
  StatusPending,
  StatusRunning,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import {
  Typography,
  Button,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  makeStyles,
} from '@material-ui/core';
import PlayCircleFilledIcon from '@material-ui/icons/PlayCircleFilled';
import BuildIcon from '@material-ui/icons/Build';
import SearchIcon from '@material-ui/icons/Search';
import AssessmentIcon from '@material-ui/icons/Assessment';
import VerifiedUserIcon from '@material-ui/icons/VerifiedUser';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ListIcon from '@material-ui/icons/List';
import ViewModuleIcon from '@material-ui/icons/ViewModule';
import CompareArrowsIcon from '@material-ui/icons/CompareArrows';
import StarIcon from '@material-ui/icons/Star';
import { complianceApiRef } from '../../api';
import { CertificationBadge } from '../shared/CertificationBadge';
import { STATUS_COLORS, EXECUTION_COLORS, scoreColor } from '../shared/colors';
import type {
  ComplianceScan,
  ScanCertification,
  RemediationExecution,
  ProfileDisplayConfig,
  ScoreFormula,
} from '@ansible/backstage-compliance-common/types';
import { ScanProgress } from '../ScanProgress';

function computeGroupScore(
  pass: number,
  fail: number,
  total: number,
  formula?: ScoreFormula,
  scanMeta?: {
    totalScannedPackages?: number;
    totalVulnerablePackages?: number;
  },
): number {
  if (formula === 'vulnerability_free_rate') {
    const scanned = scanMeta?.totalScannedPackages;
    const vulnerable = scanMeta?.totalVulnerablePackages;
    if (scanned && scanned > 0 && vulnerable !== undefined) {
      return Math.round(((scanned - vulnerable) / scanned) * 1000) / 10;
    }
    return total > 0 ? Math.round(((total - fail) / total) * 1000) / 10 : 0;
  }
  const sum = pass + fail;
  return sum > 0 ? Math.round((pass / sum) * 1000) / 10 : 0;
}

const useStyles = makeStyles(theme => ({
  emptyState: {
    textAlign: 'center',
    padding: theme.spacing(6),
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  clickableRow: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  statusChip: {
    fontWeight: 600,
    minWidth: 90,
  },
  groupAccordion: {
    '&:before': { display: 'none' },
    boxShadow: 'none',
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    gap: theme.spacing(2),
  },
  groupTitle: {
    flex: 1,
  },
  groupStats: {
    display: 'flex',
    gap: theme.spacing(2),
    alignItems: 'center',
  },
  executionRow: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(62, 134, 53, 0.08)'
        : 'rgba(62, 134, 53, 0.04)',
    '&:hover': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(62, 134, 53, 0.15)'
          : 'rgba(62, 134, 53, 0.08)',
    },
  },
  authoritative: {
    fontWeight: 600,
  },
  viewToggle: {
    display: 'flex',
    gap: theme.spacing(0.5),
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  filterSelect: {
    minWidth: 180,
  },
  compareBtn: {
    opacity: 0,
    transition: 'opacity 0.2s',
    '$clickableRow:hover &': {
      opacity: 1,
    },
  },
}));

const statusColor: Record<string, 'primary' | 'secondary' | 'default'> = {
  completed: 'primary',
  failed: 'secondary',
  running: 'default',
  pending: 'default',
  cancelled: 'default',
};

const execStatusColor: Record<string, string> = {
  succeeded: EXECUTION_COLORS.succeeded.bg,
  failed: EXECUTION_COLORS.failed.bg,
  running: EXECUTION_COLORS.running.bg,
  pending: EXECUTION_COLORS.pending.bg,
  cancelled: EXECUTION_COLORS.cancelled.bg,
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
    case 'succeeded':
      return <StatusOK />;
    case 'failed':
      return <StatusError />;
    case 'running':
      return <StatusRunning />;
    case 'pending':
      return <StatusPending />;
    case 'cancelled':
      return <StatusWarning />;
    default:
      return <StatusPending />;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatRelativeDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

interface ScanGroup {
  profileId: string;
  inventoryId: number;
  profileName: string;
  inventoryName: string;
  certification: ScanCertification | null;
  items: Array<
    | {
        type: 'scan';
        scan: ComplianceScan;
        stats?: {
          pass: number;
          fail: number;
          rules: number;
          hosts: number;
          stateNew?: number;
          stateFixed?: number;
          stateResurfaced?: number;
          totalPackages?: number;
          totalVulnerabilities?: number;
          totalScannedPackages?: number;
          totalVulnerablePackages?: number;
        };
      }
    | { type: 'execution'; execution: RemediationExecution }
  >;
}

export const ScanHistory = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useApi(complianceApiRef);
  const [scans, setScans] = useState<ComplianceScan[]>([]);
  const [executions, setExecutions] = useState<RemediationExecution[]>([]);
  const [scanStats, setScanStats] = useState<
    Record<
      string,
      {
        pass: number;
        fail: number;
        rules: number;
        hosts: number;
        stateNew?: number;
        stateFixed?: number;
        stateResurfaced?: number;
        totalPackages?: number;
        totalVulnerabilities?: number;
        totalScannedPackages?: number;
        totalVulnerablePackages?: number;
      }
    >
  >({});
  const [profileMap, setProfileMap] = useState<
    Map<
      string,
      {
        name: string;
        certification: ScanCertification | null;
        displayConfig?: ProfileDisplayConfig;
      }
    >
  >(new Map());
  const [inventoryMap, setInventoryMap] = useState<Map<number, string>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useUrlToggle<'grouped' | 'flat'>(
    'viewMode',
    'grouped',
  );
  const [filterProfile, setFilterProfile] = useUrlToggle<string>(
    'complianceProfileId',
    '',
  );
  const [filterInventory, setFilterInventory] = useUrlToggle<string>(
    'inventoryFilter',
    '',
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [compareSelection, setCompareSelection] = useState<{
    groupKey: string;
    scanId: string;
  } | null>(null);
  const [filterType, setFilterType] = useUrlToggle<string>('typeFilter', '');

  const refreshScans = useCallback(
    () =>
      api
        .getScans()
        .then(data => setScans(data))
        .catch(err => {
          // eslint-disable-next-line no-console
          console.error('Failed to refresh scans:', err);
        }),
    [api],
  );

  useEffect(() => {
    Promise.all([
      refreshScans(),
      api
        .getRegisteredProfiles()
        .then(cs => {
          setProfileMap(
            new Map(
              cs.map(c => [
                c.id,
                {
                  name: c.displayName,
                  certification: c.certification,
                  displayConfig: c.displayConfig,
                },
              ]),
            ),
          );
        })
        .catch(e => {
          // eslint-disable-next-line no-console
          console.warn('ScanHistory data load:', e);
        }),
      api
        .getInventories()
        .then(invs => {
          setInventoryMap(new Map(invs.map(inv => [inv.id, inv.name])));
        })
        .catch(e => {
          // eslint-disable-next-line no-console
          console.warn('ScanHistory data load:', e);
        }),
      api
        .getAllRecentExecutions(50)
        .then(execs => setExecutions(execs))
        .catch(e => {
          // eslint-disable-next-line no-console
          console.warn('ScanHistory data load:', e);
        }),
    ]).finally(() => setLoading(false));
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch stats for completed scans (only when new scan IDs appear)
  const prevStatsKeyRef = useRef('');
  useEffect(() => {
    const completedIds = scans
      .filter(s => s.status === 'completed')
      .map(s => s.id)
      .sort();
    const key = completedIds.join(',');
    if (completedIds.length === 0 || key === prevStatsKeyRef.current) return;
    prevStatsKeyRef.current = key;
    api
      .getBatchScanStats(completedIds)
      .then(stats => setScanStats(stats))
      .catch(e => {
        // eslint-disable-next-line no-console
        console.warn('ScanHistory data load:', e);
      });
  }, [api, scans]);

  // All groups start collapsed — user clicks to expand

  // Compute authoritative scan IDs (latest completed assessment per profile×inventory)
  const authoritativeScanIds = useMemo(() => {
    const ids = new Set<string>();
    const seen = new Set<string>();
    const sorted = [...scans]
      .filter(s => s.status === 'completed' && s.scanner === 'oscap')
      .sort(
        (a, b) =>
          new Date(b.completedAt || b.startedAt).getTime() -
          new Date(a.completedAt || a.startedAt).getTime(),
      );
    for (const s of sorted) {
      const key = `${s.profileId}::${s.inventoryId}`;
      if (!seen.has(key)) {
        seen.add(key);
        ids.add(s.id);
      }
    }
    return ids;
  }, [scans]);

  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const activeScans = scans.filter(
    s =>
      (s.status === 'pending' || s.status === 'running') &&
      s.startedAt > oneHourAgo,
  );

  useEffect(() => {
    if (activeScans.length === 0) return undefined;
    const interval = setInterval(refreshScans, 10_000);
    return () => clearInterval(interval);
  }, [activeScans.length, refreshScans]);

  // Build grouped view
  const groups = useMemo<ScanGroup[]>(() => {
    const groupMap = new Map<string, ScanGroup>();

    // Add scans to groups
    for (const scan of scans) {
      if (scan.scanner === 'remediation') continue;
      const key = `${scan.profileId}::${scan.inventoryId}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          profileId: scan.profileId,
          inventoryId: scan.inventoryId,
          profileName: profileMap.get(scan.profileId)?.name || scan.profileId,
          inventoryName:
            inventoryMap.get(scan.inventoryId) ||
            `Inventory #${scan.inventoryId}`,
          certification: profileMap.get(scan.profileId)?.certification || null,
          items: [],
        });
      }
      groupMap.get(key)!.items.push({
        type: 'scan',
        scan,
        stats: scanStats[scan.id],
      });
    }

    // Add executions to groups — match by inventoryId + informingScanId
    // If the execution's informing scan belongs to a group, the execution belongs there too
    const scanToGroup = new Map<string, string>();
    for (const scan of scans) {
      scanToGroup.set(scan.id, `${scan.profileId}::${scan.inventoryId}`);
    }
    for (const exec of executions) {
      let groupKey: string | undefined;
      if (exec.informingScanId) {
        groupKey = scanToGroup.get(exec.informingScanId);
      }
      if (!groupKey) {
        // Fallback: match by profileId + inventoryId (not inventoryId alone,
        // which would assign all executions to whichever group is iterated first)
        for (const [key, group] of groupMap) {
          if (
            group.profileId === exec.remediationProfileId &&
            group.inventoryId === exec.inventoryId
          ) {
            groupKey = key;
            break;
          }
        }
      }
      if (groupKey && groupMap.has(groupKey)) {
        groupMap
          .get(groupKey)!
          .items.push({ type: 'execution', execution: exec });
      }
    }

    // Sort items within each group by date descending
    for (const group of groupMap.values()) {
      group.items.sort((a, b) => {
        const dateA =
          a.type === 'scan' ? a.scan.startedAt : a.execution.startedAt;
        const dateB =
          b.type === 'scan' ? b.scan.startedAt : b.execution.startedAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
    }

    // Sort groups: most recently active first
    let sorted = Array.from(groupMap.values()).sort((a, b) => {
      const latestA = a.items[0];
      const latestB = b.items[0];
      const dateA =
        latestA?.type === 'scan'
          ? latestA.scan.startedAt
          : latestA?.execution.startedAt || '';
      const dateB =
        latestB?.type === 'scan'
          ? latestB.scan.startedAt
          : latestB?.execution.startedAt || '';
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    if (filterProfile) {
      sorted = sorted.filter(g => g.profileId === filterProfile);
    }
    if (filterInventory) {
      sorted = sorted.filter(g => g.inventoryId === Number(filterInventory));
    }
    if (filterType) {
      sorted = sorted
        .map(g => ({
          ...g,
          items: g.items.filter(item => {
            if (item.type === 'execution') return filterType === 'remediation';
            if (filterType === 'remediation')
              return item.scan.scanner === 'remediation';
            return item.scan.scanType === filterType;
          }),
        }))
        .filter(g => g.items.length > 0);
    }

    return sorted;
  }, [
    scans,
    executions,
    scanStats,
    profileMap,
    inventoryMap,
    filterProfile,
    filterInventory,
    filterType,
  ]);

  // Profiles and inventories that appear in scan data (for filter dropdowns)
  const scannedProfiles = useMemo(() => {
    const ids = new Set(
      scans.filter(s => s.scanner !== 'remediation').map(s => s.profileId),
    );
    return Array.from(ids)
      .map(id => ({
        id,
        name: profileMap.get(id)?.name || id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scans, profileMap]);

  const scannedInventories = useMemo(() => {
    const ids = new Set(
      scans.filter(s => s.scanner !== 'remediation').map(s => s.inventoryId),
    );
    return Array.from(ids)
      .map(id => ({
        id,
        name: inventoryMap.get(id) || `Inventory #${id}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scans, inventoryMap]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleScanClick = (scan: ComplianceScan) => {
    const jobId = scan.workflowJobId ?? scan.id;
    navigate(`/compliance/results/${jobId}`);
  };

  const handleCompareClick = (
    groupKey: string,
    scanId: string,
    e: MouseEvent,
  ) => {
    e.stopPropagation();
    if (
      compareSelection?.groupKey === groupKey &&
      compareSelection.scanId !== scanId
    ) {
      // Second scan selected — navigate to diff view
      navigate(
        `/compliance/results/${compareSelection.scanId}?compareTo=${scanId}`,
      );
      setCompareSelection(null);
    } else {
      setCompareSelection({ groupKey, scanId });
    }
  };

  if (loading) return <Progress />;

  return (
    <InfoCard title="Scan History">
      <div className={classes.headerRow}>
        <Typography variant="body2" color="textSecondary">
          {viewMode === 'grouped'
            ? 'Scans grouped by compliance profile and inventory. Click to view findings.'
            : 'All scans and remediations in chronological order. Click to view details.'}
        </Typography>
        <Box display="flex" style={{ gap: 8 }}>
          <div className={classes.viewToggle}>
            <Tooltip title="Grouped view">
              <IconButton
                size="small"
                color={viewMode === 'grouped' ? 'primary' : 'default'}
                onClick={() => setViewMode('grouped')}
              >
                <ViewModuleIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Timeline">
              <IconButton
                size="small"
                color={viewMode === 'flat' ? 'primary' : 'default'}
                onClick={() => setViewMode('flat')}
              >
                <ListIcon />
              </IconButton>
            </Tooltip>
          </div>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PlayCircleFilledIcon />}
            onClick={() => navigate('/compliance/scan')}
          >
            New Scan
          </Button>
        </Box>
      </div>

      <div className={classes.filterRow}>
        <FormControl
          variant="outlined"
          size="small"
          className={classes.filterSelect}
        >
          <InputLabel id="filter-profile-label">Compliance Profile</InputLabel>
          <Select
            labelId="filter-profile-label"
            value={filterProfile}
            onChange={e => setFilterProfile(e.target.value as string)}
            label="Compliance Profile"
          >
            <MenuItem value="">All Profiles</MenuItem>
            {scannedProfiles.map(p => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl
          variant="outlined"
          size="small"
          className={classes.filterSelect}
        >
          <InputLabel id="filter-inventory-label">Inventory</InputLabel>
          <Select
            labelId="filter-inventory-label"
            value={filterInventory}
            onChange={e => setFilterInventory(e.target.value as string)}
            label="Inventory"
          >
            <MenuItem value="">All Inventories</MenuItem>
            {scannedInventories.map(inv => (
              <MenuItem key={inv.id} value={inv.id.toString()}>
                {inv.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl
          variant="outlined"
          size="small"
          className={classes.filterSelect}
        >
          <InputLabel id="filter-type-label">Type</InputLabel>
          <Select
            labelId="filter-type-label"
            value={filterType}
            onChange={e => setFilterType(e.target.value as string)}
            label="Type"
          >
            <MenuItem value="">All Types</MenuItem>
            <MenuItem value="assessment">Assessment</MenuItem>
            <MenuItem value="verification">Verification</MenuItem>
            <MenuItem value="remediation">Remediation</MenuItem>
          </Select>
        </FormControl>
        {(filterProfile || filterInventory || filterType) && (
          <Chip
            label="Clear filters"
            size="small"
            onDelete={() => {
              setFilterProfile('');
              setFilterInventory('');
              setFilterType('');
            }}
            variant="outlined"
          />
        )}
        {viewMode === 'grouped' && (
          <Typography
            variant="caption"
            color="textSecondary"
            style={{ marginLeft: 'auto' }}
          >
            {groups.length} group{groups.length !== 1 ? 's' : ''}
          </Typography>
        )}
      </div>

      {activeScans.map(
        scan =>
          scan.workflowJobId && (
            <ScanProgress
              key={scan.id}
              workflowJobId={scan.workflowJobId}
              profileName={
                profileMap.get(scan.profileId)?.name || scan.profileId
              }
              onComplete={() => {
                setTimeout(refreshScans, 2000);
              }}
            />
          ),
      )}

      {compareSelection && (
        <Box mb={1}>
          <Chip
            label="Select another scan to compare"
            onDelete={() => setCompareSelection(null)}
            color="primary"
            variant="outlined"
            size="small"
            icon={<CompareArrowsIcon />}
          />
        </Box>
      )}

      {(() => {
        if (scans.length === 0) {
          return (
            <div className={classes.emptyState}>
              <SearchIcon
                style={{
                  fontSize: 64,
                  color: STATUS_COLORS.neutral,
                  marginBottom: 16,
                }}
              />
              <Typography variant="h6" color="textSecondary" gutterBottom>
                No scans yet
              </Typography>
              <Typography variant="body2" color="textSecondary" paragraph>
                Launch a compliance scan to see results here. Each scan
                evaluates your infrastructure against a compliance profile and
                produces per-host findings.
              </Typography>
              <Button
                variant="contained"
                color="primary"
                onClick={() => navigate('/compliance/scan')}
              >
                Launch a Scan
              </Button>
            </div>
          );
        }
        if (viewMode === 'grouped') {
          return groups.length === 0 ? (
            <Typography
              variant="body2"
              color="textSecondary"
              style={{ padding: 24, textAlign: 'center' }}
            >
              No scans match the current filter.
            </Typography>
          ) : (
            groups.map(group => {
              const key = `${group.profileId}::${group.inventoryId}`;
              const isExpanded = expandedGroups.has(key);
              const latestScan = group.items.find(
                i => i.type === 'scan' && authoritativeScanIds.has(i.scan.id),
              ) as
                | {
                    type: 'scan';
                    scan: ComplianceScan;
                    stats?: {
                      pass: number;
                      fail: number;
                      rules: number;
                      hosts: number;
                      stateNew?: number;
                      stateFixed?: number;
                      stateResurfaced?: number;
                      totalPackages?: number;
                      totalVulnerabilities?: number;
                      totalScannedPackages?: number;
                      totalVulnerablePackages?: number;
                    };
                  }
                | undefined;
              const scanCount = group.items.filter(
                i => i.type === 'scan',
              ).length;
              const execCount = group.items.filter(
                i => i.type === 'execution',
              ).length;

              return (
                <Accordion
                  key={key}
                  className={classes.groupAccordion}
                  expanded={isExpanded}
                  onChange={() => toggleGroup(key)}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <div className={classes.groupHeader}>
                      <div className={classes.groupTitle}>
                        <Typography variant="body1" style={{ fontWeight: 600 }}>
                          {group.profileName}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {group.inventoryName}
                          {group.certification && (
                            <CertificationBadge
                              certification={group.certification}
                              style={{ marginLeft: 8 }}
                            />
                          )}
                        </Typography>
                      </div>
                      <div className={classes.groupStats}>
                        {latestScan?.stats &&
                          (() => {
                            const formula = profileMap.get(group.profileId)
                              ?.displayConfig?.score_formula;
                            const total =
                              formula === 'vulnerability_free_rate' &&
                              latestScan.stats.totalPackages
                                ? latestScan.stats.totalPackages
                                : latestScan.stats.pass + latestScan.stats.fail;
                            const pct = computeGroupScore(
                              latestScan.stats.pass,
                              latestScan.stats.fail,
                              total,
                              formula,
                              {
                                totalScannedPackages:
                                  latestScan.stats.totalScannedPackages,
                                totalVulnerablePackages:
                                  latestScan.stats.totalVulnerablePackages,
                              },
                            );
                            return (
                              <Chip
                                label={`${pct}% pass`}
                                size="small"
                                variant="outlined"
                                style={{
                                  borderColor: scoreColor(pct),
                                  color: scoreColor(pct),
                                }}
                              />
                            );
                          })()}
                        <Typography variant="caption" color="textSecondary">
                          {scanCount} scan{scanCount !== 1 ? 's' : ''}
                          {execCount > 0 &&
                            `, ${execCount} remediation${
                              execCount !== 1 ? 's' : ''
                            }`}
                        </Typography>
                      </div>
                    </div>
                  </AccordionSummary>
                  <AccordionDetails style={{ padding: 0 }}>
                    <TableContainer>
                      <Table size="small">
                        <TableBody>
                          {group.items.map((item, _idx) => {
                            if (item.type === 'scan') {
                              const { scan, stats } = item;
                              const isAuthoritative = authoritativeScanIds.has(
                                scan.id,
                              );
                              const isCompareSelected =
                                compareSelection?.groupKey === key &&
                                compareSelection.scanId === scan.id;

                              return (
                                <TableRow
                                  key={scan.id}
                                  className={classes.clickableRow}
                                  onClick={() => handleScanClick(scan)}
                                  selected={isCompareSelected}
                                >
                                  <TableCell
                                    width={40}
                                    style={{ paddingLeft: 24 }}
                                  >
                                    <StatusIcon status={scan.status} />
                                  </TableCell>
                                  <TableCell width={120}>
                                    <Chip
                                      icon={
                                        scan.scanType === 'verification' ? (
                                          <VerifiedUserIcon />
                                        ) : (
                                          <AssessmentIcon />
                                        )
                                      }
                                      label={
                                        scan.scanType === 'verification'
                                          ? 'Verification'
                                          : 'Assessment'
                                      }
                                      size="small"
                                      variant="outlined"
                                      style={
                                        scan.scanType === 'verification'
                                          ? {
                                              borderColor: STATUS_COLORS.info,
                                              color: STATUS_COLORS.info,
                                            }
                                          : undefined
                                      }
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Box
                                      display="flex"
                                      alignItems="center"
                                      style={{ gap: 4 }}
                                    >
                                      {isAuthoritative && (
                                        <Tooltip title="Authoritative scan (latest completed)">
                                          <StarIcon
                                            style={{
                                              fontSize: 16,
                                              color: STATUS_COLORS.warning,
                                            }}
                                          />
                                        </Tooltip>
                                      )}
                                      <Typography
                                        variant="body2"
                                        className={
                                          isAuthoritative
                                            ? classes.authoritative
                                            : undefined
                                        }
                                      >
                                        #
                                        {scan.workflowJobId ||
                                          scan.id.slice(0, 8)}
                                      </Typography>
                                    </Box>
                                  </TableCell>
                                  <TableCell>
                                    {(() => {
                                      if (stats)
                                        return (
                                          <Box>
                                            <Typography variant="body2">
                                              {stats.rules} rules · {stats.pass}{' '}
                                              pass · {stats.fail} fail ·{' '}
                                              {stats.hosts} hosts
                                            </Typography>
                                            {stats.stateNew ||
                                            stats.stateFixed ||
                                            stats.stateResurfaced ? (
                                              <Box
                                                display="flex"
                                                style={{ gap: 4, marginTop: 2 }}
                                              >
                                                {!!stats.stateNew && (
                                                  <Tooltip
                                                    title={`${stats.stateNew} host-level findings failing for the first time`}
                                                    arrow
                                                  >
                                                    <Chip
                                                      label={`${stats.stateNew} new`}
                                                      size="small"
                                                      variant="outlined"
                                                      style={{
                                                        fontSize: '0.65rem',
                                                        height: 18,
                                                        color:
                                                          STATUS_COLORS.info,
                                                        borderColor:
                                                          STATUS_COLORS.info,
                                                      }}
                                                    />
                                                  </Tooltip>
                                                )}
                                                {!!stats.stateFixed && (
                                                  <Tooltip
                                                    title={`${stats.stateFixed} host-level findings changed from failing to passing`}
                                                    arrow
                                                  >
                                                    <Chip
                                                      label={`${stats.stateFixed} fixed`}
                                                      size="small"
                                                      style={{
                                                        fontSize: '0.65rem',
                                                        height: 18,
                                                        color: '#fff',
                                                        backgroundColor:
                                                          STATUS_COLORS.success,
                                                      }}
                                                    />
                                                  </Tooltip>
                                                )}
                                                {!!stats.stateResurfaced && (
                                                  <Tooltip
                                                    title={`${stats.stateResurfaced} host-level findings that were fixed but are now failing again`}
                                                    arrow
                                                  >
                                                    <Chip
                                                      label={`${stats.stateResurfaced} resurfaced`}
                                                      size="small"
                                                      variant="outlined"
                                                      style={{
                                                        fontSize: '0.65rem',
                                                        height: 18,
                                                        color:
                                                          STATUS_COLORS.error,
                                                        borderColor:
                                                          STATUS_COLORS.error,
                                                      }}
                                                    />
                                                  </Tooltip>
                                                )}
                                              </Box>
                                            ) : null}
                                          </Box>
                                        );
                                      if (scan.status === 'completed')
                                        return (
                                          <Typography
                                            variant="caption"
                                            color="textSecondary"
                                          >
                                            Loading stats...
                                          </Typography>
                                        );
                                      return null;
                                    })()}
                                  </TableCell>
                                  <TableCell>
                                    <Typography
                                      variant="caption"
                                      color="textSecondary"
                                    >
                                      {formatRelativeDate(scan.startedAt)}
                                    </Typography>
                                  </TableCell>
                                  <TableCell width={40}>
                                    {scan.status === 'completed' && (
                                      <Tooltip
                                        title={
                                          compareSelection?.groupKey === key
                                            ? 'Compare with selected scan'
                                            : 'Compare scans'
                                        }
                                      >
                                        <IconButton
                                          size="small"
                                          className={
                                            compareSelection?.groupKey === key
                                              ? undefined
                                              : classes.compareBtn
                                          }
                                          color={
                                            isCompareSelected
                                              ? 'primary'
                                              : 'default'
                                          }
                                          onClick={e =>
                                            handleCompareClick(key, scan.id, e)
                                          }
                                        >
                                          <CompareArrowsIcon fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            }

                            // Execution row
                            const { execution } = item;
                            return (
                              <TableRow
                                key={execution.id}
                                className={`${classes.clickableRow} ${classes.executionRow}`}
                                onClick={() => {
                                  if (execution.primaryJobId) {
                                    navigate(
                                      `/compliance/remediation-result/${execution.primaryJobId}`,
                                    );
                                  }
                                }}
                              >
                                <TableCell
                                  width={40}
                                  style={{ paddingLeft: 24 }}
                                >
                                  <StatusIcon status={execution.status} />
                                </TableCell>
                                <TableCell width={120}>
                                  <Chip
                                    icon={<BuildIcon />}
                                    label="Remediation"
                                    size="small"
                                    variant="outlined"
                                    style={{
                                      borderColor:
                                        execStatusColor[execution.status] ||
                                        STATUS_COLORS.neutral,
                                      color:
                                        execStatusColor[execution.status] ||
                                        STATUS_COLORS.neutral,
                                    }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Typography variant="body2">
                                    #
                                    {execution.primaryJobId ||
                                      execution.id.slice(0, 8)}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Typography variant="body2">
                                    {execution.rulesApplied !== null
                                      ? `${execution.rulesApplied} rules · ${
                                          execution.hostsTargeted ?? 0
                                        } hosts`
                                      : 'Details unavailable'}
                                    {execution.elapsedSeconds
                                      ? ` · ${Math.round(
                                          execution.elapsedSeconds,
                                        )}s`
                                      : ''}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Typography
                                    variant="caption"
                                    color="textSecondary"
                                  >
                                    {formatRelativeDate(execution.startedAt)}
                                  </Typography>
                                </TableCell>
                                <TableCell width={40}>
                                  {execution.informingScanId && (
                                    <Tooltip
                                      title="View assessment chain"
                                      arrow
                                    >
                                      <IconButton
                                        size="small"
                                        onClick={e => {
                                          e.stopPropagation();
                                          navigate(
                                            `/compliance/chain/${execution.id}`,
                                          );
                                        }}
                                      >
                                        <CompareArrowsIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </AccordionDetails>
                </Accordion>
              );
            })
          );
        }
        return (
          /* ─── Flat View (original) ──────────────────────────────────── */
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Status</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Profile</TableCell>
                  <TableCell>Inventory</TableCell>
                  <TableCell>Pass Rate</TableCell>
                  <TableCell>Workflow Job</TableCell>
                  <TableCell>Started</TableCell>
                  <TableCell>Completed</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {scans
                  .filter(scan => {
                    if (filterProfile && scan.profileId !== filterProfile)
                      return false;
                    if (
                      filterInventory &&
                      scan.inventoryId !== Number(filterInventory)
                    )
                      return false;
                    if (filterType) {
                      if (filterType === 'remediation')
                        return scan.scanner === 'remediation';
                      return scan.scanType === filterType;
                    }
                    return true;
                  })
                  .map(scan => (
                    <TableRow
                      key={scan.id}
                      className={classes.clickableRow}
                      onClick={() => {
                        const jobId = scan.workflowJobId ?? scan.id;
                        if (scan.scanner === 'remediation') {
                          navigate(
                            `/compliance/remediation-result/${
                              scan.workflowJobId ?? scan.id
                            }`,
                          );
                        } else {
                          navigate(`/compliance/results/${jobId}`);
                        }
                      }}
                    >
                      <TableCell>
                        <Box
                          display="flex"
                          alignItems="center"
                          style={{ gap: 8 }}
                        >
                          <StatusIcon status={scan.status} />
                          <Chip
                            label={
                              scan.status.charAt(0).toUpperCase() +
                              scan.status.slice(1)
                            }
                            size="small"
                            color={statusColor[scan.status] ?? 'default'}
                            variant="outlined"
                            className={classes.statusChip}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={(() => {
                            if (scan.scanner === 'remediation')
                              return <BuildIcon />;
                            if (scan.scanType === 'verification')
                              return <VerifiedUserIcon />;
                            return <AssessmentIcon />;
                          })()}
                          label={(() => {
                            if (scan.scanner === 'remediation')
                              return 'Remediation';
                            if (scan.scanType === 'verification')
                              return 'Verification';
                            return 'Assessment';
                          })()}
                          size="small"
                          variant="outlined"
                          style={{
                            borderColor: (() => {
                              if (scan.scanner === 'remediation')
                                return STATUS_COLORS.success;
                              if (scan.scanType === 'verification')
                                return STATUS_COLORS.info;
                              return undefined;
                            })(),
                            color: (() => {
                              if (scan.scanner === 'remediation')
                                return STATUS_COLORS.success;
                              if (scan.scanType === 'verification')
                                return STATUS_COLORS.info;
                              return undefined;
                            })(),
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" style={{ fontWeight: 500 }}>
                          {profileMap.get(scan.profileId)?.name ||
                            scan.profileId}
                        </Typography>
                        {profileMap.get(scan.profileId)?.certification && (
                          <CertificationBadge
                            certification={
                              profileMap.get(scan.profileId)!.certification
                            }
                            style={{ marginTop: 4 }}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={
                            inventoryMap.get(scan.inventoryId) ||
                            `#${scan.inventoryId}`
                          }
                          size="small"
                          variant="outlined"
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const stats = scanStats[scan.id];
                          if (!stats || scan.status !== 'completed')
                            return '--';
                          const formula = profileMap.get(scan.profileId)
                            ?.displayConfig?.score_formula;
                          const total =
                            formula === 'vulnerability_free_rate' &&
                            stats.totalPackages
                              ? stats.totalPackages
                              : stats.pass + stats.fail;
                          if (total === 0) return '--';
                          const pct = computeGroupScore(
                            stats.pass,
                            stats.fail,
                            total,
                            formula,
                            {
                              totalScannedPackages: stats.totalScannedPackages,
                              totalVulnerablePackages:
                                stats.totalVulnerablePackages,
                            },
                          );
                          return (
                            <Chip
                              label={`${pct}%`}
                              size="small"
                              style={{
                                backgroundColor: scoreColor(pct),
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                              }}
                            />
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Box
                          display="flex"
                          alignItems="center"
                          style={{ gap: 4 }}
                        >
                          {authoritativeScanIds.has(scan.id) && (
                            <Tooltip title="Authoritative scan (latest completed assessment)">
                              <StarIcon
                                style={{
                                  fontSize: 16,
                                  color: STATUS_COLORS.warning,
                                }}
                              />
                            </Tooltip>
                          )}
                          {scan.workflowJobId ? `#${scan.workflowJobId}` : '--'}
                        </Box>
                      </TableCell>
                      <TableCell>{formatDate(scan.startedAt)}</TableCell>
                      <TableCell>
                        {scan.completedAt ? formatDate(scan.completedAt) : '--'}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        );
      })()}
    </InfoCard>
  );
};
