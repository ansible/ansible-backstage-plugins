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
import type {
  Project,
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
  SEVERITY_ORDER,
  FIX_TYPE_STYLES,
  normalizeSeverity,
  isFixableViolation,
  proposalNeedsManualApproval,
  categoryLabel,
  type SeverityLevel,
} from '@ansible/backstage-apme-common/severity';
import {
  isAiRemediationProposal,
  normalizeProposals,
  proposalNeedsUserReview,
  proposalHasVisibleDiff,
  isDeclinedProposal,
  collectAiAssistedViolationIds,
  effectiveViolationFixType,
  violationHadAiAttempt,
} from '@ansible/backstage-apme-common/proposalTier';
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
import { buildRulesById } from '../../utils/gatewayRules';
import { getViolationCategory } from '../../utils/violationAnalytics';
import { ScanHistoryView } from '../ScanHistoryView';
import type { Activity } from '@ansible/backstage-apme-common/types';
import HistoryIcon from '@material-ui/icons/History';
import { useViolationAcknowledge } from '../../hooks/useViolationAcknowledge';
import {
  clearRemediationWorkflowCache,
  extractTier1FromOperationState,
  isRemediationWorkflowCacheValid,
  loadRemediationWorkflowCache,
  restoreRemediationFromOperationState,
  saveRemediationWorkflowCache,
  type Tier1RemediationCache,
} from '../../utils/remediationWorkflowCache';

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
    marginBottom: theme.spacing(2),
    width: '100%',
    maxWidth: 480,
  },
  sevBar: {
    display: 'flex',
    gap: 12,
    marginBottom: theme.spacing(1),
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
    backgroundColor:
      theme.palette.type === 'dark' ? 'rgba(43, 154, 243, 0.08)' : '#e7f1fa',
    border: `1px solid ${
      theme.palette.type === 'dark' ? 'rgba(43, 154, 243, 0.25)' : '#b8daff'
    }`,
    borderRadius: theme.shape.borderRadius,
    flexWrap: 'wrap',
    color: theme.palette.text.primary,
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
    backgroundColor:
      theme.palette.type === 'dark' ? 'rgba(43, 154, 243, 0.08)' : '#e7f1fa',
    border: `1px solid ${
      theme.palette.type === 'dark' ? 'rgba(43, 154, 243, 0.25)' : '#b8daff'
    }`,
    borderRadius: theme.shape.borderRadius,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
    color: theme.palette.text.primary,
  },
  remediationErrorBanner: {
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(2),
    backgroundColor:
      theme.palette.type === 'dark' ? 'rgba(201, 25, 11, 0.12)' : '#fdeaea',
    border: `1px solid ${
      theme.palette.type === 'dark' ? 'rgba(201, 25, 11, 0.35)' : '#f5c2c7'
    }`,
    borderRadius: theme.shape.borderRadius,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
    color: theme.palette.text.primary,
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
  scanning: boolean,
  project: Project,
  scanError: Error | null,
): string {
  if (scanning || projectHasActiveOperation(project)) {
    return 'Scan in progress…';
  }
  if (scanError && !project.last_scanned_at) {
    return 'Scan failed';
  }
  if (project.last_scanned_at) {
    return formatTimeAgo(project.last_scanned_at);
  }
  return 'Never';
}

function generateFixesTooltip(
  autoFix: number,
  selectedFixableCount: number,
  devSpacesBranch: string | undefined,
  projectBranch: string,
): string {
  if (autoFix === 0) {
    const branchLabel = devSpacesBranch ?? projectBranch;
    const suffix = branchLabel ? ` (${branchLabel})` : '';
    return `No auto-generated fixes available for this repo${suffix}. Manual violations require hand-editing in your repository.`;
  }
  if (selectedFixableCount === 0) {
    return 'Select auto-fix violations to generate fixes';
  }
  return `Generate fixes for ${selectedFixableCount} selected violation${selectedFixableCount !== 1 ? 's' : ''}`;
}

interface Tier1RemediationResult extends Tier1RemediationCache {}

