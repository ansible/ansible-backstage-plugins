import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { InfoCard, Breadcrumbs, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { ScanProgress } from '../ScanProgress';
import {
  Typography,
  Button,
  Chip,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  MenuItem,
  Menu,
  TextField,
  InputAdornment,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  IconButton,
  Paper,
  TablePagination,
  makeStyles,
} from '@material-ui/core';
import SearchIcon from '@material-ui/icons/Search';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import BuildIcon from '@material-ui/icons/Build';
import AssessmentIcon from '@material-ui/icons/Assessment';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import WarningIcon from '@material-ui/icons/Warning';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import ListIcon from '@material-ui/icons/List';
import type { MultiHostFinding } from '@ansible/backstage-compliance-common/types';
import { complianceApiRef } from '../../api';
import { CertificationBadge } from '../shared/CertificationBadge';
import { SEVERITY_COLORS, STATUS_COLORS } from '../shared/colors';
import { TABLE_STYLES } from '../shared/chipStyles';
import { ExportButton } from './ExportButton';
import { ScanFailedView } from './ScanFailedView';
import { SummaryCards } from './SummaryCards';
import { VerificationComparison } from './VerificationComparison';
import { FindingRow } from './FindingRow';
import { FilterGroup } from './FilterGroup';
import type { FilterOption } from './FilterGroup';
import {
  useScanMetadata,
  useBaselineState,
  useFindingsFilter,
  useDisplayConfig,
} from './hooks';

// ─── Filter definitions ──────────────────────────────────────────────

// Severity options are now derived from displayConfig in the component body.

const STATUS_OPTIONS: FilterOption[] = [
  { key: 'fail', label: 'Failing', color: STATUS_COLORS.error },
  { key: 'pass', label: 'Passing', color: STATUS_COLORS.success },
];

const STATE_OPTIONS: FilterOption[] = [
  { key: 'new', label: 'New', color: STATUS_COLORS.info },
  { key: 'fixed', label: 'Fixed', color: STATUS_COLORS.success },
  { key: 'resurfaced', label: 'Resurfaced', color: STATUS_COLORS.error },
  { key: 'active', label: 'Active', color: STATUS_COLORS.neutral },
];

const RISK_OPTIONS: FilterOption[] = [
  {
    key: 'disruption:high',
    label: 'High Disruption',
    color: STATUS_COLORS.error,
  },
  { key: 'aap:caution', label: 'AAP Caution', color: STATUS_COLORS.warning },
  {
    key: 'aap:breaks-connectivity',
    label: 'Breaks AAP',
    color: STATUS_COLORS.error,
  },
];

// ─── Styles ──────────────────────────────────────────────────────────

const useStyles = makeStyles(theme => ({
  filterBar: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: theme.spacing(1),
    [theme.breakpoints.down('md')]: {
      '& > :first-child': {
        flex: '1 1 100%',
      },
    },
  },
  activeFiltersRow: {
    display: 'flex',
    gap: theme.spacing(0.5),
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: theme.spacing(2),
    paddingTop: theme.spacing(0.5),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  emptyState: {
    textAlign: 'center',
    padding: theme.spacing(8, 4),
  },
  findingsCollapseTrigger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: theme.spacing(1.5),
    '&:hover': { backgroundColor: theme.palette.action.hover },
    borderRadius: theme.shape.borderRadius,
  },
}));

// ─── Component ───────────────────────────────────────────────────────

