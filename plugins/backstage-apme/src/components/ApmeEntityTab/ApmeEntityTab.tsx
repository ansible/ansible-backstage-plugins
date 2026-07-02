/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAsyncRetry } from 'react-use';
import { useApi, configApiRef } from '@backstage/core-plugin-api';
import { scmAuthApiRef } from '@backstage/integration-react';
import { useEntity } from '@backstage/plugin-catalog-react';
import {
  Content,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { ApmeUnavailable } from '../ApmeUnavailable';
import {
  APME_GATEWAY_UNAVAILABLE_MESSAGE,
  isApmeConnectionError,
} from '../../utils/apmeConnectionError';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Select,
  Tooltip,
  Typography,
  makeStyles,
  useTheme,
} from '@material-ui/core';
import ScanIcon from '@material-ui/icons/PlayCircleOutline';
import RefreshIcon from '@material-ui/icons/Refresh';
import FilterListIcon from '@material-ui/icons/FilterList';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import CloseIcon from '@material-ui/icons/Close';
import WarningIcon from '@material-ui/icons/Warning';
import type {
  Violation,
  Proposal,
  OperationState,
} from '@ansible/backstage-apme-common/types';
import {
  isTerminalOperationState,
  formatOperationError,
  latestOperationProgressMessage,
  latestOperationProgressPercent,
  projectHasActiveOperation,
} from '@ansible/backstage-apme-common/operationStatus';
import {
  SEVERITY_STYLES,
  normalizeSeverity,
  effectiveFixType,
  isFixableViolation,
  proposalNeedsManualApproval,
  categoryLabel,
  type SeverityLevel,
} from '@ansible/backstage-apme-common/severity';
import {
  normalizeRepoUrlFromEntity,
  defaultBranchFromEntity,
} from '@ansible/backstage-rhaap-common/catalogEntity';
import { buildDevSpacesUrlFromRepoUrl } from '@ansible/backstage-rhaap-common/devSpaces';
import { apmeApiRef } from '../../api';
import { useApmeAiEnabled, useApmeAiStatus } from '../../hooks/useApmeEnabled';
import { ApmeViolationsTable } from '../ApmeViolationsTable';
import { EditInDevSpacesButton } from '../EditInDevSpacesButton';
import { QualityWorkflowStepper } from '../QualityWorkflowStepper';
import type { RemediationStep } from '../RemediationStepper';
import { FixProgressBanner } from '../FixProgressBanner';
import { DiffView } from '../DiffView';
import { PrStatusBanner } from '../PrStatusBanner';

const ENTITY_VIOLATIONS_LIMIT = 500;

function sortAutoFixFirst(violations: Violation[]): Violation[] {
  return [...violations].sort((a, b) => {
    const aAuto = a.remediation_class === 1 ? 0 : 1;
    const bAuto = b.remediation_class === 1 ? 0 : 1;
    if (aAuto !== bAuto) return aAuto - bAuto;
    return a.id - b.id;
  });
}

const useStyles = makeStyles(theme => ({
  summaryLine: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
    flexWrap: 'wrap',
  },
  aapBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.palette.warning.light,
    padding: theme.spacing(1, 2),
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(2),
    gap: theme.spacing(2),
  },
  scanToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing(1),
  },
  scanMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  scanActions: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'center',
  },
  pillScan: {
    borderRadius: 20,
    textTransform: 'none',
    fontSize: 13,
    padding: '4px 16px',
  },
  stackedBar: {
    display: 'flex',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: theme.spacing(1),
    width: '100%',
    maxWidth: 480,
  },
  sevBar: {
    display: 'flex',
    gap: 12,
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  sevItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.15s',
    border: '1px solid transparent',
  },
  sevItemActive: {
    border: '1px solid',
  },
  filterToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing(1.5),
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  fixTypeBar: {
    display: 'flex',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  ruleBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(2),
    backgroundColor: '#e7f1fa',
    border: '1px solid #b8daff',
    borderRadius: theme.shape.borderRadius,
    flexWrap: 'wrap',
  },
  progressBanner: {
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(2),
    backgroundColor: theme.palette.background.default,
  },
  progressText: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: theme.spacing(0.5),
  },
  filterBar: {
    display: 'flex',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(1),
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  formControl: {
    minWidth: 140,
  },
  reviewPanel: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  reviewActions: {
    display: 'flex',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  noData: {
    padding: theme.spacing(4),
    textAlign: 'center',
  },
  infoBanner: {
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(2),
    backgroundColor: '#e7f1fa',
    border: '1px solid #b8daff',
    borderRadius: theme.shape.borderRadius,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
  },
  remediationErrorBanner: {
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(2),
    backgroundColor: '#fdeaea',
    border: '1px solid #f5c2c7',
    borderRadius: theme.shape.borderRadius,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
  },
  dot: { color: theme.palette.text.disabled, margin: '0 4px' },
}));