function extractTier1RemediationResult(
  state: OperationState | null | undefined,
): Tier1RemediationResult | null {
  return extractTier1FromOperationState(state);
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

const CATEGORIES = [
  'all',
  'lint',
  'modernize',
  'risk',
  'secrets',
  'dependencies',
] as const;
const SEV_ORDER = SEVERITY_ORDER;

export interface ApmeEntityTabProps {
  initialRuleFilter?: string;
  initialCategoryFilter?: string;
}

export const ApmeEntityTab = ({
  initialRuleFilter,
  initialCategoryFilter,
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
  const [activeCategory, setActiveCategory] = useState<string>(
    initialCategoryFilter ?? 'all',
  );
  const [categoryMenuAnchor, setCategoryMenuAnchor] =
    useState<null | HTMLElement>(null);
  const [ruleFilter, setRuleFilter] = useState<string | null>(
    initialRuleFilter ?? null,
  );
  const [severityFilters, setSeverityFilters] = useState<Set<SeverityLevel>>(
    new Set(),
  );
  const [fixTypeFilter, setFixTypeFilter] = useState('all');
  const [reviewProposalFilter, setReviewProposalFilter] = useState<
    'all' | 'auto' | 'ai'
  >('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [remediationStep, setRemediationStep] =
    useState<RemediationStep>('select');
  const [fixProgress, setFixProgress] = useState<{
    message: string;
    progress?: number;
  } | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [activityProposalHints, setActivityProposalHints] = useState<
    Array<Pick<Proposal, 'rule_id' | 'file' | 'line' | 'tier' | 'violation_id'>>
  >([]);
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
  const [scmAuthorized, setScmAuthorized] = useState(false);
  const [remediationActivityId, setRemediationActivityId] = useState<
    string | null
  >(null);
  const [prMerged, setPrMerged] = useState(false);
  const [remediationError, setRemediationError] = useState<Error | null>(null);
  const [tier1Result, setTier1Result] = useState<Tier1RemediationResult | null>(
    null,
  );
  const [showScanHistory, setShowScanHistory] = useState(false);
  const [showAcknowledgedOnly, setShowAcknowledgedOnly] = useState(false);
  const generatedViolationIdsRef = useRef<Set<number>>(new Set());
  const workflowRestoredRef = useRef(false);
  const autoApprovedRef = useRef<Set<string>>(new Set());

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

  const { value: rules = [] } = useAsyncRetry(
    async () => apmeApi.getRules(),
    [apmeApi],
  );

  const { value: scanHistory = [] } = useAsyncRetry(async (): Promise<
    Activity[]
  > => {
    if (!project?.id) return [];
    return apmeApi.getActivity(project.id);
  }, [project?.id, refreshKey, apmeApi]);

  const resetRemediationWorkflow = useCallback(() => {
    if (project?.id) {
      clearRemediationWorkflowCache(project.id);
    }
    setRemediationStep('select');
    setProposals([]);
    setTier1Result(null);
    setRemediationActivityId(null);
    setApprovedProposalIds(new Set());
    setDeclinedProposalIds(new Set());
    setBranchPushed(false);
    setPrBranchName(undefined);
    setPushError(null);
    setPrError(null);
    setPrUrl(null);
    setRemediationError(null);
    autoApprovedRef.current = new Set();
    generatedViolationIdsRef.current = new Set();
  }, [project?.id]);

  const rulesById = useMemo(() => buildRulesById(rules), [rules]);

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

  useEffect(() => {
    if (initialCategoryFilter) {
      setActiveCategory(initialCategoryFilter);
    }
  }, [initialCategoryFilter]);

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

  // Restore an in-progress remediation workflow after navigation away.
  useEffect(() => {
    if (
      !project?.id ||
      workflowRestoredRef.current ||
      remediationStep !== 'select'
    ) {
      return undefined;
    }
    workflowRestoredRef.current = true;
    let cancelled = false;

    const applyRestore = (payload: {
      remediationStep: RemediationStep;
      remediationActivityId: string | null;
      proposals: Proposal[];
      tier1Result: Tier1RemediationResult | null;
      selectedIds?: number[];
      approvedProposalIds?: string[];
      branchPushed?: boolean;
      prBranchName?: string;
    }) => {
      setRemediationStep(payload.remediationStep);
      setRemediationActivityId(payload.remediationActivityId);
      setProposals(normalizeProposals(payload.proposals, violations));
      setTier1Result(payload.tier1Result);
      if (payload.selectedIds?.length) {
        setSelectedIds(new Set(payload.selectedIds));
      }
      if (payload.approvedProposalIds?.length) {
        setApprovedProposalIds(new Set(payload.approvedProposalIds));
      }
      if (payload.branchPushed) {
        setBranchPushed(true);
        setPrBranchName(payload.prBranchName);
      }
      setRemediationError(null);
    };

    void (async () => {
      try {
        const opState = await apmeApi.getOperationState(project.id);
        if (cancelled) return;
        const fromOp = restoreRemediationFromOperationState(opState);
        if (fromOp) {
          applyRestore(fromOp);
          return;
        }
      } catch {
        // No live operation — try session cache.
      }

      const cached = loadRemediationWorkflowCache(project.id);
      if (!cached || !isRemediationWorkflowCacheValid(cached, project)) {
        if (cached) {
          clearRemediationWorkflowCache(project.id);
        }
        return;
      }
      if (cancelled) return;
      applyRestore(cached);
    })();

    return () => {
      cancelled = true;
    };
  }, [project, remediationStep, apmeApi, violations]);

  // Link gateway proposals to scan violations once violations are loaded.
  useEffect(() => {
    if (proposals.length === 0 || violations.length === 0) {
      return;
    }
    const next = normalizeProposals(proposals, violations);
    const unchanged =
      next.length === proposals.length &&
      next.every(
        (p, i) =>
          p.violation_id === proposals[i]?.violation_id &&
          p.tier === proposals[i]?.tier &&
          p.ai_reason === proposals[i]?.ai_reason,
      );
    if (!unchanged) {
      setProposals(next);
    }
  }, [violations, proposals]);

  // Load persisted AI proposal hints from the latest scan for violation badges.
  useEffect(() => {
    const scan = project?.latest_scan;
    if (!scan?.scan_id || !enableAi) {
      setActivityProposalHints([]);
      return undefined;
    }
    if ((scan.ai_proposed ?? 0) === 0 && (scan.ai_declined ?? 0) === 0) {
      setActivityProposalHints([]);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const detail = await apmeApi.getActivityDetail(scan.scan_id);
        if (cancelled) {
          return;
        }
        setActivityProposalHints(
          (detail.proposals ?? []).map(p => ({
            rule_id: p.rule_id,
            file: p.file,
            line: 0,
            tier: p.tier,
            violation_id: 0,
          })),
        );
      } catch {
        if (!cancelled) {
          setActivityProposalHints([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    project?.latest_scan?.scan_id,
    project?.latest_scan?.ai_proposed,
    project?.latest_scan?.ai_declined,
    enableAi,
    apmeApi,
  ]);

  const aiAssistedViolationIds = useMemo(
    () =>
      collectAiAssistedViolationIds(
        violations,
        [...proposals, ...activityProposalHints],
        enableAi,
      ),
    [violations, proposals, activityProposalHints, enableAi],
  );

  const syntheticAiDeclinedProposals = useMemo((): Proposal[] => {
    if (!enableAi) {
      return [];
    }
    const existing = new Set(
      proposals.map(p => `${p.rule_id}:${p.file}:${p.line || 0}`),
    );
    return violations
      .filter(
        v =>
          violationHadAiAttempt(v) &&
          v.remediation_resolution === 11 &&
          !existing.has(`${v.rule_id}:${v.file}:${v.line || 0}`),
      )
      .map(v => ({
        id: `ai-declined-${v.id}`,
        violation_id: v.id,
        rule_id: v.rule_id,
        file: v.file,
        line: v.line,
        original_yaml: v.original_yaml ?? '',
        fixed_yaml: '',
        status: 'declined' as const,
        tier: 2,
        explanation: 'AI could not generate a fix for this violation.',
        ai_reason:
          v.ai_reason?.trim() ||
          'AI could not generate a fix for this violation.',
      }));
  }, [violations, proposals, enableAi]);

  const allProposals = useMemo(
    () => [...proposals, ...syntheticAiDeclinedProposals],
    [proposals, syntheticAiDeclinedProposals],
  );

  const autoFixCount = useMemo(
    () =>
      violations.filter(
        v =>
          effectiveViolationFixType(v, enableAi, aiAssistedViolationIds) ===
          'auto',
      ).length,
    [violations, enableAi, aiAssistedViolationIds],
  );

  useEffect(() => {
    if (autoFixCount === 0 && fixTypeFilter === 'auto') {
      setFixTypeFilter('all');
    }
  }, [autoFixCount, fixTypeFilter]);

  // Persist remediation workflow while the user is on review/push/pr steps.
  useEffect(() => {
    if (!project?.id) {
      return;
    }
    const hasReviewPayload =
      proposals.length > 0 || (tier1Result?.remediatedCount ?? 0) > 0;
    if (
      !['review', 'push', 'pr', 'verify'].includes(remediationStep) ||
      (remediationStep === 'review' && !hasReviewPayload)
    ) {
      return;
    }
    saveRemediationWorkflowCache(project, {
      remediationStep,
      remediationActivityId,
      proposals,
      tier1Result,
      selectedIds: Array.from(selectedIds),
      approvedProposalIds: Array.from(approvedProposalIds),
      branchPushed,
      prBranchName,
    });
  }, [
    project,
    remediationStep,
    remediationActivityId,
    proposals,
    tier1Result,
    selectedIds,
    approvedProposalIds,
    branchPushed,
    prBranchName,
  ]);

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

    let cancelled = false;
    let pollCount = 0;
    const maxPolls = 180;
    const projectId = project.id;

    const pollInterval = setInterval(async () => {
      if (cancelled) return;
      pollCount += 1;
      try {
        const state = await apmeApi.getOperationState(projectId);
        if (cancelled) return;

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
              if (cancelled) return;
              resetRemediationWorkflow();
              retry();
              setRefreshKey(k => k + 1);
              setScanProgress(null);
            }, 1500);
          }
        }
      } catch {
        if (cancelled) return;
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

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [
    scanning,
    project?.id,
    apmeApi,
    retry,
    expectActiveScan,
    resetRemediationWorkflow,
  ]);

  // Poll remediation operation
  useEffect(() => {
    if (remediationStep !== 'generate' || !project?.id) return undefined;
    let cancelled = false;
    let pollCount = 0;
    const maxPolls = 180;
    const projectId = project.id;
    const pollInterval = setInterval(async () => {
      if (cancelled) return;
      pollCount += 1;
      try {
        const state = await apmeApi.getOperationState(projectId);
        if (cancelled) return;
        const progressMessage =
          latestOperationProgressMessage(state) ?? 'Generating fixes…';
        const progressPct = latestOperationProgressPercent(state);
        setFixProgress({
          message: progressMessage,
          progress: progressPct ?? Math.min(10 + pollCount * 1.5, 90),
        });
        if (state?.proposals?.length) {
          setProposals(normalizeProposals(state.proposals, violations));
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
          const nextProposals = normalizeProposals(
            state?.proposals ?? [],
            violations,
          );
          const tier1 = extractTier1RemediationResult(state);
          if (nextProposals.length > 0) {
            setTier1Result(null);
            setProposals(nextProposals);
            setSelectedIds(new Set(nextProposals.map(p => p.violation_id)));
            setRemediationStep('review');
            setRemediationError(null);
            try {
              const activity = await apmeApi.getActivity(projectId);
              if (cancelled) return;
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
              const activity = await apmeApi.getActivity(projectId);
              if (cancelled) return;
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
        if (cancelled) return;
        clearInterval(pollInterval);
        setFixProgress(null);
        setRemediationError(err as Error);
        setRemediationStep('select');
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [remediationStep, project?.id, apmeApi, violations]);

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
    const active = allProposals.filter(p => !declinedProposalIds.has(p.id));
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
  }, [allProposals, selectedFixableIds, declinedProposalIds, remediationStep]);

  const reviewAutoProposalCount = useMemo(
    () =>
      visibleProposals.filter(
        p => !isAiRemediationProposal(p, violations, enableAi),
      ).length,
    [visibleProposals, violations, enableAi],
  );
  const reviewAiProposalCount = useMemo(
    () =>
      visibleProposals.filter(p =>
        isAiRemediationProposal(p, violations, enableAi),
      ).length,
    [visibleProposals, violations, enableAi],
  );

  const reviewProposals = useMemo(() => {
    if (reviewProposalFilter === 'ai') {
      return visibleProposals.filter(p =>
        isAiRemediationProposal(p, violations, enableAi),
      );
    }
    if (reviewProposalFilter === 'auto') {
      return visibleProposals.filter(
        p => !isAiRemediationProposal(p, violations, enableAi),
      );
    }
    return visibleProposals;
  }, [visibleProposals, reviewProposalFilter, violations, enableAi]);

  // Auto-approve deterministic auto-fix proposals when review starts and the
  // gateway operation is still waiting for approval. Restored/completed runs
  // only update local state — calling approve again returns 409.
  useEffect(() => {
    if (
      remediationStep !== 'review' ||
      !project?.id ||
      visibleProposals.length === 0
    ) {
      return;
    }
    const autoIds = visibleProposals
      .filter(p => !proposalNeedsUserReview(p, violations, enableAi))
      .map(p => p.id)
      .filter(id => !autoApprovedRef.current.has(id));
    if (autoIds.length === 0) return;
    autoIds.forEach(id => autoApprovedRef.current.add(id));
    setApprovedProposalIds(prev => new Set([...prev, ...autoIds]));
    void (async () => {
      try {
        const state = await apmeApi.getOperationState(project.id);
        if (state?.status !== 'awaiting_approval') {
          return;
        }
        await apmeApi.approveProposals(project.id, autoIds);
      } catch {
        // Local approval is sufficient once generate has finished.
      }
    })();
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
    const creds = await scmAuthApi.getCredentials({
      url: repoUrl,
      additionalScope: { repoWrite: true },
    });
    const scmToken = creds.token?.trim();
    if (!scmToken) {
      throw new Error(
        'No Git credentials available. Sign in to your Git host and try again.',
      );
    }
    setScmAuthorized(true);
    return scmToken;
  }, [repoUrl, scmAuthApi]);

  // Probe for cached GitHub repo credentials when review starts so we can
  // explain the one-time authorize prompt before the user clicks Publish.
  useEffect(() => {
    if (remediationStep !== 'review' || !repoUrl) {
      return undefined;
    }
    let active = true;
    void scmAuthApi
      .getCredentials({
        url: repoUrl,
        optional: true,
        additionalScope: { repoWrite: true },
      })
      .then(creds => {
        if (active && creds.token?.trim()) {
          setScmAuthorized(true);
        }
      })
      .catch(() => {
        // No cached SCM session yet — user will authorize on first publish.
      });
    return () => {
      active = false;
    };
  }, [remediationStep, repoUrl, scmAuthApi]);

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
      const result = await apmeApi.pushRemediationBranch(
        project.id,
        activityId,
        {
          scmToken,
        },
      );
      setPrBranchName(result.branch_name);
      setBranchPushed(true);
      setRemediationStep('pr');
    } catch (err) {
      setPushError((err as Error).message);
      setRemediationStep('review');
    }
  }, [project, repoUrl, resolveScmToken, resolveActivityId, apmeApi]);

  const handleCreatePr = useCallback(async () => {
    if (!project || !repoUrl) return;
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
      if (!result.pr_url) {
        throw new Error('Gateway submit completed without a PR URL');
      }
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
    if (project.id) {
      clearRemediationWorkflowCache(project.id);
    }
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
        const state = await apmeApi.getOperationState(project.id);
        if (state?.status === 'awaiting_approval') {
          await apmeApi.approveProposals(project.id, [proposal.id]);
        }
      } catch {
        // Local approval is enough when the remediate operation already finished.
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
    if (project.id) {
      clearRemediationWorkflowCache(project.id);
    }
    resetRemediationWorkflow();
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
  }, [project, apmeApi, resetRemediationWorkflow]);

  const handleRegister = useCallback(async () => {
    if (!repoUrl) return;
    setRegistering(true);
    setRegisterError(null);
    try {
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
  }, [apmeApi, entity, repoUrl, branch, retry]);

  const refreshViolations = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const {
    acknowledge: handleAcknowledge,
    unacknowledge: handleUnacknowledge,
    acknowledgingId,
    isAcknowledged,
  } = useViolationAcknowledge(project?.id, refreshViolations, violations);

  const acknowledgedCount = useMemo(
    () => violations.filter(v => isAcknowledged(v)).length,
    [violations, isAcknowledged],
  );

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
  const counts = SEVERITY_ORDER.reduce(
    (acc, sev) => {
      acc[sev] = 0;
      return acc;
    },
    {} as Record<SeverityLevel, number>,
  );
  let autoFix = 0;
  let aiAssisted = 0;
  let manual = 0;
  const catCounts: Record<string, number> = {};

  for (const v of violations) {
    const sev = normalizeSeverity(v.level);
    counts[sev] = (counts[sev] ?? 0) + 1;
    const ft = effectiveViolationFixType(v, enableAi, aiAssistedViolationIds);
    if (ft === 'auto') autoFix++;
    else if (ft === 'ai') aiAssisted++;
    else manual++;
    const cat = getViolationCategory(v, rulesById);
    catCounts[cat] = (catCounts[cat] ?? 0) + 1;
  }

  const fixableAtScan = project.latest_scan
    ? project.latest_scan.fixable +
      (enableAi ? project.latest_scan.ai_candidate : 0)
    : autoFix + aiAssisted;
  const scanTotalViolations = project.latest_scan?.total_violations;
  const violationsTruncated =
    scanTotalViolations !== undefined &&
    scanTotalViolations !== null &&
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

  const lastChecked = formatEntityLastChecked(scanning, project, scanError);

  // Filter violations by active category, severity, and fix type
  const filteredViolations = violations
    .filter(v => !ruleFilter || v.rule_id === ruleFilter)
    .filter(
      v =>
        activeCategory === 'all' ||
        getViolationCategory(v, rulesById) === activeCategory,
    )
    .filter(
      v =>
        severityFilters.size === 0 ||
        severityFilters.has(normalizeSeverity(v.level)),
    )
    .filter(v => {
      if (fixTypeFilter === 'all') return true;
      const ft = effectiveViolationFixType(v, enableAi, aiAssistedViolationIds);
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
    v =>
      effectiveViolationFixType(v, enableAi, aiAssistedViolationIds) === 'auto',
  ).length;
  const ruleAiCount = enableAi
    ? ruleScopedViolations.filter(
        v =>
          effectiveViolationFixType(v, enableAi, aiAssistedViolationIds) ===
          'ai',
      ).length
    : 0;
  const ruleManualCount = ruleScopedViolations.filter(
    v =>
      effectiveViolationFixType(v, enableAi, aiAssistedViolationIds) ===
      'manual',
  ).length;

  const selectedAutoCount = [...selectedIds].filter(id =>
    violations.find(
      v =>
        v.id === id &&
        effectiveViolationFixType(v, enableAi, aiAssistedViolationIds) ===
          'auto',
    ),
  ).length;
  const selectedAiCount = [...selectedIds].filter(id =>
    violations.find(
      v =>
        v.id === id &&
        effectiveViolationFixType(v, enableAi, aiAssistedViolationIds) === 'ai',
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
  const showDevSpacesForManual = Boolean(devSpacesUrl && manual > 0);

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
          <Box
            display="flex"
            alignItems="center"
            style={{ gap: 6, flexWrap: 'wrap' }}
          >
            {autoFix > 0 && (
              <Chip
                size="small"
                label={`${autoFix} auto-fix`}
                clickable
                onClick={() => {
                  setFixTypeFilter('auto');
                  setRemediationStep('select');
                  document
                    .getElementById('apme-violations-table')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }}
                style={{
                  backgroundColor: FIX_TYPE_STYLES.auto.background,
                  color: FIX_TYPE_STYLES.auto.text,
                  fontWeight: 600,
                }}
              />
            )}
            {enableAi && aiAssisted > 0 && (
              <Chip
                size="small"
                label={`${aiAssisted} AI candidate${aiAssisted !== 1 ? 's' : ''}`}
                clickable
                onClick={() => {
                  setFixTypeFilter('ai');
                  setRemediationStep('select');
                  document
                    .getElementById('apme-violations-table')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }}
                style={{
                  backgroundColor: FIX_TYPE_STYLES.ai.background,
                  color: FIX_TYPE_STYLES.ai.text,
                  fontWeight: 600,
                }}
              />
            )}
            {manual > 0 && (
              <Chip
                size="small"
                label={`${manual} manual`}
                clickable
                variant="outlined"
                onClick={() => {
                  setFixTypeFilter('manual');
                  setRemediationStep('select');
                  document
                    .getElementById('apme-violations-table')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            )}
            {autoFix === 0 && aiAssisted === 0 && enableAi && (
              <Typography variant="body2" color="textSecondary">
                {fixableAtScan} fixable at scan
              </Typography>
            )}
            {autoFix === 0 && !enableAi && (
              <Typography variant="body2" color="textSecondary">
                no auto-fix at scan
              </Typography>
            )}
          </Box>
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

      {violationsTruncated &&
        scanTotalViolations !== undefined &&
        scanTotalViolations !== null && (
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
        manual > 0 && (
          <Paper className={classes.infoBanner} elevation={0}>
            <Typography variant="body2">
              {manual} violation{manual !== 1 ? 's' : ''} require manual fixes
              in your repo
              {devSpacesBranch ? ` (${devSpacesBranch})` : ''}. Open Dev Spaces
              to edit, or run <strong>Generate fixes</strong> to apply
              auto-generated fixes to the rest.
            </Typography>
          </Paper>
        )}

      {/* Scan toolbar */}
      {showScanHistory ? (
        <ScanHistoryView
          activity={scanHistory}
          scanning={scanning}
          onBack={() => setShowScanHistory(false)}
          onScan={handleScan}
        />
      ) : (
        <>
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
              {scanHistory.length > 0 && (
                <Button
                  size="small"
                  variant="text"
                  startIcon={<HistoryIcon style={{ fontSize: 16 }} />}
                  onClick={() => setShowScanHistory(true)}
                  style={{ textTransform: 'none', fontSize: 12, marginLeft: 8 }}
                >
                  Scan history ({scanHistory.length})
                </Button>
              )}
            </div>
            <div className={classes.scanActions}>
              <Button
                size="small"
                variant="outlined"
                className={classes.pillScan}
                startIcon={
                  scanning ? <CircularProgress size={14} /> : <ScanIcon />
                }
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
                  <strong style={{ fontFamily: 'monospace' }}>
                    {ruleFilter}
                  </strong>
                  {initialRuleFilter ? ' (from Fleet)' : ''}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {filteredViolations.length} of {violationTotal} violations
                  {ruleFilter
                    ? ` · ${ruleAutoFixCount} auto-fix${enableAi && ruleAiCount > 0 ? ` · ${ruleAiCount} AI` : ''}${ruleManualCount > 0 ? ` · ${ruleManualCount} manual` : ''}`
                    : ''}
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
                backgroundColor:
                  theme.palette.type === 'dark'
                    ? 'rgba(201, 25, 11, 0.12)'
                    : '#fdeaea',
                borderColor:
                  theme.palette.type === 'dark'
                    ? 'rgba(201, 25, 11, 0.35)'
                    : '#f5c2c7',
                padding: 16,
                marginBottom: 16,
                color: theme.palette.text.primary,
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
              <Typography variant="body2">
                {remediationError.message}
              </Typography>
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
                        {fv.line !== undefined && fv.line !== null
                          ? `:${fv.line}`
                          : ''}
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
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                flexWrap="wrap"
                style={{ gap: 8, marginBottom: 8 }}
              >
                <Typography variant="subtitle2">
                  Review proposed fixes
                </Typography>
                <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setRemediationStep('select')}
                  >
                    Back to violations
                  </Button>
                  {reviewAutoProposalCount > 0 && (
                    <Chip
                      size="small"
                      label={`Auto (${reviewAutoProposalCount})`}
                      clickable
                      onClick={() => setReviewProposalFilter('auto')}
                      color={
                        reviewProposalFilter === 'auto' ? 'primary' : 'default'
                      }
                      variant={
                        reviewProposalFilter === 'auto' ? 'default' : 'outlined'
                      }
                    />
                  )}
                  {reviewAiProposalCount > 0 && (
                    <Chip
                      size="small"
                      label={`AI (${reviewAiProposalCount})`}
                      clickable
                      onClick={() => setReviewProposalFilter('ai')}
                      color={
                        reviewProposalFilter === 'ai' ? 'primary' : 'default'
                      }
                      variant={
                        reviewProposalFilter === 'ai' ? 'default' : 'outlined'
                      }
                    />
                  )}
                  {reviewProposalFilter !== 'all' && (
                    <Chip
                      size="small"
                      label="Show all"
                      clickable
                      variant="outlined"
                      onClick={() => setReviewProposalFilter('all')}
                    />
                  )}
                </Box>
              </Box>
              {reviewProposals.length === 0 && (
                <Typography variant="body2" color="textSecondary">
                  No proposals in this filter. Choose another tab above.
                </Typography>
              )}
              {reviewProposals.map(proposal => {
                const needsReview = proposalNeedsUserReview(
                  proposal,
                  violations,
                  enableAi,
                );
                const isAi = isAiRemediationProposal(
                  proposal,
                  violations,
                  enableAi,
                );
                const approved = approvedProposalIds.has(proposal.id);
                return (
                  <Box key={proposal.id} mb={2}>
                    <Box
                      display="flex"
                      alignItems="center"
                      mb={1}
                      style={{ gap: 8, flexWrap: 'wrap' }}
                    >
                      <Chip
                        size="small"
                        label={
                          isAi
                            ? needsReview
                              ? 'AI — review'
                              : 'AI fix'
                            : needsReview
                              ? 'Review'
                              : 'Auto-fix'
                        }
                        style={{
                          backgroundColor: isAi
                            ? FIX_TYPE_STYLES.ai.background
                            : FIX_TYPE_STYLES.auto.background,
                          color: '#fff',
                        }}
                      />
                      <Typography variant="body2">
                        {proposal.rule_id} · {proposal.file}:{proposal.line}
                      </Typography>
                      {proposal.ai_reason && (
                        <Typography
                          variant="caption"
                          color="textSecondary"
                          style={{ flex: '1 1 100%' }}
                        >
                          {proposal.ai_reason}
                        </Typography>
                      )}
                    </Box>
                    {isDeclinedProposal(proposal) &&
                    !proposalHasVisibleDiff(proposal) ? (
                      <Typography
                        variant="body2"
                        color="textSecondary"
                        style={{ fontStyle: 'italic' }}
                      >
                        No automated fix was generated — manual remediation
                        required.
                      </Typography>
                    ) : (
                      <DiffView
                        diff={proposal.diff_hunk}
                        before={proposal.original_yaml}
                        after={proposal.fixed_yaml}
                      />
                    )}
                    {!proposalHasVisibleDiff(proposal) &&
                      !isDeclinedProposal(proposal) && (
                        <Typography
                          variant="body2"
                          color="textSecondary"
                          style={{ fontStyle: 'italic' }}
                        >
                          Change details are not available for this proposal.
                        </Typography>
                      )}
                    {(needsReview || isDeclinedProposal(proposal)) &&
                      !approved && (
                        <Box className={classes.reviewActions}>
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            onClick={() => handleApproveProposal(proposal)}
                          >
                            {isDeclinedProposal(proposal)
                              ? 'Acknowledge'
                              : 'Approve'}
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
              hideCreatePrAction={
                remediationStep === 'pr' && branchPushed && !prUrl
              }
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

          {(remediationStep === 'review' || remediationStep === 'push') &&
            canPushBranch &&
            !branchPushed && (
              <Box style={{ marginBottom: 16 }}>
                {!scmAuthorized && remediationStep === 'review' && (
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    display="block"
                    style={{ marginBottom: 8 }}
                  >
                    Pushing uses your GitHub account. The first time, GitHub
                    will ask you to authorize repository access — this is
                    separate from signing in to the portal.
                  </Typography>
                )}
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="flex-end"
                  style={{ gap: 12 }}
                >
                  <Typography variant="body2" style={{ marginRight: 'auto' }}>
                    {tier1Result
                      ? `${tier1Result.remediatedCount} auto-generated change${tier1Result.remediatedCount !== 1 ? 's' : ''} ready to push`
                      : `${visibleProposals.length} fix${visibleProposals.length !== 1 ? 'es' : ''} ready to push`}
                  </Typography>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    onClick={handlePushBranch}
                    disabled={remediationStep === 'push'}
                  >
                    {remediationStep === 'push' ? 'Pushing…' : 'Push branch'}
                  </Button>
                </Box>
              </Box>
            )}

          {remediationStep === 'pr' && branchPushed && !prUrl && (
            <Box style={{ marginBottom: 16 }}>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="flex-end"
                style={{ gap: 12 }}
              >
                <Typography variant="body2" style={{ marginRight: 'auto' }}>
                  {prBranchName
                    ? `Branch ${prBranchName} pushed — ready to open a pull request`
                    : 'Branch pushed — ready to open a pull request'}
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  onClick={handleCreatePr}
                  disabled={creatingPr}
                >
                  {creatingPr ? 'Creating PR…' : 'Create pull request'}
                </Button>
              </Box>
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
                  {devSpacesUrl &&
                    (showDevSpacesForManual || remediationError) && (
                      <EditInDevSpacesButton url={devSpacesUrl} />
                    )}
                  {remediationStep === 'select' && (
                    <Tooltip
                      title={generateFixesTooltip(
                        autoFix,
                        selectedFixableIds.size,
                        devSpacesBranch,
                        project.branch,
                      )}
                    >
                      <span>
                        <Button
                          size="small"
                          variant="contained"
                          color="primary"
                          onClick={handleGenerateFixes}
                          disabled={
                            autoFix === 0 || selectedFixableIds.size === 0
                          }
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
                        if (e.key === 'Enter' || e.key === ' ')
                          toggleSeverity(sev);
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
                          color: isActive
                            ? color
                            : theme.palette.text.secondary,
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        {sev}
                      </Typography>
                      <Typography
                        style={{ fontSize: 12, fontWeight: 700, color }}
                      >
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
                    {autoFix > 0 && (
                      <MenuItem value="auto">Auto-fix only</MenuItem>
                    )}
                    {enableAi && (
                      <MenuItem value="ai">AI-assisted only</MenuItem>
                    )}
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

          {violations.length > 0 && (
            <Box
              display="flex"
              alignItems="center"
              style={{ gap: 8, marginBottom: 8 }}
            >
              {acknowledgedCount > 0 && (
                <Chip
                  size="small"
                  label={`${acknowledgedCount} acknowledged`}
                  onClick={() => setShowAcknowledgedOnly(prev => !prev)}
                  color={showAcknowledgedOnly ? 'primary' : 'default'}
                  variant={showAcknowledgedOnly ? 'default' : 'outlined'}
                />
              )}
            </Box>
          )}

          {/* Violations table — keep visible while re-fetching after acknowledge */}
          {violationsLoading && violations.length === 0 && <Progress />}
          {violations.length === 0 && !violationsLoading && (
            <div className={classes.noData}>
              <Typography variant="body1" color="textSecondary">
                {project.scan_count === 0
                  ? 'No scan results yet. Click Scan to analyze this repository.'
                  : 'No violations found. This repository is clean.'}
              </Typography>
            </div>
          )}
          {violations.length > 0 && (
            <div id="apme-violations-table">
              <ApmeViolationsTable
                key={`violations-${activeCategory}-${[...severityFilters].join(',')}-${fixTypeFilter}-${ruleFilter ?? ''}-${showAcknowledgedOnly}`}
                violations={filteredViolations}
                aiAssistedViolationIds={aiAssistedViolationIds}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                devSpacesUrl={devSpacesUrl}
                showAcknowledgedOnly={showAcknowledgedOnly}
                onAcknowledge={handleAcknowledge}
                onUnacknowledge={handleUnacknowledge}
                acknowledgingId={acknowledgingId}
                isAcknowledged={isAcknowledged}
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
                        <Box
                          display="flex"
                          alignItems="center"
                          style={{ gap: 12 }}
                        >
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
        </>
      )}
    </Content>
  );
};