export const ResultsViewer = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useApi(complianceApiRef);
  const { jobId } = useParams<{ jobId: string }>();
  const [searchParams] = useSearchParams();

  // ─── Extracted hooks ─────────────────────────────────────────────
  const meta = useScanMetadata(api, jobId);
  const displayConfig = useDisplayConfig(meta.profileDisplayConfig);
  const baseline = useBaselineState(
    api,
    meta.scanComplianceProfileId,
    meta.scanInventoryId,
  );
  const fetchArtifactsCb = useCallback(
    (scanId: string) => api.getArtifacts(scanId),
    [api],
  );
  const downloadArtifactCb = useCallback(
    (scanId: string, key: string, filename: string) =>
      api.downloadArtifact(scanId, key, filename),
    [api],
  );
  const [findings, setFindings] = useState<MultiHostFinding[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [totalFindings, setTotalFindings] = useState(0);
  const [totalFailingRules, setTotalFailingRules] = useState(0);
  const usePagination = totalFindings > 500;

  const severityOptions: FilterOption[] = useMemo(
    () => [
      {
        key: 'CAT_I',
        label: displayConfig.severityMap.CAT_I,
        color: SEVERITY_COLORS.CAT_I,
      },
      {
        key: 'CAT_II',
        label: displayConfig.severityMap.CAT_II,
        color: SEVERITY_COLORS.CAT_II,
      },
      {
        key: 'CAT_III',
        label: displayConfig.severityMap.CAT_III,
        color: SEVERITY_COLORS.CAT_III,
      },
    ],
    [displayConfig.severityMap],
  );
  const [previousFindings, setPreviousFindings] = useState<MultiHostFinding[]>(
    [],
  );

  const comparisonMap = useMemo(() => {
    if (previousFindings.length === 0) return undefined;
    const prevMap = new Map<string, MultiHostFinding>();
    for (const f of previousFindings) prevMap.set(f.ruleId, f);
    const map = new Map<string, 'improved' | 'regressed' | 'unchanged'>();
    for (const current of findings) {
      const prev = prevMap.get(current.ruleId);
      if (!prev) {
        map.set(current.ruleId, 'unchanged');
        continue;
      }
      const prevFailing = prev.failCount > 0;
      const currentFailing = current.failCount > 0;
      if (prevFailing && !currentFailing) map.set(current.ruleId, 'improved');
      else if (!prevFailing && currentFailing)
        map.set(current.ruleId, 'regressed');
      else map.set(current.ruleId, 'unchanged');
    }
    return map;
  }, [findings, previousFindings]);

  const [baselineFilterActive, setBaselineFilterActive] = useState(false);

  useEffect(() => {
    if (
      searchParams.get('baselineView') === 'true' &&
      baseline.baselineRuleIds.size > 0
    ) {
      setBaselineFilterActive(true);
    }
  }, [searchParams, baseline.baselineRuleIds.size]);

  const displayFindings = useMemo(() => {
    if (!baselineFilterActive || baseline.baselineRuleIds.size === 0)
      return findings;
    return findings.filter(f => baseline.baselineRuleIds.has(f.ruleId));
  }, [findings, baselineFilterActive, baseline.baselineRuleIds]);

  const { filtered, filters, updateFilter, activeFilterCount, clearAll } =
    useFindingsFilter(displayFindings, comparisonMap);

  // ─── Local state ─────────────────────────────────────────────────
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [findingsExpanded, setFindingsExpanded] = useState(true);
  const [compareProfileMismatch, setCompareProfileMismatch] = useState(false);
  const [compareSwapped, setCompareSwapped] = useState(false);
  const [compareWorkflowJobId, setCompareWorkflowJobId] = useState<
    number | null
  >(null);
  const [overflowAnchor, setOverflowAnchor] = useState<null | HTMLElement>(
    null,
  );
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const compareToScanId = searchParams.get('compareTo');

  useEffect(() => {
    setFindingsExpanded(true);
    setFindings([]);
    setPreviousFindings([]);
    setLoading(true);
    setError(null);
  }, [jobId]);

  // ─── Scan-level stats (for accurate summary when paginated) ──────
  const [scanStats, setScanStats] = useState<{
    pass: number;
    fail: number;
    rules: number;
    hosts: number;
    totalPackages?: number;
    totalScannedPackages?: number;
    totalVulnerablePackages?: number;
  } | null>(null);

  // ─── N/A rules state (lazy-loaded on chip click) ─────────────────
  const [naCount, setNaCount] = useState<number | null>(null);
  const [naRules, setNaRules] = useState<Array<{
    ruleId: string;
    ruleTitle: string;
    severity: string;
  }> | null>(null);
  const [naExpanded, setNaExpanded] = useState(false);
  const [naLoading, setNaLoading] = useState(false);

  // ─── Risk filter: merges disruption + aap into a single group ──
  const riskActiveValue = useMemo(() => {
    if (filters.disruption !== 'all') return `disruption:${filters.disruption}`;
    if (filters.aap !== 'all') return `aap:${filters.aap}`;
    return 'all';
  }, [filters.disruption, filters.aap]);

  const handleRiskSelect = useCallback(
    (key: string) => {
      if (key === 'all') {
        updateFilter('disruption', 'all');
        updateFilter('aap', 'all');
        return;
      }
      const [kind, value] = key.split(':');
      if (kind === 'disruption') {
        updateFilter('aap', 'all');
        updateFilter('disruption', value);
      } else {
        updateFilter('disruption', 'all');
        updateFilter('aap', value);
      }
    },
    [updateFilter],
  );

  // ─── Active filter pills for the summary row ────────────────────
  const activeFilterPills = useMemo(() => {
    const pills: Array<{
      label: string;
      key: string;
      clearKey: string;
      color: string;
    }> = [];
    if (filters.severity !== 'all') {
      const opt = severityOptions.find(o => o.key === filters.severity);
      if (opt)
        pills.push({
          label: opt.label,
          key: 'severity',
          clearKey: 'severity',
          color: opt.color,
        });
    }
    if (filters.status !== 'all') {
      const opt = STATUS_OPTIONS.find(o => o.key === filters.status);
      if (opt)
        pills.push({
          label: opt.label,
          key: 'status',
          clearKey: 'status',
          color: opt.color,
        });
    }
    if (filters.state !== 'all') {
      const opt = STATE_OPTIONS.find(o => o.key === filters.state);
      if (opt)
        pills.push({
          label: opt.label,
          key: 'state',
          clearKey: 'state',
          color: opt.color,
        });
    }
    if (filters.disruption !== 'all') {
      const rKey = `disruption:${filters.disruption}`;
      const opt = RISK_OPTIONS.find(o => o.key === rKey);
      if (opt)
        pills.push({
          label: opt.label,
          key: 'disruption',
          clearKey: 'disruption',
          color: opt.color,
        });
    }
    if (filters.aap !== 'all') {
      const rKey = `aap:${filters.aap}`;
      const opt = RISK_OPTIONS.find(o => o.key === rKey);
      if (opt)
        pills.push({
          label: opt.label,
          key: 'aap',
          clearKey: 'aap',
          color: opt.color,
        });
    }
    if (filters.comparison !== 'all') {
      const compLabels: Record<string, { label: string; color: string }> = {
        improved: { label: 'Improved', color: STATUS_COLORS.success },
        regressed: { label: 'Regressed', color: STATUS_COLORS.error },
        unchanged: { label: 'Unchanged', color: STATUS_COLORS.neutral },
      };
      const cl = compLabels[filters.comparison];
      if (cl)
        pills.push({
          label: cl.label,
          key: 'comparison',
          clearKey: 'comparison',
          color: cl.color,
        });
    }
    if (filters.host !== 'all') {
      pills.push({
        label: `Host: ${filters.host}`,
        key: 'host',
        clearKey: 'host',
        color: STATUS_COLORS.info,
      });
    }
    return pills;
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── N/A count: fetch via batch stats using resolved scan UUID ───
  const resolvedId = meta.resolvedScanId || jobId;
  useEffect(() => {
    if (!resolvedId) return undefined;
    let cancelled = false;
    api
      .getBatchScanStats([resolvedId])
      .then(stats => {
        if (cancelled) return;
        const s = stats[resolvedId];
        if (s) {
          if (typeof s.naCount === 'number') setNaCount(s.naCount);
          setScanStats({
            pass: s.pass,
            fail: s.fail,
            rules: s.rules,
            hosts: s.hosts,
            totalPackages: s.totalPackages,
            totalScannedPackages: s.totalScannedPackages,
            totalVulnerablePackages: s.totalVulnerablePackages,
          });
        }
      })
      .catch(() => {
        /* non-critical */
      });
    return () => {
      cancelled = true;
    };
  }, [api, resolvedId]);

  const handleNaChipClick = useCallback(() => {
    setNaExpanded(prev => !prev);
    if (!naRules && !naLoading && resolvedId) {
      setNaLoading(true);
      api
        .getNotApplicableRules(resolvedId)
        .then(rules => {
          setNaRules(rules);
          setNaLoading(false);
        })
        .catch(() => {
          setNaRules([]);
          setNaLoading(false);
        });
    }
  }, [api, resolvedId, naRules, naLoading]);

  // ─── Comparison / verification data ──────────────────────────────

  useEffect(() => {
    let cancelled = false;
    if (compareToScanId) {
      setCompareProfileMismatch(false);
      setCompareSwapped(false);
      setCompareWorkflowJobId(null);
      Promise.all([
        api.getFindings(compareToScanId),
        api
          .getScans()
          .then(scans =>
            scans.find(
              s =>
                s.id === compareToScanId ||
                String(s.workflowJobId) === compareToScanId,
            ),
          ),
      ])
        .then(([data, compareScan]) => {
          if (cancelled) return;
          if (
            compareScan &&
            meta.scanComplianceProfileId &&
            compareScan.profileId !== meta.scanComplianceProfileId
          ) {
            setCompareProfileMismatch(true);
          }
          if (
            compareScan &&
            meta.scanStartedAt &&
            new Date(compareScan.startedAt) > new Date(meta.scanStartedAt)
          ) {
            setCompareSwapped(true);
          }
          if (compareScan?.workflowJobId) {
            setCompareWorkflowJobId(compareScan.workflowJobId);
          }
          setPreviousFindings(data);
          if (data.length > 0) setFindingsExpanded(false);
        })
        .catch(err => {
          // eslint-disable-next-line no-console
          console.error('Failed to load comparison findings:', err);
        });
    } else if (meta.scanType === 'verification' && jobId) {
      api
        .getPreviousFindings(jobId)
        .then(data => {
          if (cancelled) return;
          setPreviousFindings(data);
          if (data.length > 0) setFindingsExpanded(false);
        })
        .catch(err => {
          // eslint-disable-next-line no-console
          console.error(
            'Failed to load previous findings for comparison:',
            err,
          );
        });
    }
    return () => {
      cancelled = true;
    };
  }, [
    api,
    jobId,
    meta.scanType,
    compareToScanId,
    meta.scanComplianceProfileId,
    meta.scanStartedAt,
  ]);

  // ─── Findings fetch / poll ───────────────────────────────────────

  const isWorkflowPoll = jobId ? /^\d+$/.test(jobId) : false;

  const severityParam = searchParams.get('severity');
  const statusParam = searchParams.get('status');
  const serverSeverity =
    usePagination && severityParam ? severityParam : undefined;
  const serverStatus = usePagination && statusParam ? statusParam : undefined;

  useEffect(() => {
    let cancelled = false;
    let retries = 0;
    let timeoutId: ReturnType<typeof setTimeout>;
    const maxRetries = 30;
    const pollInterval = 10_000;

    const fetchFindings = () => {
      if (!jobId) {
        setLoading(false);
        return;
      }

      // Try paginated fetch first (works for scans with DB findings)
      api
        .getFindingsPaginated(jobId, {
          limit: rowsPerPage,
          offset: page * rowsPerPage,
          severity: serverSeverity,
          status: serverStatus,
        })
        .then(result => {
          if (cancelled) return undefined;
          if (result.total > 0) {
            setFindings(result.findings);
            setTotalFindings(result.total);
            if (result.totalFailing !== undefined)
              setTotalFailingRules(result.totalFailing);
            setLoading(false);
            return undefined;
          }
          // No paginated results — fall back to scan status check + legacy path
          return api.getScan(jobId).then(scan => {
            if (cancelled) return;
            if (!scan) {
              // eslint-disable-next-line @typescript-eslint/no-use-before-define
              setScanFailed(
                'Scan not found. It may have been deleted or the ID is invalid.',
              );
              setLoading(false);
            } else if (
              scan.status === 'failed' ||
              scan.status === 'cancelled'
            ) {
              // eslint-disable-next-line @typescript-eslint/no-use-before-define
              setScanFailed(scan.errorDetails || scan.status);
              setLoading(false);
            } else if (scan.status === 'completed') {
              setLoading(false);
            } else if (scan.status === 'pending' || scan.status === 'running') {
              if (scan.workflowJobId && !isWorkflowPoll) {
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                setPendingScanWorkflowJobId(scan.workflowJobId);
              } else {
                timeoutId = setTimeout(fetchFindings, pollInterval);
              }
            } else if (retries < maxRetries) {
              retries++;
              timeoutId = setTimeout(fetchFindings, pollInterval);
            } else {
              setLoading(false);
            }
          });
        })
        .catch(err => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
          }
        });
    };

    fetchFindings();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    api,
    jobId,
    isWorkflowPoll,
    page,
    rowsPerPage,
    serverSeverity,
    serverStatus,
  ]);

  useEffect(() => {
    setPage(0);
  }, [serverSeverity, serverStatus]);

  // ─── Computed metrics ────────────────────────────────────────────

  const totalHosts = useMemo(() => {
    if (usePagination && scanStats) return scanStats.hosts;
    const hostSet = new Set<string>();
    displayFindings.forEach(f => f.hosts.forEach(h => hostSet.add(h.host)));
    return hostSet.size;
  }, [displayFindings, usePagination, scanStats]);
  const rulesWithFailures = useMemo(() => {
    if (
      displayConfig.scoreFormula === 'vulnerability_free_rate' &&
      scanStats?.totalVulnerablePackages !== undefined
    ) {
      return scanStats.totalVulnerablePackages;
    }
    return usePagination
      ? totalFailingRules
      : displayFindings.filter(f => f.failCount > 0).length;
  }, [
    displayConfig.scoreFormula,
    scanStats,
    usePagination,
    totalFailingRules,
    displayFindings,
  ]);
  const totalRules = useMemo(() => {
    if (
      displayConfig.scoreFormula === 'vulnerability_free_rate' &&
      scanStats?.totalScannedPackages
    ) {
      return scanStats.totalScannedPackages;
    }
    return usePagination ? totalFindings : displayFindings.length;
  }, [
    displayConfig.scoreFormula,
    scanStats,
    usePagination,
    totalFindings,
    displayFindings,
  ]);
  const scoreFromFindings = useCallback(
    (fList: MultiHostFinding[]) => {
      const pass = fList.reduce((sum, f) => sum + f.passCount, 0);
      const fail = fList.reduce((sum, f) => sum + f.failCount, 0);
      const total = fList.reduce((sum, f) => sum + f.totalCount, 0);
      return displayConfig.computeScore(pass, fail, total);
    },
    [displayConfig],
  );

  const scanTotal = useMemo(() => {
    if (!scanStats) return 0;
    return displayConfig.scoreFormula === 'vulnerability_free_rate' &&
      scanStats.totalPackages
      ? scanStats.totalPackages
      : scanStats.pass + scanStats.fail;
  }, [scanStats, displayConfig.scoreFormula]);

  const scanMetaForScore = useMemo(() => {
    if (!scanStats) return undefined;
    return {
      totalScannedPackages: scanStats.totalScannedPackages,
      totalVulnerablePackages: scanStats.totalVulnerablePackages,
    };
  }, [scanStats]);

  const overallPassRate =
    usePagination && scanStats
      ? displayConfig.computeScore(
          scanStats.pass,
          scanStats.fail,
          scanTotal,
          scanMetaForScore,
        )
      : scoreFromFindings(displayFindings);

  const standardPassRate = useMemo(
    () =>
      usePagination && scanStats
        ? displayConfig.computeScore(
            scanStats.pass,
            scanStats.fail,
            scanTotal,
            scanMetaForScore,
          )
        : scoreFromFindings(findings),
    [
      findings,
      scoreFromFindings,
      usePagination,
      scanStats,
      scanTotal,
      scanMetaForScore,
      displayConfig,
    ],
  );

  const baselinePassRate = useMemo(() => {
    if (baseline.baselineRuleIds.size === 0) return undefined;
    const blFindings = findings.filter(f =>
      baseline.baselineRuleIds.has(f.ruleId),
    );
    return scoreFromFindings(blFindings);
  }, [findings, baseline.baselineRuleIds, scoreFromFindings]);

  const previousStandardPassRate = useMemo(() => {
    if (previousFindings.length === 0) return 0;
    return scoreFromFindings(previousFindings);
  }, [previousFindings, scoreFromFindings]);

  const previousBaselinePassRate = useMemo(() => {
    if (baseline.baselineRuleIds.size === 0 || previousFindings.length === 0)
      return undefined;
    const blFindings = previousFindings.filter(f =>
      baseline.baselineRuleIds.has(f.ruleId),
    );
    return scoreFromFindings(blFindings);
  }, [previousFindings, baseline.baselineRuleIds, scoreFromFindings]);

  const isVerification = meta.scanType === 'verification';
  const isComparison = !!compareToScanId || isVerification;
  const displayPreviousFindings = useMemo(() => {
    if (!baselineFilterActive || baseline.baselineRuleIds.size === 0)
      return previousFindings;
    return previousFindings.filter(f => baseline.baselineRuleIds.has(f.ruleId));
  }, [previousFindings, baselineFilterActive, baseline.baselineRuleIds]);

  const previousPassRate = useMemo(() => {
    if (displayPreviousFindings.length === 0) return 0;
    return scoreFromFindings(displayPreviousFindings);
  }, [displayPreviousFindings, scoreFromFindings]);

  const comparisonStats = useMemo(() => {
    if (!comparisonMap) return { improved: 0, regressed: 0, unchanged: 0 };
    let improved = 0;
    let regressed = 0;
    let unchanged = 0;
    for (const v of comparisonMap.values()) {
      if (v === 'improved') improved++;
      else if (v === 'regressed') regressed++;
      else unchanged++;
    }
    return { improved, regressed, unchanged };
  }, [comparisonMap]);

  // ─── Scan progress callbacks ─────────────────────────────────────

  const [showProgress, setShowProgress] = useState(false);
  const [pendingScanWorkflowJobId, setPendingScanWorkflowJobId] = useState<
    number | null
  >(null);
  useEffect(() => {
    if (!loading || (!isWorkflowPoll && !pendingScanWorkflowJobId))
      return undefined;
    const t = setTimeout(() => setShowProgress(true), 1500);
    return () => clearTimeout(t);
  }, [loading, isWorkflowPoll, pendingScanWorkflowJobId]);

  const [scanFailed, setScanFailed] = useState<string | null>(null);

  const triggerFetch = useCallback(() => {
    if (!jobId) return;
    setLoading(true);
    api
      .getFindingsPaginated(jobId, { limit: rowsPerPage, offset: 0 })
      .then(result => {
        if (result.total > 0) {
          setFindings(result.findings);
          setTotalFindings(result.total);
          if (result.totalFailing !== undefined)
            setTotalFailingRules(result.totalFailing);
          setPage(0);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [api, jobId, rowsPerPage]);

  const handleScanFailed = useCallback(
    (status: string) => {
      if (!jobId) {
        setScanFailed(status);
        setLoading(false);
        return;
      }
      api
        .getFindingsPaginated(jobId, { limit: rowsPerPage, offset: 0 })
        .then(result => {
          if (result.total > 0) {
            setFindings(result.findings);
            setTotalFindings(result.total);
            if (result.totalFailing !== undefined)
              setTotalFailingRules(result.totalFailing);
            setPage(0);
          } else {
            api
              .getScan(jobId)
              .then(scan => {
                setScanFailed(scan?.errorDetails || status);
              })
              .catch(() => setScanFailed(status));
          }
          setLoading(false);
        })
        .catch(() => {
          api
            .getScan(jobId)
            .then(scan => {
              setScanFailed(scan?.errorDetails || status);
            })
            .catch(() => setScanFailed(status));
          setLoading(false);
        });
    },
    [api, jobId, rowsPerPage],
  );

  // ─── Render states ───────────────────────────────────────────────

  if (loading) {
    if (showProgress && pendingScanWorkflowJobId) {
      return (
        <Box p={4}>
          <ScanProgress
            workflowJobId={pendingScanWorkflowJobId}
            onComplete={triggerFetch}
            onFailed={handleScanFailed}
            scanType={meta.scanType}
          />
        </Box>
      );
    }
    if (showProgress && isWorkflowPoll && jobId) {
      return (
        <Box p={4}>
          <ScanProgress
            workflowJobId={Number(jobId)}
            onComplete={triggerFetch}
            onFailed={handleScanFailed}
            scanType={meta.scanType}
          />
        </Box>
      );
    }
    return (
      <Box p={4}>
        <Progress />
        <Typography variant="body2" align="center" style={{ marginTop: 16 }}>
          Loading scan results...
        </Typography>
      </Box>
    );
  }

  if (scanFailed) {
    return (
      <ScanFailedView
        scanFailed={scanFailed}
        isWorkflowPoll={isWorkflowPoll}
        jobId={jobId}
        scanType={meta.scanType}
        onComplete={triggerFetch}
        onFailed={handleScanFailed}
      />
    );
  }

  if (findings.length === 0 && !error) {
    return (
      <>
        <Breadcrumbs>
          <Typography
            color="primary"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/compliance')}
          >
            Compliance
          </Typography>
          <Typography>
            {(() => {
              if (compareToScanId) return 'Scan Comparison';
              if (isVerification) return 'Verification Results';
              return 'Assessment Results';
            })()}
          </Typography>
        </Breadcrumbs>
        <Box mt={2} />
        <InfoCard title="Scan Results">
          <div className={classes.emptyState}>
            <AssessmentIcon
              style={{
                fontSize: 64,
                color: STATUS_COLORS.neutral,
                marginBottom: 16,
              }}
            />
            <Typography variant="h6" color="textSecondary" gutterBottom>
              No scan results yet
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Launch a compliance scan to see findings and per-host results
              here.
            </Typography>
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('/compliance/scan')}
            >
              Launch a Scan
            </Button>
          </div>
        </InfoCard>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Breadcrumbs>
          <Typography
            color="primary"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/compliance')}
          >
            Compliance
          </Typography>
          <Typography>
            {(() => {
              if (compareToScanId) return 'Scan Comparison';
              if (isVerification) return 'Verification Results';
              return 'Assessment Results';
            })()}
          </Typography>
        </Breadcrumbs>
        <Box mt={2} />
        <InfoCard title="Error Loading Results">
          <Box p={3} textAlign="center">
            <Typography variant="body1" color="error" gutterBottom>
              Failed to load scan results: {error}
            </Typography>
            <Button variant="outlined" onClick={() => navigate('/compliance')}>
              Back to Dashboard
            </Button>
          </Box>
        </InfoCard>
      </>
    );
  }

  // ─── Main results view ───────────────────────────────────────────

  const handleGroupToggle = (group: string) => {
    setExpandedGroup(prev => (prev === group ? null : group));
  };

  return (
    <>
      <Breadcrumbs>
        <Typography
          color="primary"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/compliance')}
        >
          Compliance
        </Typography>
        <Typography>
          {(() => {
            if (compareToScanId) return 'Scan Comparison';
            if (isVerification) return 'Verification Results';
            return 'Assessment Results';
          })()}
        </Typography>
      </Breadcrumbs>

      <Box mt={2} />

      {meta.profileName && (
        <Box mb={2} display="flex" alignItems="center" style={{ gap: 8 }}>
          <Typography variant="subtitle2">{meta.profileName}</Typography>
          {meta.frameworkLabel && (
            <Chip label={meta.frameworkLabel} size="small" variant="outlined" />
          )}
          {meta.profileCert && (
            <CertificationBadge certification={meta.profileCert} />
          )}
          {meta.scanInventoryName && (
            <Chip
              label={meta.scanInventoryName}
              size="small"
              variant="outlined"
              clickable
              icon={<ListIcon style={{ fontSize: 16 }} />}
              style={{
                color: STATUS_COLORS.neutral,
                borderColor: STATUS_COLORS.neutral,
              }}
              onClick={e => {
                e.stopPropagation();
                if (meta.scanInventoryId) {
                  const path = `/compliance/inventories/${meta.scanInventoryId}`;
                  navigate(
                    meta.scanComplianceProfileId
                      ? `${path}?profileId=${meta.scanComplianceProfileId}`
                      : path,
                  );
                }
              }}
            />
          )}
          {meta.scanStartedAt && (
            <Typography variant="caption" color="textSecondary">
              {new Date(meta.scanStartedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Typography>
          )}
        </Box>
      )}

      {baseline.baselineForScan && baseline.baselineRuleIds.size > 0 && (
        <Box mb={1} display="flex" alignItems="center" style={{ gap: 8 }}>
          <Button
            variant={baselineFilterActive ? 'contained' : 'outlined'}
            color={baselineFilterActive ? 'primary' : 'default'}
            size="small"
            onClick={() => setBaselineFilterActive(prev => !prev)}
          >
            {baselineFilterActive
              ? `Baseline View (${baseline.baselineRuleIds.size} rules)`
              : 'Show Baseline Only'}
          </Button>
          {baselineFilterActive && baseline.baselineProfile && (
            <Chip
              label={baseline.baselineProfile.name}
              size="small"
              variant="outlined"
              clickable
              onClick={() =>
                navigate(
                  `/compliance/remediation-edit/${
                    baseline.baselineProfile!.id
                  }`,
                )
              }
              style={{ cursor: 'pointer' }}
            />
          )}
        </Box>
      )}

      {compareProfileMismatch && (
        <Box
          mb={2}
          p={2}
          style={{
            backgroundColor: '#FFF3E0',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Typography variant="body2" style={{ color: '#E65100' }}>
            Warning: These scans are from different compliance profiles. The
            comparison may not be meaningful.
          </Typography>
        </Box>
      )}

      {isComparison && previousFindings.length > 0 ? (
        <VerificationComparison
          title={compareToScanId ? 'Scan Comparison' : undefined}
          previousPassRate={compareSwapped ? overallPassRate : previousPassRate}
          overallPassRate={compareSwapped ? previousPassRate : overallPassRate}
          totalHosts={totalHosts}
          totalRules={totalRules}
          comparisonStats={
            compareSwapped
              ? {
                  improved: comparisonStats.regressed,
                  regressed: comparisonStats.improved,
                  unchanged: comparisonStats.unchanged,
                }
              : comparisonStats
          }
          beforeScanLabel={(() => {
            if (!compareToScanId) return undefined;
            const id = compareSwapped
              ? meta.resolvedWorkflowJobId ?? jobId
              : compareWorkflowJobId ?? compareToScanId;
            return `Scan #${id}`;
          })()}
          afterScanLabel={(() => {
            if (!compareToScanId) return undefined;
            const id = compareSwapped
              ? compareWorkflowJobId ?? compareToScanId
              : meta.resolvedWorkflowJobId ?? jobId;
            return `Scan #${id}`;
          })()}
          onBeforeScanClick={
            compareToScanId
              ? () => {
                  const id = compareSwapped
                    ? meta.resolvedWorkflowJobId ?? jobId
                    : compareWorkflowJobId ?? compareToScanId;
                  navigate(`/compliance/results/${id}`);
                }
              : undefined
          }
          onAfterScanClick={
            compareToScanId
              ? () => {
                  const id = compareSwapped
                    ? compareWorkflowJobId ?? compareToScanId
                    : meta.resolvedWorkflowJobId ?? jobId;
                  navigate(`/compliance/results/${id}`);
                }
              : undefined
          }
          beforeBaselineRate={
            compareSwapped ? baselinePassRate : previousBaselinePassRate
          }
          afterBaselineRate={
            compareSwapped ? previousBaselinePassRate : baselinePassRate
          }
          beforeStandardRate={
            compareSwapped ? standardPassRate : previousStandardPassRate
          }
          afterStandardRate={
            compareSwapped ? previousStandardPassRate : standardPassRate
          }
          isBaselineView={baselineFilterActive}
          activeComparison={filters.comparison}
          onStatClick={stat => updateFilter('comparison', stat)}
        />
      ) : (
        <SummaryCards
          overallPassRate={overallPassRate}
          totalHosts={totalHosts}
          totalRules={totalRules}
          rulesWithFailures={rulesWithFailures}
          baselineRate={baselinePassRate}
          standardRate={standardPassRate}
          isBaselineView={baselineFilterActive}
          displayConfig={displayConfig}
        />
      )}

      {/* N/A rules info — only shown when N/A rules exist */}
      {naCount !== null && naCount > 0 && (
        <Box
          mt={1}
          mb={1}
          display="flex"
          alignItems="flex-start"
          flexDirection="column"
          style={{ gap: 4 }}
        >
          <Chip
            label={`${naCount} rule${naCount === 1 ? '' : 's'} not applicable`}
            size="small"
            variant="outlined"
            clickable
            onClick={handleNaChipClick}
            icon={
              naExpanded ? (
                <ExpandLessIcon style={{ fontSize: 16 }} />
              ) : (
                <ExpandMoreIcon style={{ fontSize: 16 }} />
              )
            }
            style={{
              color: STATUS_COLORS.neutral,
              borderColor: STATUS_COLORS.neutral,
            }}
          />
          <Collapse in={naExpanded} unmountOnExit>
            <Box
              mt={1}
              style={{
                maxHeight: 240,
                overflowY: 'auto',
                border: '1px solid #d2d2d2',
                borderRadius: 4,
              }}
            >
              {(() => {
                if (naLoading) {
                  return (
                    <Box
                      display="flex"
                      alignItems="center"
                      p={1}
                      style={{ gap: 8 }}
                    >
                      <CircularProgress size={14} />
                      <Typography variant="caption" color="textSecondary">
                        Loading N/A rules...
                      </Typography>
                    </Box>
                  );
                }
                if (naRules && naRules.length > 0) {
                  return (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell
                            style={{
                              fontSize: '0.72rem',
                              padding: '4px 8px',
                              color: STATUS_COLORS.neutral,
                            }}
                          >
                            Severity
                          </TableCell>
                          <TableCell
                            style={{
                              fontSize: '0.72rem',
                              padding: '4px 8px',
                              color: STATUS_COLORS.neutral,
                            }}
                          >
                            Rule ID
                          </TableCell>
                          <TableCell
                            style={{
                              fontSize: '0.72rem',
                              padding: '4px 8px',
                              color: STATUS_COLORS.neutral,
                            }}
                          >
                            Title
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {naRules.map(r => (
                          <TableRow key={r.ruleId}>
                            <TableCell
                              style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                color: STATUS_COLORS.neutral,
                              }}
                            >
                              {r.severity}
                            </TableCell>
                            <TableCell
                              style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                fontFamily: 'monospace',
                                color: STATUS_COLORS.neutral,
                              }}
                            >
                              {r.ruleId}
                            </TableCell>
                            <TableCell
                              style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                color: STATUS_COLORS.neutral,
                              }}
                            >
                              {r.ruleTitle}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  );
                }
                return (
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    style={{ padding: '8px 12px', display: 'block' }}
                  >
                    No N/A rule details available.
                  </Typography>
                );
              })()}
            </Box>
          </Collapse>
        </Box>
      )}

      <Box mt={2} />

      {/* Action Bar */}
      <Box className={classes.actionBar}>
        <Button variant="outlined" onClick={() => navigate('/compliance')}>
          Back to Overview
        </Button>

        <Box display="flex" style={{ gap: 8 }} alignItems="center">
          <ExportButton
            findings={filtered}
            profileName={jobId}
            displayConfig={meta.profileDisplayConfig}
            scanId={meta.resolvedScanId || jobId}
            onFetchArtifacts={fetchArtifactsCb}
            onDownloadArtifact={downloadArtifactCb}
          />

          {baseline.baselineForScan ? (
            <Button
              variant="contained"
              color="primary"
              size="large"
              onClick={() => baseline.setBaselineLaunchOpen(true)}
            >
              Use Baseline Remediation
            </Button>
          ) : (
            <Button
              variant="contained"
              color="primary"
              size="large"
              startIcon={<BuildIcon />}
              onClick={() => navigate(`/compliance/remediation/${jobId}`)}
            >
              Build Remediation ({rulesWithFailures})
            </Button>
          )}

          <IconButton
            size="small"
            onClick={e => setOverflowAnchor(e.currentTarget)}
            aria-label="More actions"
          >
            <MoreVertIcon />
          </IconButton>
          <Menu
            anchorEl={overflowAnchor}
            open={Boolean(overflowAnchor)}
            onClose={() => setOverflowAnchor(null)}
            elevation={3}
            PaperProps={{ style: { borderRadius: 8 } }}
          >
            {baseline.baselineForScan ? (
              [
                <MenuItem
                  key="build"
                  onClick={() => {
                    setOverflowAnchor(null);
                    navigate(`/compliance/remediation/${jobId}`);
                  }}
                >
                  <BuildIcon fontSize="small" style={{ marginRight: 8 }} />
                  Build New Remediation ({rulesWithFailures})
                </MenuItem>,
                <MenuItem
                  key="other"
                  onClick={() => {
                    setOverflowAnchor(null);
                    const filter = meta.scanComplianceProfileId
                      ? `?complianceProfileId=${encodeURIComponent(
                          meta.scanComplianceProfileId,
                        )}`
                      : '';
                    navigate(`/compliance/remediations${filter}`);
                  }}
                >
                  <ListIcon fontSize="small" style={{ marginRight: 8 }} />
                  Use Other Remediation...
                </MenuItem>,
              ]
            ) : (
              <MenuItem
                onClick={() => {
                  setOverflowAnchor(null);
                  const filter = meta.scanComplianceProfileId
                    ? `?complianceProfileId=${encodeURIComponent(
                        meta.scanComplianceProfileId,
                      )}`
                    : '';
                  navigate(`/compliance/remediations${filter}`);
                }}
              >
                <ListIcon fontSize="small" style={{ marginRight: 8 }} />
                Use Existing Remediation
              </MenuItem>
            )}
          </Menu>
        </Box>
      </Box>

      {/* Findings collapse trigger for comparison views */}
      {isComparison && (
        <div
          className={classes.findingsCollapseTrigger}
          onClick={() => setFindingsExpanded(!findingsExpanded)}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ')
              setFindingsExpanded(!findingsExpanded);
          }}
        >
          {findingsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          <Typography
            variant="body2"
            style={{ fontWeight: 500, marginLeft: 4 }}
          >
            {findingsExpanded
              ? 'Collapse Findings'
              : `Expand Findings (${filtered.length} rules)`}
          </Typography>
        </div>
      )}
      <Collapse in={findingsExpanded}>
        <InfoCard title="Findings by Rule">
          {/* Filter bar */}
          <div className={classes.filterBar}>
            <TextField
              placeholder="Search by title or rule ID..."
              variant="outlined"
              size="small"
              style={{ minWidth: 240, flex: '1 1 240px', maxWidth: 360 }}
              value={filters.search}
              onChange={e => updateFilter('q', e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />

            <FilterGroup
              label="Severity"
              options={severityOptions}
              activeValue={filters.severity}
              expanded={expandedGroup === 'severity'}
              onToggleExpand={() => handleGroupToggle('severity')}
              onSelect={key => updateFilter('severity', key)}
            />

            <FilterGroup
              label="Status"
              options={STATUS_OPTIONS}
              activeValue={filters.status}
              expanded={expandedGroup === 'status'}
              onToggleExpand={() => handleGroupToggle('status')}
              onSelect={key => updateFilter('status', key)}
            />

            <FilterGroup
              label="State"
              options={STATE_OPTIONS}
              activeValue={filters.state}
              expanded={expandedGroup === 'state'}
              onToggleExpand={() => handleGroupToggle('state')}
              onSelect={key => updateFilter('state', key)}
            />

            <FilterGroup
              label="Risk"
              options={RISK_OPTIONS}
              activeValue={riskActiveValue}
              expanded={expandedGroup === 'risk'}
              onToggleExpand={() => handleGroupToggle('risk')}
              onSelect={handleRiskSelect}
            />

            <Chip
              label={`${filtered.length} rules`}
              variant="outlined"
              size="small"
            />
          </div>

          {/* Active filter summary */}
          {activeFilterCount > 0 && (
            <div className={classes.activeFiltersRow}>
              {activeFilterPills.map(pill => (
                <Chip
                  key={pill.key}
                  label={pill.label}
                  size="small"
                  style={{
                    backgroundColor: pill.color,
                    color: '#fff',
                    fontWeight: 500,
                    fontSize: '0.75rem',
                  }}
                  onDelete={() => updateFilter(pill.clearKey, 'all')}
                />
              ))}
              <Chip
                label="Clear all"
                size="small"
                variant="outlined"
                onDelete={clearAll}
              />
            </div>
          )}

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={40} style={TABLE_STYLES.header} />
                  <TableCell style={TABLE_STYLES.header}>
                    {displayConfig.columns.find(c => c.field === 'severity')
                      ?.label ?? 'Severity'}
                  </TableCell>
                  <TableCell style={TABLE_STYLES.header}>
                    {displayConfig.columns.find(c => c.field === 'title')
                      ?.label ?? 'Title'}
                  </TableCell>
                  <TableCell style={TABLE_STYLES.header}>
                    {displayConfig.columns.find(c => c.field === 'rule_id')
                      ?.label ?? 'Rule ID'}
                  </TableCell>
                  <TableCell style={TABLE_STYLES.header} align="center">
                    Hosts
                  </TableCell>
                  <TableCell style={TABLE_STYLES.header} width={200}>
                    Pass Rate
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map(finding => (
                  <FindingRow
                    key={finding.ruleId}
                    finding={finding}
                    expanded={expandedRule === finding.ruleId}
                    onToggle={() =>
                      setExpandedRule(
                        expandedRule === finding.ruleId ? null : finding.ruleId,
                      )
                    }
                    hostFilter={
                      filters.host !== 'all' ? filters.host : undefined
                    }
                    severityLabelFn={displayConfig.severityLabel}
                  />
                ))}
              </TableBody>
            </Table>
            {usePagination && (
              <TablePagination
                component="div"
                count={totalFindings}
                page={page}
                onPageChange={(_e, newPage) => {
                  setPage(newPage);
                  setExpandedRule(null);
                }}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={e => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                  setExpandedRule(null);
                }}
                rowsPerPageOptions={[50, 100, 250, 500]}
                labelRowsPerPage="Findings per page:"
              />
            )}
          </TableContainer>
        </InfoCard>
      </Collapse>

      {/* Baseline launch dialog */}
      <Dialog
        open={baseline.baselineLaunchOpen}
        onClose={() => baseline.setBaselineLaunchOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Launch Baseline Remediation</DialogTitle>
        <DialogContent>
          {(() => {
            if (baseline.baselineProfile) {
              return (
                <Box mb={2}>
                  <Typography variant="body2" color="textSecondary">
                    Profile: <strong>{baseline.baselineProfile.name}</strong>
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Rules:{' '}
                    {
                      baseline.baselineProfile.selections.filter(s => s.enabled)
                        .length
                    }{' '}
                    selected
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Inventory:{' '}
                    <strong>
                      {meta.profileName
                        ? `${meta.frameworkLabel} scan target`
                        : `ID ${meta.scanInventoryId}`}
                    </strong>
                  </Typography>
                </Box>
              );
            }
            if (baseline.baselineScanChecking) {
              return (
                <Box
                  display="flex"
                  alignItems="center"
                  py={2}
                  style={{ gap: 8 }}
                >
                  <CircularProgress size={20} />
                  <Typography variant="body2" color="textSecondary">
                    Loading profile...
                  </Typography>
                </Box>
              );
            }
            return null;
          })()}

          {baseline.baselineScanChecking && baseline.baselineProfile && (
            <Box display="flex" alignItems="center" style={{ gap: 8 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="textSecondary">
                Checking for assessment scan...
              </Typography>
            </Box>
          )}

          {baseline.baselineScanCheck && (
            <Box
              display="flex"
              alignItems="center"
              style={{ gap: 8, color: STATUS_COLORS.success }}
            >
              <CheckCircleIcon fontSize="small" />
              <Typography variant="body2">
                Last scan: {baseline.baselineScanCheck.passRate}% pass rate (
                {baseline.baselineScanCheck.passCount} pass,{' '}
                {baseline.baselineScanCheck.failCount} fail)
                {baseline.baselineScanCheck.scan.completedAt && (
                  <span style={{ color: STATUS_COLORS.neutral }}>
                    {' '}
                    &mdash;{' '}
                    {new Date(
                      baseline.baselineScanCheck.scan.completedAt,
                    ).toLocaleDateString()}
                  </span>
                )}
              </Typography>
            </Box>
          )}

          {baseline.baselineScanMissing && (
            <Box>
              <Box
                display="flex"
                alignItems="center"
                style={{ gap: 8, color: STATUS_COLORS.error, marginBottom: 8 }}
              >
                <WarningIcon fontSize="small" />
                <Typography variant="body2">
                  No completed assessment scan found for this inventory.
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  baseline.setBaselineLaunchOpen(false);
                  const params = new URLSearchParams();
                  if (meta.scanComplianceProfileId)
                    params.set('profile', meta.scanComplianceProfileId);
                  if (meta.scanInventoryId)
                    params.set('inventory', String(meta.scanInventoryId));
                  navigate(`/compliance/scan?${params.toString()}`);
                }}
              >
                Run a Scan First
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => baseline.setBaselineLaunchOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            disabled={
              !baseline.baselineScanCheck || baseline.baselineScanChecking
            }
            startIcon={<PlayArrowIcon />}
            onClick={() => {
              if (
                !baseline.baselineForScan ||
                !baseline.baselineScanCheck ||
                !meta.scanInventoryId
              )
                return;
              const params = new URLSearchParams();
              params.set(
                'profileId',
                baseline.baselineForScan.remediationProfileId,
              );
              params.set('inventoryId', String(meta.scanInventoryId));
              params.set('scanId', baseline.baselineScanCheck.scan.id);
              baseline.setBaselineLaunchOpen(false);
              navigate(`/compliance/execute/launch?${params.toString()}`);
            }}
          >
            Launch Remediation
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