function formatTimeAgo(isoString?: string): string {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

function formatEntityLastChecked(
  project: { last_scanned_at?: string; active_operation?: unknown },
  scanning: boolean,
  scanError: Error | null,
): string {
  if (scanning || projectHasActiveOperation(project)) {
    return 'Scan in progress…';
  }
  if (scanError && !project.last_scanned_at) {
    return 'Scan failed';
  }
  return formatTimeAgo(project.last_scanned_at);
}

function generateFixesTooltip(
  autoFix: number,
  branch: string | undefined,
  selectedCount: number,
): string {
  if (autoFix === 0) {
    const branchSuffix = branch ? ` (${branch})` : '';
    return `No auto-generated fixes available for this repo${branchSuffix}. Manual violations require hand-editing in your repository.`;
  }
  if (selectedCount === 0) {
    return 'Select auto-fix violations to generate fixes';
  }
  const plural = selectedCount !== 1 ? 's' : '';
  return `Generate fixes for ${selectedCount} selected violation${plural}`;
}

interface Tier1RemediationResult {
  remediatedCount: number;
  fixedViolations: NonNullable<
    NonNullable<OperationState['result']>['fixed_violations']
  >;
  patches: NonNullable<NonNullable<OperationState['result']>['patches']>;
}

function extractTier1RemediationResult(
  state: OperationState | null | undefined,
): Tier1RemediationResult | null {
  const result = state?.result;
  if (!result) {
    return null;
  }
  const patches = result.patches ?? [];
  const fixedViolations = result.fixed_violations ?? [];
  const remediatedCount =
    result.remediated_count ?? result.remediated ?? fixedViolations.length ?? 0;
  if (
    patches.length === 0 &&
    fixedViolations.length === 0 &&
    remediatedCount === 0
  ) {
    return null;
  }
  return { remediatedCount, fixedViolations, patches };
}

function filterTier1ByViolationIds(
  tier1: Tier1RemediationResult,
  selectedIds: Set<number>,
  violations: Violation[],
): Tier1RemediationResult {
  if (selectedIds.size === 0) return tier1;

  const selectedViolations = violations.filter(v => selectedIds.has(v.id));
  const selectedKeys = new Set(
    selectedViolations.map(v => `${v.rule_id}::${v.file}`),
  );

  const filteredFixed = tier1.fixedViolations.filter(fv =>
    selectedKeys.has(`${fv.rule_id}::${fv.file}`),
  );

  const filesWithSelectedFixes = new Set(filteredFixed.map(fv => fv.file));
  const filteredPatches = tier1.patches.filter(p =>
    filesWithSelectedFixes.has(p.file),
  );

  return {
    remediatedCount: filteredFixed.length,
    fixedViolations: filteredFixed,
    patches: filteredPatches,
  };
}

function getViolationCategory(v: Violation): string {
  if (v.category) return v.category;
  if (v.validator_source === 'gitleaks') return 'secrets';
  if (
    v.validator_source === 'dep_audit' ||
    v.validator_source === 'collection_health'
  )
    return 'dependencies';
  return 'lint';
}

const CATEGORIES = [
  'all',
  'lint',
  'modernize',
  'risk',
  'secrets',
  'dependencies',
] as const;
const SEV_ORDER: SeverityLevel[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
];

export interface ApmeEntityTabProps {
  initialRuleFilter?: string;
}

export const ApmeEntityTab = ({
  initialRuleFilter,
}: ApmeEntityTabProps = {}) => {
  const classes = useStyles();
  const theme = useTheme();
  const apmeApi = useApi(apmeApiRef);
  const scmAuthApi = useApi(scmAuthApiRef);
  const configApi = useApi(configApiRef);
  const enableAi = useApmeAiEnabled();
  const { status: aiStatus, loading: aiStatusLoading } = useApmeAiStatus();
  const { entity } = useEntity();

  const [scanning, setScanning] = useState(false);
  const [expectActiveScan, setExpectActiveScan] = useState(false);
  const [scanProgress, setScanProgress] = useState<{
    status: string;
    message?: string;
    progress?: number;
    violationsFound?: number;
  } | null>(null);
  const [scanError, setScanError] = useState<Error | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [categoryMenuAnchor, setCategoryMenuAnchor] =
    useState<null | HTMLElement>(null);
  const [ruleFilter, setRuleFilter] = useState<string | null>(
    initialRuleFilter ?? null,
  );
  const [severityFilters, setSeverityFilters] = useState<Set<SeverityLevel>>(
    new Set(),
  );
  const [fixTypeFilter, setFixTypeFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [remediationStep, setRemediationStep] =
    useState<RemediationStep>('select');
  const [fixProgress, setFixProgress] = useState<{
    message: string;
    progress?: number;
  } | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [approvedProposalIds, setApprovedProposalIds] = useState<Set<string>>(
    new Set(),
  );
  const [declinedProposalIds, setDeclinedProposalIds] = useState<Set<string>>(
    new Set(),
  );
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [prBranchName, setPrBranchName] = useState<string | undefined>();
  const [prNumber, setPrNumber] = useState<number | undefined>();
  const [prError, setPrError] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [branchPushed, setBranchPushed] = useState(false);
  const [creatingPr, setCreatingPr] = useState(false);
  const [remediationActivityId, setRemediationActivityId] = useState<
    string | null
  >(null);
  const [prMerged, setPrMerged] = useState(false);
  const [remediationError, setRemediationError] = useState<Error | null>(null);
  const [tier1Result, setTier1Result] = useState<Tier1RemediationResult | null>(
    null,
  );
  const generatedViolationIdsRef = useRef<Set<number>>(new Set());

  const repoUrl = normalizeRepoUrlFromEntity(entity);
  const branch = defaultBranchFromEntity(entity);

  const {
    value: project,
    loading,
    error,
    retry,
  } = useAsyncRetry(async () => {
    if (!repoUrl) return null;
    return apmeApi.getProjectByRepoUrl(repoUrl, branch);
  }, [repoUrl, branch, apmeApi]);

  const { value: violations = [], loading: violationsLoading } =
    useAsyncRetry(async () => {
      if (!project?.id) return [];
      const loaded = await apmeApi.getViolations(project.id, {
        limit: ENTITY_VIOLATIONS_LIMIT,
      });
      return sortAutoFixFirst(loaded);
    }, [project?.id, refreshKey, apmeApi]);

  const autoFixCount = useMemo(
    () =>
      violations.filter(
        v => effectiveFixType(v.remediation_class, enableAi) === 'auto',
      ).length,
    [violations, enableAi],
  );

  const ruleScopedViolations = useMemo(
    () => violations.filter(v => !ruleFilter || v.rule_id === ruleFilter),
    [violations, ruleFilter],
  );

  useEffect(() => {
    if (initialRuleFilter) {
      setRuleFilter(initialRuleFilter);
      setFixTypeFilter('all');
    }
  }, [initialRuleFilter]);

  // Auto-select all auto-fix violations when violations load
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (violations.length === 0 || autoSelectedRef.current) return;
    const autoFixIds = new Set(
      violations.filter(v => v.remediation_class === 1).map(v => v.id),
    );
    if (autoFixIds.size > 0) {
      setSelectedIds(autoFixIds);
      autoSelectedRef.current = true;
    }
  }, [violations]);

  useEffect(() => {
    if (autoFixCount === 0 && fixTypeFilter === 'auto') {
      setFixTypeFilter('all');
    }
  }, [autoFixCount, fixTypeFilter]);

  useEffect(() => {
    if (!project?.id) {
      return undefined;
    }
    if (projectHasActiveOperation(project)) {
      setExpectActiveScan(true);
      setScanning(true);
      setScanError(null);
      return undefined;
    }
    let cancelled = false;
    void apmeApi.getOperationState(project.id).then(state => {
      if (cancelled) {
        return;
      }
      if (state?.status === 'failed') {
        setScanning(false);
        setExpectActiveScan(false);
        setScanProgress(null);
        setScanError(new Error(formatOperationError(state.error)));
        return;
      }
      const progressMessage = latestOperationProgressMessage(state);
      if (progressMessage) {
        setScanProgress({
          status: 'running',
          message: progressMessage,
        });
      }
      const active = state && !isTerminalOperationState(state, 0);
      if (active) {
        setExpectActiveScan(true);
        setScanning(true);
        setScanError(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [project, apmeApi]);

  // Poll for scan completion via gateway operation state
  useEffect(() => {
    if (!scanning || !project?.id) {
      return undefined;
    }

    let pollCount = 0;
    const maxPolls = 180;

    const pollInterval = setInterval(async () => {
      pollCount += 1;
      try {
        const state = await apmeApi.getOperationState(project.id);
        const progressMessage = latestOperationProgressMessage(state);
        if (progressMessage) {
          setScanProgress({
            status: 'running',
            message: progressMessage,
            progress: Math.min(10 + pollCount * 1.5, 90),
          });
        }
        const completed = isTerminalOperationState(
          state,
          pollCount,
          2,
          expectActiveScan,
        );

        if (completed) {
          clearInterval(pollInterval);
          setScanning(false);
          setExpectActiveScan(false);
          if (state?.status === 'failed') {
            setScanProgress(null);
            setScanError(new Error(formatOperationError(state.error)));
          } else {
            setScanProgress({
              status: 'completed',
              message: 'Scan complete',
              progress: 100,
              violationsFound: state?.result?.total_violations,
            });
            setTimeout(() => {
              retry();
              setRefreshKey(k => k + 1);
              setScanProgress(null);
            }, 1500);
          }
        }
      } catch {
        clearInterval(pollInterval);
        setScanning(false);
        setExpectActiveScan(false);
        setScanProgress(null);
      }

      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        setScanning(false);
        setExpectActiveScan(false);
        setScanProgress(null);
        setScanError(new Error('Scan timed out. Try again in a moment.'));
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [scanning, project?.id, apmeApi, retry, expectActiveScan]);

  // Poll remediation operation
  useEffect(() => {
    if (remediationStep !== 'generate' || !project?.id) return undefined;
    let pollCount = 0;
    const maxPolls = 180;
    const pollInterval = setInterval(async () => {
      pollCount += 1;
      try {
        const state = await apmeApi.getOperationState(project.id);
        const progressMessage =
          latestOperationProgressMessage(state) ?? 'Generating fixes…';
        const progressPct = latestOperationProgressPercent(state);
        setFixProgress({
          message: progressMessage,
          progress: progressPct ?? Math.min(10 + pollCount * 1.5, 90),
        });
        if (state?.proposals?.length) {
          setProposals(state.proposals);
        }
        const completed = isTerminalOperationState(state, pollCount, 2, true);
        if (completed || pollCount >= maxPolls) {
          clearInterval(pollInterval);
          setFixProgress(null);
          if (state?.status === 'failed') {
            setRemediationError(new Error(formatOperationError(state.error)));
            setRemediationStep('select');
            return;
          }
          if (pollCount >= maxPolls && !state) {
            setRemediationError(
              new Error('Fix generation timed out. Try again in a moment.'),
            );
            setRemediationStep('select');
            return;
          }
          const nextProposals = state?.proposals ?? [];
          const tier1 = extractTier1RemediationResult(state);
          if (nextProposals.length > 0) {
            setTier1Result(null);
            setProposals(nextProposals);
            setSelectedIds(new Set(nextProposals.map(p => p.violation_id)));
            setRemediationStep('review');
            setRemediationError(null);
            try {
              const activity = await apmeApi.getActivity(project.id);
              const latestId = activity[0]?.scan_id;
              if (latestId) setRemediationActivityId(latestId);
            } catch {
              // activity lookup is best-effort for push-branch
            }
          } else if (tier1) {
            const filtered = filterTier1ByViolationIds(
              tier1,
              generatedViolationIdsRef.current,
              violations,
            );
            setProposals([]);
            setTier1Result(filtered.remediatedCount > 0 ? filtered : tier1);
            setRemediationStep('review');
            setRemediationError(null);
            try {
              const activity = await apmeApi.getActivity(project.id);
              const latestId = activity[0]?.scan_id;
              if (latestId) setRemediationActivityId(latestId);
            } catch {
              // activity lookup is best-effort for push-branch
            }
          } else {
            setTier1Result(null);
            setRemediationError(
              new Error(
                'No automated patches were produced for this run. Manual-only findings require hand-editing in your repo or Dev Spaces.',
              ),
            );
            setRemediationStep('select');
          }
        }
      } catch (err) {
        clearInterval(pollInterval);
        setFixProgress(null);
        setRemediationError(err as Error);
        setRemediationStep('select');
      }
    }, 2000);
    return () => clearInterval(pollInterval);
  }, [remediationStep, project, apmeApi, violations]);

  const selectedFixableIds = useMemo(() => {
    const ids = new Set<number>();
    for (const v of violations) {
      if (
        selectedIds.has(v.id) &&
        isFixableViolation(v.remediation_class, enableAi)
      ) {
        ids.add(v.id);
      }
    }
    return ids;
  }, [violations, selectedIds, enableAi]);

  const visibleProposals = useMemo(() => {
    const active = proposals.filter(p => !declinedProposalIds.has(p.id));
    if (active.length === 0) {
      return [];
    }
    if (remediationStep === 'review') {
      return active;
    }
    if (selectedFixableIds.size > 0) {
      return active.filter(p => selectedFixableIds.has(p.violation_id));
    }
    return active;
  }, [proposals, selectedFixableIds, declinedProposalIds, remediationStep]);

  const autoApprovedRef = useRef<Set<string>>(new Set());

  // Auto-approve deterministic auto-fix proposals when review starts
  useEffect(() => {
    if (
      remediationStep !== 'review' ||
      !project?.id ||
      visibleProposals.length === 0
    ) {
      return;
    }
    const autoIds = visibleProposals
      .filter(p => {
        const v = violations.find(viol => viol.id === p.violation_id);
        if (!v) {
          return true;
        }
        return !proposalNeedsManualApproval(v.remediation_class, enableAi);
      })
      .map(p => p.id)
      .filter(id => !autoApprovedRef.current.has(id));
    if (autoIds.length === 0) return;
    autoIds.forEach(id => autoApprovedRef.current.add(id));
    setApprovedProposalIds(prev => new Set([...prev, ...autoIds]));
    void apmeApi.approveProposals(project.id, autoIds);
  }, [
    remediationStep,
    project?.id,
    visibleProposals,
    violations,
    apmeApi,
    enableAi,
  ]);

  const resolveScmToken = useCallback(async () => {
    if (!repoUrl) {
      throw new Error('No repository URL on this catalog entity.');
    }
    const creds = await scmAuthApi.getCredentials({ url: repoUrl });
    const scmToken = creds.token?.trim();
    if (!scmToken) {
      throw new Error(
        'No Git credentials available. Sign in to your Git host and try again.',
      );
    }
    return scmToken;
  }, [repoUrl, scmAuthApi]);

  const resolveActivityId = useCallback(async () => {
    if (remediationActivityId) return remediationActivityId;
    if (!project?.id) {
      throw new Error('No APME project loaded.');
    }
    const activity = await apmeApi.getActivity(project.id);
    const latestId = activity[0]?.scan_id;
    if (!latestId) {
      throw new Error('No remediation activity found. Generate fixes first.');
    }
    setRemediationActivityId(latestId);
    return latestId;
  }, [remediationActivityId, project?.id, apmeApi]);

  const handlePushBranch = useCallback(async () => {
    if (!project || !repoUrl) return;
    setRemediationStep('push');
    setPushError(null);
    setPrError(null);
    try {
      const scmToken = await resolveScmToken();
      const activityId = await resolveActivityId();
      const result = await apmeApi.pushRemediationBranch(activityId, {
        scmToken,
      });
      setPrBranchName(result.branch_name);
      setBranchPushed(true);
      setRemediationStep('pr');
    } catch (err) {
      setPushError((err as Error).message);
      setRemediationStep('review');
    }
  }, [project, repoUrl, resolveScmToken, resolveActivityId, apmeApi]);

  const handleCreatePr = useCallback(async () => {
    if (!project || !repoUrl || !prBranchName) return;
    setRemediationStep('pr');
    setCreatingPr(true);
    setPrError(null);
    try {
      const scmToken = await resolveScmToken();
      const activityId = await resolveActivityId();
      const result = await apmeApi.createPullRequest(project.id, activityId, {
        scmToken,
        branchName: prBranchName,
      });
      setPrUrl(result.pr_url);
      setPrBranchName(result.branch_name ?? prBranchName);
      const match = result.pr_url.match(/\/pull\/(\d+)/);
      setPrNumber(match ? parseInt(match[1], 10) : undefined);
      setRemediationStep('verify');
    } catch (err) {
      setPrError((err as Error).message);
      setRemediationStep('pr');
    } finally {
      setCreatingPr(false);
    }
  }, [
    project,
    repoUrl,
    prBranchName,
    resolveScmToken,
    resolveActivityId,
    apmeApi,
  ]);

  const handleGenerateFixes = useCallback(async () => {
    if (!project || selectedFixableIds.size === 0) return;
    setRemediationError(null);
    setTier1Result(null);
    setBranchPushed(false);
    setPushError(null);
    setPrUrl(null);
    setPrBranchName(undefined);
    setProposals([]);
    setApprovedProposalIds(new Set());
    setDeclinedProposalIds(new Set());
    autoApprovedRef.current = new Set();
    generatedViolationIdsRef.current = new Set(selectedFixableIds);
    setRemediationStep('generate');
    setFixProgress({ message: 'Starting fix generation…', progress: 0 });
    try {
      await apmeApi.triggerRemediate(
        project.id,
        Array.from(selectedFixableIds),
      );
    } catch (err) {
      setRemediationError(err as Error);
      setRemediationStep('select');
      setFixProgress(null);
    }
  }, [project, selectedFixableIds, apmeApi]);

  const handleApproveProposal = useCallback(
    async (proposal: Proposal) => {
      if (!project) return;
      setApprovedProposalIds(prev => new Set([...prev, proposal.id]));
      setDeclinedProposalIds(prev => {
        const next = new Set(prev);
        next.delete(proposal.id);
        return next;
      });
      try {
        await apmeApi.approveProposals(project.id, [proposal.id]);
      } catch (err) {
        setRemediationError(err as Error);
      }
    },
    [project, apmeApi],
  );

  const handleDeclineProposal = useCallback((proposalId: string) => {
    setDeclinedProposalIds(prev => new Set([...prev, proposalId]));
    setApprovedProposalIds(prev => {
      const next = new Set(prev);
      next.delete(proposalId);
      return next;
    });
  }, []);

  const handleScan = useCallback(async () => {
    if (!project) return;
    setScanError(null);
    if (projectHasActiveOperation(project)) {
      setExpectActiveScan(true);
      setScanning(true);
      return;
    }
    setScanning(true);
    setExpectActiveScan(true);
    setScanProgress({
      status: 'starting',
      message: `Starting scan for ${project.name}…`,
      progress: 0,
    });
    try {
      await apmeApi.triggerScan(project.id);
    } catch (err) {
      setScanError(err as Error);
      setScanning(false);
      setExpectActiveScan(false);
      setScanProgress(null);
    }
  }, [project, apmeApi]);

  const handleRegister = useCallback(async () => {
    if (!repoUrl) return;
    setRegistering(true);
    setRegisterError(null);
    try {
      const spec = entity.spec as Record<string, unknown> | undefined;
      const branch =
        (spec?.repository_default_branch as string | undefined) || 'main';
      const name = entity.metadata.title || entity.metadata.name;
      const newProject = await apmeApi.createProject({
        name,
        repo_url: repoUrl,
        branch,
      });
      await apmeApi.triggerScan(newProject.id);
      setExpectActiveScan(true);
      setScanning(true);
      retry();
    } catch (err) {
      setRegisterError(err as Error);
    } finally {
      setRegistering(false);
    }
  }, [apmeApi, entity, repoUrl, retry]);

  if (loading)
    return (
      <Content>
        <Progress />
      </Content>
    );
  if (error) {
    const message = (error as Error).message ?? '';
    if (isApmeConnectionError(message)) {
      return (
        <Content>
          <ApmeUnavailable message={APME_GATEWAY_UNAVAILABLE_MESSAGE} />
          <Box display="flex" justifyContent="center" mt={2}>
            <Button
              variant="outlined"
              onClick={retry}
              startIcon={<RefreshIcon />}
            >
              Retry
            </Button>
          </Box>
        </Content>
      );
    }
    return (
      <Content>
        <ResponseErrorPanel error={error} />
      </Content>
    );
  }

  // Unscanned state
  if (!project) {
    return (
      <Content>
        <div className={classes.noData}>
          <Typography variant="h6" gutterBottom>
            No scan results yet
          </Typography>
          <Typography
            variant="body2"
            color="textSecondary"
            style={{ marginBottom: 16 }}
          >
            Run a scan to check this repository for Ansible content quality
            issues.
          </Typography>
          {registerError &&
            (isApmeConnectionError(registerError.message) ? (
              <ApmeUnavailable message={APME_GATEWAY_UNAVAILABLE_MESSAGE} />
            ) : (
              <Typography
                variant="body2"
                color="error"
                style={{ marginBottom: 16 }}
              >
                {registerError.message}
              </Typography>
            ))}
          {repoUrl && (
            <Button
              variant="contained"
              color="primary"
              onClick={handleRegister}
              disabled={registering}
              startIcon={
                registering ? <CircularProgress size={16} /> : <RefreshIcon />
              }
            >
              {registering ? 'Scanning…' : 'Scan'}
            </Button>
          )}
        </div>
      </Content>
    );
  }

  // Compute summary stats from violations
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let autoFix = 0;
  let aiAssisted = 0;
  let manual = 0;
  const catCounts: Record<string, number> = {};

  for (const v of violations) {
    const sev = normalizeSeverity(v.level);
    counts[sev] = (counts[sev] ?? 0) + 1;
    const ft = effectiveFixType(v.remediation_class, enableAi);
    if (ft === 'auto') autoFix++;
    else if (ft === 'ai') aiAssisted++;
    else manual++;
    const cat = getViolationCategory(v);
    catCounts[cat] = (catCounts[cat] ?? 0) + 1;
  }

  const fixableAtScan = project.latest_scan
    ? project.latest_scan.fixable +
      (enableAi ? project.latest_scan.ai_candidate : 0)
    : autoFix + aiAssisted;
  const manualAtScan = project.latest_scan?.manual_review ?? manual;
  const scanTotalViolations = project.latest_scan?.total_violations;
  const violationsTruncated =
    typeof scanTotalViolations === 'number' &&
    violations.length < scanTotalViolations;
  const aiCandidateCount =
    project.latest_scan?.ai_candidate ??
    violations.filter(v => v.remediation_class === 2).length;
  const gatewayAiDisconnected =
    enableAi &&
    aiCandidateCount > 0 &&
    !aiStatusLoading &&
    aiStatus !== undefined &&
    !aiStatus.connected;

  const lastChecked = formatEntityLastChecked(project, scanning, scanError);
  const hasAapIssues = (catCounts.modernize ?? 0) > 0;
  const aapCount = catCounts.modernize ?? 0;

  // Filter violations by active category, severity, and fix type
  const filteredViolations = violations
    .filter(v => !ruleFilter || v.rule_id === ruleFilter)
    .filter(
      v =>
        activeCategory === 'all' || getViolationCategory(v) === activeCategory,
    )
    .filter(
      v =>
        severityFilters.size === 0 ||
        severityFilters.has(normalizeSeverity(v.level)),
    )
    .filter(v => {
      if (fixTypeFilter === 'all') return true;
      const ft = effectiveFixType(v.remediation_class, enableAi);
      if (fixTypeFilter === 'auto') return ft === 'auto';
      if (fixTypeFilter === 'ai') return ft === 'ai';
      if (fixTypeFilter === 'manual') return ft === 'manual';
      return true;
    });

  const hasSeverityFilter = severityFilters.size > 0;

  const toggleSeverity = (sev: SeverityLevel) => {
    setSeverityFilters(prev => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  };

  const violationTotal = violations.length;

  const ruleAutoFixCount = ruleScopedViolations.filter(
    v => effectiveFixType(v.remediation_class, enableAi) === 'auto',
  ).length;
  const ruleAiCount = enableAi
    ? ruleScopedViolations.filter(
        v => effectiveFixType(v.remediation_class, enableAi) === 'ai',
      ).length
    : 0;
  const ruleManualCount = ruleScopedViolations.filter(
    v => effectiveFixType(v.remediation_class, enableAi) === 'manual',
  ).length;

  const selectedAutoCount = [...selectedIds].filter(id =>
    violations.find(
      v =>
        v.id === id &&
        effectiveFixType(v.remediation_class, enableAi) === 'auto',
    ),
  ).length;
  const selectedAiCount = [...selectedIds].filter(id =>
    violations.find(
      v =>
        v.id === id && effectiveFixType(v.remediation_class, enableAi) === 'ai',
    ),
  ).length;

  const devSpacesBaseUrl = configApi.getOptionalString(
    'ansible.devSpaces.baseUrl',
  );
  const devSpacesBranch = prBranchName ?? project?.branch;
  const devSpacesUrl =
    devSpacesBaseUrl && repoUrl
      ? buildDevSpacesUrlFromRepoUrl(
          devSpacesBaseUrl,
          repoUrl,
          devSpacesBranch || undefined,
        )
      : null;
  const showDevSpacesForManual = Boolean(devSpacesUrl && manualAtScan > 0);

  const canPushBranch =
    (visibleProposals.length > 0 &&
      visibleProposals.every(p => {
        const v = violations.find(viol => viol.id === p.violation_id);
        if (!v) {
          return true;
        }
        return (
          !proposalNeedsManualApproval(v.remediation_class, enableAi) ||
          approvedProposalIds.has(p.id)
        );
      })) ||
    Boolean(
      tier1Result &&
      remediationActivityId &&
      (tier1Result.patches.length > 0 || tier1Result.remediatedCount > 0),
    );

  return (
    <Content>
      {/* Summary line */}
      {violations.length > 0 && (
        <Box className={classes.summaryLine}>
          <Typography
            variant="body2"
            style={{ color: '#c9190b', fontWeight: 600 }}
          >
            {violations.length} violation{violations.length !== 1 ? 's' : ''}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            ·
          </Typography>
          {enableAi ? (
            <Typography variant="body2" color="textSecondary">
              {fixableAtScan} auto/AI at scan
            </Typography>
          ) : (
            <>
              <Typography variant="body2" color="textSecondary">
                {autoFix} auto-fix
              </Typography>
              {manual > 0 && (
                <>
                  <Typography variant="body2" color="textSecondary">
                    ·
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    {manual} manual
                  </Typography>
                </>
              )}
            </>
          )}
          {enableAi && manualAtScan > 0 && (
            <>
              <Typography variant="body2" color="textSecondary">
                ·
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {manualAtScan} manual-only
              </Typography>
            </>
          )}
          <Typography variant="body2" color="textSecondary">
            ·
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Last checked {lastChecked}
          </Typography>
          <Typography
            variant="body2"
            style={{ color: '#0066cc', cursor: 'pointer', marginLeft: 8 }}
            onClick={() => {
              const first = filteredViolations[0];
              if (first) {
                document
                  .getElementById('apme-violations-table')
                  ?.scrollIntoView({ behavior: 'smooth' });
              }
            }}
          >
            Fix violations →
          </Typography>
        </Box>
      )}

      {violationsTruncated && typeof scanTotalViolations === 'number' && (
        <Typography
          variant="body2"
          color="textSecondary"
          style={{ marginBottom: 8 }}
        >
          Loaded {violations.length} of {scanTotalViolations} violations from
          latest scan
          {autoFix > 0 ? ' — auto-fix rows sorted first' : ''}.
        </Typography>
      )}

      {gatewayAiDisconnected && (
        <Paper className={classes.infoBanner} elevation={0}>
          <Typography variant="body2">
            Portal AI tier is on ({aiCandidateCount} AI candidates at scan), but
            the APME gateway AI service (Abbenay) is not connected — AI
            proposals will not be generated. <strong>Generate fixes</strong>{' '}
            still applies auto-generated fixes. Connect Abbenay on the gateway
            or check Quality settings → Overview for component health.
          </Typography>
        </Paper>
      )}

      {remediationStep === 'select' &&
        !remediationError &&
        autoFix > 0 &&
        manualAtScan > 0 && (
          <Paper className={classes.infoBanner} elevation={0}>
            <Typography variant="body2">
              {manualAtScan} violation{manualAtScan !== 1 ? 's' : ''} require
              manual fixes in your repo
              {devSpacesBranch ? ` (${devSpacesBranch})` : ''}. Open Dev Spaces
              to edit, or run <strong>Generate fixes</strong> to apply
              auto-generated fixes to the rest.
            </Typography>
          </Paper>
        )}

      {/* AAP compatibility banner */}
      {hasAapIssues && (
        <Paper className={classes.aapBanner} elevation={0} variant="outlined">
          <Box display="flex" alignItems="center" style={{ gap: 8 }}>
            <WarningIcon style={{ color: '#795600', fontSize: 18 }} />
            <Typography variant="body2" style={{ color: '#795600' }}>
              Content found incompatible with AAP 2.7, on last quality scan
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            style={{
              whiteSpace: 'nowrap',
              color: '#795600',
              borderColor: '#c58c00',
            }}
            onClick={() => setActiveCategory('modernize')}
          >
            View {aapCount} violation{aapCount !== 1 ? 's' : ''}
          </Button>
        </Paper>
      )}

      {/* Scan toolbar */}
      <div className={classes.scanToolbar}>
        <div className={classes.scanMeta}>
          <Typography
            variant="body2"
            color="textSecondary"
            style={{ fontSize: 12 }}
          >
            Last quality scan · {lastChecked}
          </Typography>
          <Tooltip title="Scans run automatically on push. Use Scan to trigger a manual check.">
            <HelpOutlineIcon
              style={{ fontSize: 16, color: '#6a6e73', cursor: 'help' }}
            />
          </Tooltip>
        </div>
        <div className={classes.scanActions}>
          <Button
            size="small"
            variant="outlined"
            className={classes.pillScan}
            startIcon={scanning ? <CircularProgress size={14} /> : <ScanIcon />}
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? 'Scanning…' : 'Scan'}
          </Button>
        </div>
      </div>

      {ruleFilter && (
        <Paper className={classes.ruleBanner} elevation={0}>
          <Box
            display="flex"
            alignItems="center"
            style={{ gap: 8, flexWrap: 'wrap' }}
          >
            <Typography variant="body2" style={{ fontSize: 13 }}>
              Showing violations for rule{' '}
              <strong style={{ fontFamily: 'monospace' }}>{ruleFilter}</strong>
              {initialRuleFilter ? ' (from Fleet)' : ''}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {filteredViolations.length} of {violationTotal} violations
              {` · ${ruleAutoFixCount} auto-fix${enableAi && ruleAiCount > 0 ? ` · ${ruleAiCount} AI` : ''}${ruleManualCount > 0 ? ` · ${ruleManualCount} manual` : ''}`}
            </Typography>
          </Box>
          <Box display="flex" style={{ gap: 8 }}>
            <Button
              size="small"
              variant="text"
              startIcon={<CloseIcon style={{ fontSize: 16 }} />}
              onClick={() => setRuleFilter(null)}
            >
              Clear filter
            </Button>
            {filteredViolations.length < violationTotal && (
              <Button
                size="small"
                variant="outlined"
                color="primary"
                onClick={() => setRuleFilter(null)}
              >
                View all {violationTotal} violations →
              </Button>
            )}
          </Box>
        </Paper>
      )}

      {/* Scan progress */}
      {scanning && scanProgress && !scanError && (
        <Paper className={classes.progressBanner} elevation={1}>
          <LinearProgress
            variant={
              scanProgress?.progress !== undefined
                ? 'determinate'
                : 'indeterminate'
            }
            value={scanProgress?.progress}
          />
          <div className={classes.progressText}>
            <Typography variant="caption" color="textSecondary">
              {scanProgress?.message || 'Initializing…'}
            </Typography>
            {scanProgress?.violationsFound !== undefined && (
              <Typography variant="caption">
                {scanProgress.violationsFound} violations found
              </Typography>
            )}
          </div>
        </Paper>
      )}

      {scanError && (
        <Paper
          elevation={0}
          variant="outlined"
          style={{
            backgroundColor: '#fdeaea',
            borderColor: '#f5c2c7',
            padding: 16,
            marginBottom: 16,
          }}
        >
          <Typography
            variant="subtitle2"
            style={{ color: '#c9190b', marginBottom: 4 }}
          >
            Scan failed
          </Typography>
          <Typography variant="body2">
            {isApmeConnectionError(scanError.message)
              ? APME_GATEWAY_UNAVAILABLE_MESSAGE
              : scanError.message}
          </Typography>
        </Paper>
      )}
      {remediationError && (
        <Paper className={classes.remediationErrorBanner} elevation={0}>
          <Typography
            variant="subtitle2"
            style={{ color: '#c9190b', marginBottom: 4 }}
          >
            No automated patches
          </Typography>
          <Typography variant="body2">{remediationError.message}</Typography>
        </Paper>
      )}

      {violations.length > 0 && (
        <QualityWorkflowStepper activeStep={remediationStep} />
      )}

      {fixProgress && (
        <FixProgressBanner
          message={fixProgress.message}
          progress={fixProgress.progress}
        />
      )}

      {remediationStep === 'review' &&
        tier1Result &&
        visibleProposals.length === 0 && (
          <Paper className={classes.reviewPanel} elevation={1}>
            <Typography variant="subtitle2" gutterBottom>
              Auto-generated fixes ready
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              {tier1Result.remediatedCount} finding
              {tier1Result.remediatedCount !== 1 ? 's were' : ' was'}{' '}
              transformed. Push the branch and open in Dev Spaces to review
              changes and commit.
            </Typography>
            {tier1Result.fixedViolations.length > 0 && (
              <Box mb={2}>
                <Typography
                  variant="body2"
                  style={{ fontWeight: 600, marginBottom: 8 }}
                >
                  Findings addressed
                </Typography>
                {tier1Result.fixedViolations.map((fv, idx) => (
                  <Typography
                    key={`${fv.rule_id}-${fv.file}-${fv.line ?? idx}`}
                    variant="body2"
                  >
                    {fv.rule_id} · {fv.file}
                    {typeof fv.line === 'number' ? `:${fv.line}` : ''}
                    {fv.message ? ` — ${fv.message}` : ''}
                  </Typography>
                ))}
              </Box>
            )}
            {tier1Result.patches.length > 0 && (
              <Box>
                <Typography
                  variant="body2"
                  style={{ fontWeight: 600, marginBottom: 8 }}
                >
                  File changes
                </Typography>
                {tier1Result.patches.map(patch => (
                  <Box key={patch.file} mb={2}>
                    <Typography
                      variant="body2"
                      style={{ fontFamily: 'monospace', marginBottom: 4 }}
                    >
                      {patch.file}
                    </Typography>
                    <Box
                      component="pre"
                      style={{
                        fontSize: 12,
                        overflow: 'auto',
                        backgroundColor: '#f5f5f5',
                        padding: 12,
                        borderRadius: 4,
                        margin: 0,
                      }}
                    >
                      {patch.diff}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        )}

      {remediationStep === 'review' && visibleProposals.length > 0 && (
        <Paper className={classes.reviewPanel} elevation={1}>
          <Typography variant="subtitle2" gutterBottom>
            Review proposed fixes
          </Typography>
          {visibleProposals.map(proposal => {
            const violation = violations.find(
              v => v.id === proposal.violation_id,
            );
            const needsReview = violation
              ? proposalNeedsManualApproval(
                  violation.remediation_class,
                  enableAi,
                )
              : false;
            const approved = approvedProposalIds.has(proposal.id);
            return (
              <Box key={proposal.id} mb={2}>
                <Box
                  display="flex"
                  alignItems="center"
                  mb={1}
                  style={{ gap: 8 }}
                >
                  <Chip
                    size="small"
                    label={needsReview ? 'Review' : 'Fixed'}
                    style={{
                      backgroundColor: needsReview ? '#2196f3' : '#4caf50',
                      color: '#fff',
                    }}
                  />
                  <Typography variant="body2">
                    {proposal.rule_id} · {proposal.file}:{proposal.line}
                  </Typography>
                  {proposal.ai_reason && (
                    <Typography variant="caption" color="textSecondary">
                      {proposal.ai_reason}
                    </Typography>
                  )}
                </Box>
                <DiffView
                  before={proposal.original_yaml}
                  after={proposal.fixed_yaml}
                />
                {needsReview && !approved && (
                  <Box className={classes.reviewActions}>
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      onClick={() => handleApproveProposal(proposal)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleDeclineProposal(proposal.id)}
                    >
                      Decline
                    </Button>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() =>
                        navigator.clipboard.writeText(proposal.file)
                      }
                    >
                      Copy file path
                    </Button>
                  </Box>
                )}
                {!needsReview && (
                  <Typography variant="caption" color="textSecondary">
                    Auto-fix applied — included in PR
                  </Typography>
                )}
              </Box>
            );
          })}
        </Paper>
      )}

      {(prUrl || prError || pushError || branchPushed || prMerged) && (
        <PrStatusBanner
          prUrl={prUrl ?? undefined}
          prNumber={prNumber}
          branchName={prBranchName}
          error={prError ?? undefined}
          pushError={pushError ?? undefined}
          branchPushed={branchPushed && !prUrl}
          merged={prMerged}
          devSpacesUrl={devSpacesUrl}
          creatingPr={creatingPr}
          onCreatePr={handleCreatePr}
          onScanAgain={() => {
            setPrMerged(false);
            setPrUrl(null);
            setPrBranchName(undefined);
            setBranchPushed(false);
            setPushError(null);
            setPrError(null);
            setRemediationActivityId(null);
            setTier1Result(null);
            setRemediationStep('select');
            setSelectedIds(new Set());
            setApprovedProposalIds(new Set());
            handleScan();
          }}
        />
      )}

      {remediationStep === 'review' && canPushBranch && !branchPushed && (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="flex-end"
          style={{ gap: 12, marginBottom: 16 }}
        >
          <Typography variant="body2">
            {tier1Result
              ? `${tier1Result.remediatedCount} auto-generated change${tier1Result.remediatedCount !== 1 ? 's' : ''} ready to push`
              : `${visibleProposals.length} fix${visibleProposals.length !== 1 ? 'es' : ''} ready to push`}
          </Typography>
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={handlePushBranch}
          >
            Push branch
          </Button>
        </Box>
      )}

      {/* Category + fix-type filters */}
      {violations.length > 0 && (
        <>
          <div className={classes.filterToolbar}>
            <Typography variant="body2" style={{ fontWeight: 600 }}>
              {filteredViolations.length} violation
              {filteredViolations.length !== 1 ? 's' : ''}
            </Typography>
            <Box display="flex" alignItems="center" style={{ gap: 8 }}>
              {activeCategory !== 'all' && (
                <Chip
                  size="small"
                  label={categoryLabel(activeCategory)}
                  onDelete={() => setActiveCategory('all')}
                  color="primary"
                  variant="outlined"
                />
              )}
              <Button
                size="small"
                variant="outlined"
                startIcon={<FilterListIcon />}
                onClick={e => setCategoryMenuAnchor(e.currentTarget)}
              >
                Category
              </Button>
              {devSpacesUrl && (showDevSpacesForManual || remediationError) && (
                <EditInDevSpacesButton url={devSpacesUrl} />
              )}
              {remediationStep === 'select' && (
                <Tooltip
                  title={generateFixesTooltip(
                    autoFix,
                    devSpacesBranch ?? project.branch,
                    selectedFixableIds.size,
                  )}
                >
                  <span>
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      onClick={handleGenerateFixes}
                      disabled={autoFix === 0 || selectedFixableIds.size === 0}
                    >
                      Generate fixes
                    </Button>
                  </span>
                </Tooltip>
              )}
              <Menu
                anchorEl={categoryMenuAnchor}
                open={Boolean(categoryMenuAnchor)}
                onClose={() => setCategoryMenuAnchor(null)}
              >
                <MenuItem
                  selected={activeCategory === 'all'}
                  onClick={() => {
                    setActiveCategory('all');
                    setCategoryMenuAnchor(null);
                  }}
                >
                  All ({violations.length})
                </MenuItem>
                {CATEGORIES.slice(1).map(cat => {
                  const count = catCounts[cat];
                  return count ? (
                    <MenuItem
                      key={cat}
                      selected={activeCategory === cat}
                      onClick={() => {
                        setActiveCategory(cat);
                        setCategoryMenuAnchor(null);
                      }}
                    >
                      {categoryLabel(cat)} ({count})
                    </MenuItem>
                  ) : null;
                })}
              </Menu>
            </Box>
          </div>

          {violationTotal > 0 && (
            <div className={classes.stackedBar}>
              {SEV_ORDER.map(sev => {
                const count = counts[sev];
                if (count === 0) return null;
                const pct = (count / violationTotal) * 100;
                return (
                  <Box
                    key={sev}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: SEVERITY_STYLES[sev].background,
                      minWidth: count > 0 ? 4 : 0,
                    }}
                    title={`${SEVERITY_STYLES[sev].label}: ${count}`}
                  />
                );
              })}
            </div>
          )}

          <Box className={classes.sevBar}>
            {SEV_ORDER.map(sev => {
              const count = counts[sev];
              if (count === 0) return null;
              const isActive = severityFilters.has(sev);
              const isDimmed = hasSeverityFilter && !isActive;
              const color = SEVERITY_STYLES[sev].background;
              return (
                <Box
                  key={sev}
                  className={`${classes.sevItem} ${isActive ? classes.sevItemActive : ''}`}
                  style={{
                    backgroundColor: isActive ? `${color}12` : undefined,
                    borderColor: isActive ? `${color}60` : undefined,
                    opacity: isDimmed ? 0.45 : 1,
                  }}
                  onClick={() => toggleSeverity(sev)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') toggleSeverity(sev);
                  }}
                >
                  <Box
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      backgroundColor: color,
                    }}
                  />
                  <Typography
                    style={{
                      fontSize: 12,
                      textTransform: 'capitalize',
                      color: isActive ? color : theme.palette.text.secondary,
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {sev}
                  </Typography>
                  <Typography style={{ fontSize: 12, fontWeight: 700, color }}>
                    {count}
                  </Typography>
                </Box>
              );
            })}
            {hasSeverityFilter && (
              <Button
                size="small"
                variant="text"
                style={{ fontSize: 12, textTransform: 'none' }}
                onClick={() => setSeverityFilters(new Set())}
              >
                Clear filters
              </Button>
            )}
          </Box>

          <Box className={classes.fixTypeBar}>
            <FormControl
              variant="outlined"
              size="small"
              className={classes.formControl}
            >
              <InputLabel>Fix type</InputLabel>
              <Select
                value={fixTypeFilter}
                onChange={e => setFixTypeFilter(e.target.value as string)}
                label="Fix type"
              >
                <MenuItem value="all">All fixable</MenuItem>
                {autoFix > 0 && <MenuItem value="auto">Auto-fix only</MenuItem>}
                {enableAi && <MenuItem value="ai">AI-assisted only</MenuItem>}
                <MenuItem value="manual">Manual only</MenuItem>
              </Select>
            </FormControl>
            <Chip
              size="small"
              label="All fixable"
              onClick={() => setFixTypeFilter('all')}
              color={fixTypeFilter === 'all' ? 'primary' : 'default'}
              variant={fixTypeFilter === 'all' ? 'default' : 'outlined'}
            />
            {autoFix > 0 && (
              <Chip
                size="small"
                label="Auto-fix only"
                onClick={() => setFixTypeFilter('auto')}
                color={fixTypeFilter === 'auto' ? 'primary' : 'default'}
                variant={fixTypeFilter === 'auto' ? 'default' : 'outlined'}
              />
            )}
            {enableAi && (
              <Chip
                size="small"
                label="AI-assisted only"
                onClick={() => setFixTypeFilter('ai')}
                color={fixTypeFilter === 'ai' ? 'primary' : 'default'}
                variant={fixTypeFilter === 'ai' ? 'default' : 'outlined'}
              />
            )}
            {autoFix > 0 && (
              <Typography variant="caption" color="textSecondary">
                {autoFix} auto-fix
              </Typography>
            )}
            {enableAi && aiAssisted > 0 && (
              <Typography variant="caption" color="textSecondary">
                {aiAssisted} AI-assisted
              </Typography>
            )}
            {manual > 0 && (
              <Typography variant="caption" color="textSecondary">
                {manual} manual
              </Typography>
            )}
          </Box>
        </>
      )}

      {/* Violations table */}
      {violationsLoading && <Progress />}
      {!violationsLoading && violations.length === 0 && (
        <div className={classes.noData}>
          <Typography variant="body1" color="textSecondary">
            {project.scan_count === 0
              ? 'No scan results yet. Click Scan to analyze this repository.'
              : 'No violations found. This repository is clean.'}
          </Typography>
        </div>
      )}
      {!violationsLoading && violations.length > 0 && (
        <div id="apme-violations-table">
          <ApmeViolationsTable
            key={`violations-${refreshKey}-${activeCategory}-${[...severityFilters].join(',')}-${fixTypeFilter}-${ruleFilter ?? ''}`}
            violations={filteredViolations}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            devSpacesUrl={devSpacesUrl}
            filterContext={{
              totalViolationCount: violationTotal,
              activeFixTypeFilter: fixTypeFilter,
              ruleFilter,
              autoFixCount: ruleFilter ? ruleAutoFixCount : autoFix,
              onClearFixTypeFilter: () => setFixTypeFilter('all'),
              onClearRuleFilter: () => setRuleFilter(null),
            }}
            toolbarActions={
              <>
                {selectedFixableIds.size > 0 &&
                  remediationStep === 'select' && (
                    <Box display="flex" alignItems="center" style={{ gap: 12 }}>
                      <Typography variant="body2" style={{ fontSize: 12 }}>
                        {selectedFixableIds.size} selected for PR scope
                        {selectedAutoCount > 0
                          ? ` · ${selectedAutoCount} auto`
                          : ''}
                        {enableAi && selectedAiCount > 0
                          ? ` · ${selectedAiCount} AI`
                          : ''}
                      </Typography>
                    </Box>
                  )}
              </>
            }
          />
        </div>
      )}
    </Content>
  );
};
