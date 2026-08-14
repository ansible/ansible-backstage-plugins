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

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
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
  apmeRemediationErrorTitle,
  formatApmeUserFacingError,
  isApmeConnectionError,
  parseExistingPrFromError,
} from '../../utils/apmeConnectionError';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Link,
  MenuItem,
  Paper,
  Select,
  Switch,
  Tooltip,
  Typography,
  makeStyles,
  useTheme,
} from '@material-ui/core';
import ScanIcon from '@material-ui/icons/PlayCircleOutline';
import RefreshIcon from '@material-ui/icons/Refresh';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import CloseIcon from '@material-ui/icons/Close';
import type { Proposal } from '@ansible/backstage-apme-common/types';
import {
  formatOperationError,
  isTerminalOperationState,
  latestOperationProgressMessage,
  latestOperationProgressPercent,
  projectHasActiveOperation,
} from '@ansible/backstage-apme-common/operationStatus';
import {
  SEVERITY_STYLES,
  SEVERITY_ORDER,
  normalizeSeverity,
  categoryLabel,
  type SeverityLevel,
} from '@ansible/backstage-apme-common/severity';
import { useApmeColorTokens } from '../../hooks/useApmeColorTokens';
import {
  normalizeProposals,
  collectAiAssistedViolationIds,
  effectiveViolationFixType,
  violationHadAiAttempt,
} from '@ansible/backstage-apme-common/proposalTier';
import {
  normalizeRepoUrlFromEntity,
  defaultBranchFromEntity,
} from '@ansible/backstage-rhaap-common/catalogEntity';
import {
  buildDevSpacesUrlFromRepoUrl,
} from '@ansible/backstage-rhaap-common/devSpaces';
import { buildGithubCompareUrl } from '../../utils/githubCompareUrl';
import { apmeApiRef } from '../../api';
import { ensureRepoBranchForScan } from '../../utils/ensureRepoBranchForScan';
import {
  registerOrResolveApmeProject,
  resolveApmeProject,
} from '../../utils/registerOrResolveApmeProject';
import { useApmeAiEnabled, useApmeAiStatus } from '../../hooks/useApmeEnabled';
import { useApmeScanTargetLabel } from '../../hooks/useApmeScanTargetLabel';
import { ApmeViolationsTable } from '../ApmeViolationsTable';
import type { ViolationReviewDiff } from '../ApmeViolationsTable';
import { QualityWorkflowStepper } from '../QualityWorkflowStepper';
import { RemediationReviewDialog } from '../RemediationReviewWorkspace';
import { PreviewNotice } from '../PreviewChip';
import type { RemediationStep } from '../RemediationStepper';
import { FixProgressBanner } from '../FixProgressBanner';
import { PrStatusBanner } from '../PrStatusBanner';
import type { BranchFileChange } from '../BranchFileChangesPanel';
import { buildRulesById } from '../../utils/gatewayRules';
import { getViolationCategory } from '../../utils/violationAnalytics';
import { ScanHistoryView } from '../ScanHistoryView';
import type { Activity } from '@ansible/backstage-apme-common/types';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useViolationAcknowledge } from '../../hooks/useViolationAcknowledge';
import { usePostScanRefresh } from '../../hooks/usePostScanRefresh';
import { useApmeScanLifecycle } from '../../hooks/useApmeScanLifecycle';
import {
  applyGeneratedBulkSet,
  useRemediationGeneratePoll,
  violationIdsFromProposals,
  violationIdsFromTier1,
} from '../../hooks/useRemediationGeneratePoll';
import { mustRemediateBeforePush } from '../../utils/mustRemediateBeforePush';
import { collectBulkFixableViolationIds } from '../../utils/bulkFixableViolations';
import { buildReviewFileChanges } from '../../utils/buildReviewFileChanges';
import {
  clearRemediationWorkflowCache,
  extractTier1FromOperationState,
  isRemediationWorkflowCacheValid,
  loadRemediationWorkflowCache,
  restoreRemediationFromOperationState,
  saveRemediationWorkflowCache,
  type Tier1RemediationCache,
} from '../../utils/remediationWorkflowCache';
import { fetchAllProjectViolations } from '../../utils/fetchAllProjectViolations';
import {
  formatScmAuthFailureMessage,
  isScmTokenRequiredError,
  resolveScmTokenForRemediation,
} from '../../utils/resolveScmTokenForRemediation';

const useStyles = makeStyles(theme => ({
  scanStatusRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(1.5),
    flexWrap: 'wrap',
  },
  scanStatusLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
    minWidth: 0,
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
  scanMetaBelow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
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
  actionBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(1.5),
    flexWrap: 'wrap',
  },
  actionBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  violationSummary: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    marginBottom: theme.spacing(1),
    fontSize: 13,
  },
  summarySep: {
    color: theme.palette.text.disabled,
    margin: '0 2px',
  },
  severityBar: {
    display: 'flex',
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: theme.spacing(2),
    backgroundColor:
      theme.palette.type === 'dark'
        ? theme.palette.grey[800]
        : theme.palette.grey[200],
  },
  severityBarSegment: {
    height: '100%',
    minWidth: 0,
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
  filterSelect: {
    minWidth: 152,
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
  emptyMessage: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(2),
    textAlign: 'center',
  },
  historyContent: {
    width: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    boxSizing: 'border-box',
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
  remediationErrorBody: {
    flex: 1,
    minWidth: 0,
  },
  remediationErrorDismiss: {
    color: theme.palette.text.secondary,
    padding: 4,
    marginTop: -4,
    marginRight: -8,
  },
  dot: { color: theme.palette.text.disabled, margin: '0 4px' },
}));

function generateFixesTooltip(bulkCount: number): string {
  if (bulkCount === 0) {
    return 'No automated fixes are available for this scan. Manual findings require editing in your repo or Dev Spaces.';
  }
  return 'Generate fixes for all eligible autofix findings in one batch. Push a remediation branch when ready; edit further in Dev Spaces after push.';
}

function pushBranchReviewTooltip(): string {
  return 'Push all prepared fixes to a remediation branch. Create a pull request when you are ready. Edit further in Dev Spaces after push.';
}

function fixMethodFilterLabel(value: string): string {
  switch (value) {
    case 'auto':
      return 'Auto-fix only';
    case 'ai':
      return 'AI-assisted only';
    case 'manual':
      return 'Manual only';
    default:
      return 'All fixable';
  }
}

/** Relative age for “Last quality scan · …” (e.g. 1 hour ago). */
function formatScanAge(iso?: string | null): string {
  if (!iso) {
    return 'never';
  }
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return 'never';
  }
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

const CATEGORIES = [
  'all',
  'lint',
  'modernize',
  'risk',
  'secrets',
  'dependencies',
] as const;

export interface ApmeEntityTabProps {
  initialRuleFilter?: string;
  initialCategoryFilter?: string;
  /** When set without a repo URL on the entity, load project by id first. */
  initialProjectId?: string;
}

function generateFixesButtonLabel(
  creatingPr: boolean,
  bulkCount: number,
): string {
  if (creatingPr) {
    return 'Generating fixes…';
  }
  if (bulkCount > 0) {
    return `Generate fixes (${bulkCount})`;
  }
  return 'Generate fixes';
}

export const ApmeEntityTab = ({
  initialRuleFilter,
  initialCategoryFilter,
  initialProjectId,
}: ApmeEntityTabProps = {}) => {
  const classes = useStyles();
  const theme = useTheme();
  const colorTokens = useApmeColorTokens();
  const apmeApi = useApi(apmeApiRef);
  const scmAuthApi = useApi(scmAuthApiRef);
  const configApi = useApi(configApiRef);
  const enableAi = useApmeAiEnabled();
  const { status: aiStatus, loading: aiStatusLoading } = useApmeAiStatus();
  const { entity } = useEntity();

  const [scanning, setScanning] = useState(false);
  const [expectActiveScan, setExpectActiveScan] = useState(false);
  /** Operation id from the in-flight Scan; ignore stale terminal ops from prior runs. */
  const [trackedScanOperationId, setTrackedScanOperationId] = useState<
    string | null
  >(null);
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
  const [ruleFilter, setRuleFilter] = useState<string | null>(
    initialRuleFilter ?? null,
  );
  const [severityFilters, setSeverityFilters] = useState<Set<SeverityLevel>>(
    new Set(),
  );
  const [fixTypeFilter, setFixTypeFilter] = useState('all');
  const [includeAiInBulk, setIncludeAiInBulk] = useState(false);
  /** Review & edit: prepared file content overrides keyed by file path. */
  const [selectedReviewFile, setSelectedReviewFile] = useState<string | null>(
    null,
  );
  const [generatedViolationIds, setGeneratedViolationIds] = useState<Set<number>>(
    new Set(),
  );
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
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
  const [remediationActivityId, setRemediationActivityId] = useState<
    string | null
  >(null);
  const [prMerged, setPrMerged] = useState(false);
  const [remediationError, setRemediationError] = useState<Error | null>(null);

  // Connection-error banners stay until retry/dismiss; clear once gateway is healthy again.
  useEffect(() => {
    if (!remediationError || !isApmeConnectionError(remediationError.message)) {
      return undefined;
    }
    let cancelled = false;
    const clearIfHealthy = async () => {
      try {
        await apmeApi.getHealth();
        if (!cancelled) {
          setRemediationError(null);
        }
      } catch {
        // Still unreachable — keep banner.
      }
    };
    void clearIfHealthy();
    const timer = setInterval(() => void clearIfHealthy(), 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [remediationError, apmeApi]);
  const [tier1Result, setTier1Result] = useState<Tier1RemediationCache | null>(
    null,
  );
  const [showScanHistory, setShowScanHistory] = useState(false);
  const [showAcknowledgedOnly, setShowAcknowledgedOnly] = useState(false);
  /** Project id from Register/scan before catalog lookup catches up. */
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(
    initialProjectId ?? null,
  );
  const generatedViolationIdsRef = useRef<Set<number>>(new Set());
  const workflowRestoredRef = useRef(false);
  const pendingScanFromUrlRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const repoUrl = normalizeRepoUrlFromEntity(entity);
  const branch = defaultBranchFromEntity(entity);

  const {
    value: project,
    loading,
    error,
    retry,
  } = useAsyncRetry(async () => {
    if (pendingProjectId) {
      try {
        return await apmeApi.getProject(pendingProjectId);
      } catch {
        // Fall through when repo URL resolution is also possible.
      }
    }
    if (!repoUrl) return null;
    const entityName = entity.metadata.title || entity.metadata.name;
    return resolveApmeProject(apmeApi, repoUrl, branch, entityName);
  }, [
    repoUrl,
    branch,
    apmeApi,
    pendingProjectId,
    entity.metadata.title,
    entity.metadata.name,
  ]);

  // Clear pending id once lookup returns the registered project.
  useEffect(() => {
    if (project?.id && pendingProjectId && project.id === pendingProjectId) {
      setPendingProjectId(null);
    }
  }, [project?.id, pendingProjectId]);

  const activeProjectId = project?.id ?? pendingProjectId;
  const effectiveRepoUrl = repoUrl ?? project?.repo_url ?? null;

  const schedulePostScanRefresh = usePostScanRefresh(retry, setRefreshKey);

  const { value: violations = [], loading: violationsLoading } =
    useAsyncRetry(async () => {
      if (!project?.id) return [];
      return fetchAllProjectViolations(
        apmeApi,
        project.id,
        project.latest_scan?.total_violations ?? project.total_violations,
      );
    }, [
      project?.id,
      refreshKey,
      apmeApi,
      project?.latest_scan?.total_violations,
      project?.total_violations,
    ]);

  const violationsRef = useRef(violations);
  useEffect(() => {
    violationsRef.current = violations;
  }, [violations]);

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

  const scanTarget = useApmeScanTargetLabel();

  const resetRemediationWorkflow = useCallback(() => {
    if (project?.id) {
      clearRemediationWorkflowCache(project.id);
    }
    setRemediationStep('select');
    setProposals([]);
    setTier1Result(null);
    setGeneratedViolationIds(new Set());
    setIncludeAiInBulk(false);
    setSelectedReviewFile(null);
    setReviewDialogOpen(false);
    setRemediationActivityId(null);
    setApprovedProposalIds(new Set());
    setDeclinedProposalIds(new Set());
    setBranchPushed(false);
    setPrBranchName(undefined);
    setPushError(null);
    setPrError(null);
    setPrUrl(null);
    setRemediationError(null);
    generatedViolationIdsRef.current = new Set();
  }, [project?.id]);

  const handleScanComplete = useCallback(() => {
    resetRemediationWorkflow();
    schedulePostScanRefresh();
  }, [resetRemediationWorkflow, schedulePostScanRefresh]);

  useApmeScanLifecycle({
    projectId: activeProjectId,
    project,
    apmeApi,
    scanning,
    setScanning,
    expectActiveScan,
    setExpectActiveScan,
    trackedScanOperationId,
    setTrackedScanOperationId,
    scanProgress,
    setScanProgress,
    scanError,
    setScanError,
    registering,
    scanProgressStatus: scanProgress?.status,
    onScanComplete: handleScanComplete,
  });

  useRemediationGeneratePoll({
    remediationStep,
    creatingPr,
    projectId: project?.id,
    apmeApi,
    violationsRef,
    setFixProgress,
    setProposals,
    setTier1Result,
    setGeneratedViolationIds,
    generatedViolationIdsRef,
    setRemediationStep,
    setRemediationError,
    setRemediationActivityId,
  });

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
      tier1Result: Tier1RemediationCache | null;
      approvedProposalIds?: string[];
      includeAiInBulk?: boolean;
      branchPushed?: boolean;
      prBranchName?: string;
    }) => {
      setRemediationStep(
        payload.remediationStep === 'select' &&
          (payload.tier1Result || payload.proposals.length > 0)
          ? 'review'
          : payload.remediationStep,
      );
      setRemediationActivityId(payload.remediationActivityId);
      setProposals(normalizeProposals(payload.proposals, violations));
      setTier1Result(payload.tier1Result);
      if (
        payload.remediationStep === 'review' ||
        payload.remediationStep === 'select'
      ) {
        let generatedIds = new Set<number>();
        if (payload.proposals.length > 0) {
          generatedIds = violationIdsFromProposals(
            normalizeProposals(payload.proposals, violations),
          );
        } else if (payload.tier1Result) {
          generatedIds = violationIdsFromTier1(
            payload.tier1Result,
            violations,
            generatedViolationIdsRef.current,
          );
        }
        if (generatedIds.size > 0) {
          generatedViolationIdsRef.current = generatedIds;
          setGeneratedViolationIds(generatedIds);
        }
      }
      if (payload.approvedProposalIds?.length) {
        setApprovedProposalIds(new Set(payload.approvedProposalIds));
      }
      if (payload.includeAiInBulk !== undefined) {
        setIncludeAiInBulk(payload.includeAiInBulk);
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
  const latestScan = project?.latest_scan;
  useEffect(() => {
    const scan = latestScan;
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
  }, [latestScan, enableAi, apmeApi]);

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

  // Persist remediation workflow while fixes are ready or a PR is in flight.
  useEffect(() => {
    if (!project?.id) {
      return;
    }
    const hasRemediationPayload =
      proposals.length > 0 || (tier1Result?.remediatedCount ?? 0) > 0;
    if (
      !['select', 'review', 'push', 'pr', 'verify'].includes(remediationStep) ||
      (remediationStep === 'select' && !hasRemediationPayload) ||
      (remediationStep === 'review' && !hasRemediationPayload)
    ) {
      return;
    }
    saveRemediationWorkflowCache(project, {
      remediationStep,
      remediationActivityId,
      proposals,
      tier1Result,
      includeAiInBulk,
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
    includeAiInBulk,
    approvedProposalIds,
    branchPushed,
    prBranchName,
  ]);

  const visibleProposals = useMemo(() => {
    const active = allProposals.filter(p => !declinedProposalIds.has(p.id));
    return active;
  }, [allProposals, declinedProposalIds]);

  const bulkFixableIds = useMemo(
    () =>
      collectBulkFixableViolationIds(
        violations,
        enableAi,
        includeAiInBulk,
        aiAssistedViolationIds,
      ),
    [violations, enableAi, includeAiInBulk, aiAssistedViolationIds],
  );

  const bulkAiFixableCount = useMemo(
    () =>
      enableAi
        ? violations.filter(
            v =>
              effectiveViolationFixType(v, enableAi, aiAssistedViolationIds) ===
              'ai',
          ).length
        : 0,
    [violations, enableAi, aiAssistedViolationIds],
  );

  const reviewDiffs = useMemo(() => {
    const map = new Map<number, ViolationReviewDiff>();
    // Prefer remedia proposals/tier-1 when present; otherwise scan-time previews show in the table.
    for (const proposal of visibleProposals) {
      if (proposal.violation_id > 0) {
        map.set(proposal.violation_id, {
          before: proposal.original_yaml,
          after: proposal.fixed_yaml,
          diff: proposal.diff_hunk,
          explanation: proposal.ai_reason || proposal.explanation,
        });
      }
    }
    if (tier1Result) {
      for (const fv of tier1Result.fixedViolations) {
        const violation = violations.find(
          v =>
            v.rule_id === fv.rule_id &&
            v.file === fv.file &&
            (fv.line === null || fv.line === undefined || v.line === fv.line),
        );
        if (violation && !map.has(violation.id)) {
          const patch = tier1Result.patches.find(p => p.file === fv.file);
          map.set(violation.id, {
            before: violation.original_yaml,
            after: violation.fixed_yaml,
            diff: patch?.diff,
          });
        }
      }
    }
    return map;
  }, [visibleProposals, tier1Result, violations]);

  /** Per-file prepared fixes for review (fix-generated files only). */
  const branchFileChanges = useMemo(
    (): BranchFileChange[] =>
      buildReviewFileChanges(
        visibleProposals,
        tier1Result,
        violations,
        generatedViolationIds,
      ),
    [visibleProposals, tier1Result, violations, generatedViolationIds],
  );

  const reviewFindingCount = useMemo(() => {
    if (reviewDiffs.size > 0) {
      return reviewDiffs.size;
    }
    if (generatedViolationIds.size > 0) {
      return generatedViolationIds.size;
    }
    return branchFileChanges.length;
  }, [reviewDiffs.size, generatedViolationIds.size, branchFileChanges.length]);

  useEffect(() => {
    if (remediationStep !== 'review' || branchFileChanges.length === 0) {
      return;
    }
    setSelectedReviewFile(prev => {
      if (prev && branchFileChanges.some(c => c.file === prev)) {
        return prev;
      }
      return branchFileChanges[0]?.file ?? null;
    });
  }, [remediationStep, branchFileChanges]);

  const handleJumpToReviewFile = useCallback((filePath: string) => {
    setSelectedReviewFile(filePath);
    setReviewDialogOpen(true);
  }, []);

  const resolveScmToken = useCallback(
    async (mode: 'optional' | 'interactive' = 'optional') => {
      if (!effectiveRepoUrl) {
        throw new Error('No repository URL on this catalog entity.');
      }
      return resolveScmTokenForRemediation(scmAuthApi, effectiveRepoUrl, mode);
    },
    [effectiveRepoUrl, scmAuthApi],
  );

  // Surface OAuth redirect failures (e.g. Failed to obtain access token).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    if (!oauthError) {
      return;
    }
    setPushError(formatScmAuthFailureMessage(new Error(oauthError)));
    params.delete('error');
    const next = `${window.location.pathname}${
      params.toString() ? `?${params}` : ''
    }${window.location.hash}`;
    window.history.replaceState({}, '', next);
  }, []);

  const resolveActivityId = useCallback(async () => {
    if (remediationActivityId) return remediationActivityId;
    if (!project?.id) {
      throw new Error('No APME project loaded.');
    }
    const activity = await apmeApi.getActivity(project.id);
    const remedia =
      activity.find(a => a.scan_type === 'remediate') ?? activity[0];
    const latestId = remedia?.scan_id;
    if (!latestId) {
      throw new Error(
        'No remediation activity found. Push a branch again to prepare fixes.',
      );
    }
    setRemediationActivityId(latestId);
    return latestId;
  }, [remediationActivityId, project?.id, apmeApi]);

  const handlePrepareFixes = useCallback(async () => {
    if (!project || !effectiveRepoUrl) return;
    const targetIds = bulkFixableIds;
    if (targetIds.size === 0) return;

    setCreatingPr(true);
    setPushError(null);
    setPrError(null);
    setRemediationError(null);

    try {
      const needsFreshRemediation = mustRemediateBeforePush({
        targetIds,
        generatedIds: generatedViolationIdsRef.current,
        activityId: remediationActivityId,
      });

      if (
        !needsFreshRemediation &&
        (tier1Result || proposals.length > 0) &&
        remediationActivityId
      ) {
        setRemediationStep('review');
        return;
      }

      clearRemediationWorkflowCache(project.id);
      setTier1Result(null);
      setProposals([]);
      setApprovedProposalIds(new Set());
      setSelectedReviewFile(null);
      setDeclinedProposalIds(new Set());
      setRemediationActivityId(null);
      generatedViolationIdsRef.current = new Set(targetIds);
      setGeneratedViolationIds(new Set(targetIds));
      setRemediationStep('generate');
      const bulkLabel =
        targetIds.size === 1
          ? '1 eligible finding'
          : `${targetIds.size} eligible findings`;
      setFixProgress({
        message: `Generating fixes for ${bulkLabel}…`,
        progress: 5,
      });

      await apmeApi.triggerRemediate(project.id, Array.from(targetIds));

      let state = null;
      for (let pollCount = 1; pollCount <= 180; pollCount += 1) {
        await sleep(2000);
        state = await apmeApi.getOperationState(project.id);
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
        if (isTerminalOperationState(state, pollCount, 2, true)) {
          break;
        }
        if (pollCount >= 180) {
          throw new Error('Fix generation timed out. Try again in a moment.');
        }
      }

      if (state?.status === 'failed') {
        throw new Error(formatOperationError(state.error));
      }

      const nextProposals = normalizeProposals(
        state?.proposals ?? [],
        violations,
      );
      const nextTier1 = extractTier1FromOperationState(state);
      if (nextProposals.length > 0) {
        setTier1Result(null);
        setProposals(nextProposals);
        applyGeneratedBulkSet(
          violationIdsFromProposals(nextProposals),
          setGeneratedViolationIds,
          generatedViolationIdsRef,
        );
      } else if (nextTier1) {
        setProposals([]);
        setTier1Result(nextTier1);
        applyGeneratedBulkSet(
          violationIdsFromTier1(nextTier1, violations, targetIds),
          setGeneratedViolationIds,
          generatedViolationIdsRef,
        );
      } else {
        throw new Error(
          'No automated patches were produced for this run. Manual-only findings require hand-editing in your repo or Dev Spaces.',
        );
      }

      const activity = await apmeApi.getActivity(project.id);
      const activityId =
        state?.scan_id ??
        activity.find(a => a.scan_type === 'remediate')?.scan_id ??
        null;
      if (!activityId) {
        throw new Error('No remediation activity found after preparing fixes.');
      }
      setRemediationActivityId(activityId);
      setRemediationStep('review');
      setRemediationError(null);
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      setRemediationError(
        err instanceof Error ? err : new Error(errMessage),
      );
      setRemediationStep('select');
    } finally {
      setCreatingPr(false);
      setFixProgress(null);
    }
  }, [
    project,
    effectiveRepoUrl,
    bulkFixableIds,
    tier1Result,
    proposals.length,
    remediationActivityId,
    violations,
    apmeApi,
  ]);

  const handlePushBranch = useCallback(async () => {
    if (!project || !effectiveRepoUrl) return;
    if (!tier1Result && proposals.length === 0) return;

    setCreatingPr(true);
    setPushError(null);
    setPrError(null);
    setRemediationError(null);

    try {
      setRemediationStep('push');
      setFixProgress({ message: 'Pushing remediation branch…', progress: 45 });

      const allProposalIds = visibleProposals.map(p => p.id);
      if (allProposalIds.length > 0) {
        const state = await apmeApi.getOperationState(project.id);
        if (state?.status === 'awaiting_approval') {
          await apmeApi.approveProposals(project.id, allProposalIds);
        } else {
          try {
            await apmeApi.approveProposals(project.id, allProposalIds);
          } catch {
            // Completed runs may already be approved server-side.
          }
        }
        setApprovedProposalIds(new Set(allProposalIds));
      }

      const scmToken = await resolveScmToken('optional');
      const resolvedActivityId = await resolveActivityId();
      const pushResult = await apmeApi.pushRemediationBranch(
        project.id,
        resolvedActivityId,
        scmToken ? { scmToken } : undefined,
      );
      setPrBranchName(pushResult.branch_name);
      setBranchPushed(true);
      setSelectedReviewFile(null);
      setRemediationStep('push');
    } catch (err) {
      const existingPr = parseExistingPrFromError(
        err instanceof Error ? err.message : String(err),
      );
      if (existingPr) {
        setRemediationError(null);
        setPushError(null);
        setPrError(null);
        setPrUrl(existingPr.url);
        setPrNumber(existingPr.prNumber);
        setBranchPushed(true);
        setRemediationStep('verify');
      } else {
        const scmRequired = isScmTokenRequiredError(err);
        if (scmRequired) {
          setPushError(formatScmAuthFailureMessage(err));
          setRemediationStep('review');
        } else {
          setRemediationError(
            err instanceof Error ? err : new Error(String(err)),
          );
          setPushError(null);
          setRemediationStep('review');
        }
      }
    } finally {
      setCreatingPr(false);
      setFixProgress(null);
    }
  }, [
    project,
    effectiveRepoUrl,
    tier1Result,
    proposals.length,
    visibleProposals,
    resolveScmToken,
    resolveActivityId,
    apmeApi,
  ]);

  const handleCreatePullRequest = useCallback(async () => {
    if (!project || !effectiveRepoUrl) return;

    setCreatingPr(true);
    setPrError(null);
    setPushError(null);

    try {
      setRemediationStep('pr');
      setFixProgress({ message: 'Creating pull request…', progress: 75 });

      const scmToken = await resolveScmToken('optional');
      const resolvedActivityId = await resolveActivityId();
      const prResult = await apmeApi.createPullRequest(
        project.id,
        resolvedActivityId,
        {
          ...(scmToken ? { scmToken } : {}),
          ...(prBranchName ? { branchName: prBranchName } : {}),
        },
      );
      if (!prResult.pr_url) {
        throw new Error('Gateway submit completed without a PR URL');
      }
      setPrUrl(prResult.pr_url);
      setPrBranchName(prResult.branch_name ?? prBranchName);
      const match = prResult.pr_url.match(/\/pull\/(\d+)/);
      setPrNumber(match ? parseInt(match[1], 10) : undefined);
      setRemediationStep('verify');
    } catch (err) {
      const existingPr = parseExistingPrFromError(
        err instanceof Error ? err.message : String(err),
      );
      if (existingPr) {
        setPrError(null);
        setPushError(null);
        setRemediationError(null);
        setPrUrl(existingPr.url);
        setPrNumber(existingPr.prNumber);
        setBranchPushed(true);
        setRemediationStep('verify');
      } else {
        setPrError(formatScmAuthFailureMessage(err));
        setRemediationStep(branchPushed ? 'push' : 'select');
      }
    } finally {
      setCreatingPr(false);
      setFixProgress(null);
    }
  }, [
    project,
    effectiveRepoUrl,
    resolveScmToken,
    resolveActivityId,
    apmeApi,
    prBranchName,
    branchPushed,
  ]);

  const handleScan = useCallback(() => {
    if (!project?.id) {
      return;
    }
    clearRemediationWorkflowCache(project.id);
    resetRemediationWorkflow();
    setScanError(null);
    setTrackedScanOperationId(null);
    if (projectHasActiveOperation(project)) {
      setExpectActiveScan(true);
      setScanning(true);
      setScanProgress({
        status: 'running',
        message: 'Scan in progress…',
      });
      return;
    }
    // Do not set scanning until triggerScan returns — avoids treating a prior
    // completed operation as the new scan finishing instantly.
    setScanProgress({
      status: 'starting',
      message: `Starting scan for ${project.name}…`,
      progress: 0,
    });
    void (async () => {
      try {
        await ensureRepoBranchForScan(
          apmeApi,
          project.repo_url,
          project.branch,
        );
        const scanResult = await apmeApi.triggerScan(project.id, {
          ansibleVersion: scanTarget.effective,
        });
        setTrackedScanOperationId(scanResult.scanId);
        setExpectActiveScan(true);
        setScanning(true);
      } catch (err) {
        setScanError(err as Error);
        setScanning(false);
        setExpectActiveScan(false);
        setTrackedScanOperationId(null);
        setScanProgress(null);
      }
    })();
  }, [project, apmeApi, resetRemediationWorkflow, scanTarget.effective]);

  const handleRegister = useCallback(async () => {
    if (!effectiveRepoUrl) return;
    setRegistering(true);
    setRegisterError(null);
    setScanError(null);
    setScanProgress({
      status: 'starting',
      message: 'Registering repository and starting scan…',
      progress: 0,
    });
    try {
      await ensureRepoBranchForScan(apmeApi, effectiveRepoUrl, branch);
      const name = entity.metadata.title || entity.metadata.name;
      const resolvedProject = await registerOrResolveApmeProject(apmeApi, {
        name,
        repo_url: effectiveRepoUrl,
        branch,
      });
      setPendingProjectId(resolvedProject.id);
      const scanResult = await apmeApi.triggerScan(resolvedProject.id);
      setTrackedScanOperationId(scanResult.scanId);
      setExpectActiveScan(true);
      setScanning(true);
      setScanProgress({
        status: 'running',
        message: `Scanning ${name}…`,
        progress: 5,
      });
      retry();
    } catch (err) {
      setRegisterError(err as Error);
      setScanning(false);
      setExpectActiveScan(false);
      setTrackedScanOperationId(null);
      setPendingProjectId(null);
      setScanProgress(null);
    } finally {
      setRegistering(false);
    }
  }, [apmeApi, entity, effectiveRepoUrl, branch, retry]);

  useEffect(() => {
    if (searchParams.get('scan') !== '1') {
      return;
    }
    pendingScanFromUrlRef.current = true;
    const params = new URLSearchParams(searchParams);
    params.delete('scan');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!pendingScanFromUrlRef.current || loading) {
      return;
    }
    pendingScanFromUrlRef.current = false;
    if (project?.id) {
      handleScan();
    } else if (effectiveRepoUrl) {
      void handleRegister();
    }
  }, [loading, project?.id, effectiveRepoUrl, handleScan, handleRegister]);

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

  useEffect(() => {
    if (acknowledgedCount === 0 && showAcknowledgedOnly) {
      setShowAcknowledgedOnly(false);
    }
  }, [acknowledgedCount, showAcknowledgedOnly]);

  // True in-flight scan only — never leftover progress from a completed gateway op.
  const scanInFlight =
    scanning ||
    Boolean(trackedScanOperationId) ||
    scanProgress?.status === 'starting';

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

  // Unscanned state — keep progress visible while Register/scan bootstraps the project
  if (!project) {
    const bootstrapping =
      registering || scanInFlight || Boolean(pendingProjectId);
    return (
      <Content>
        <PreviewNotice />
        {bootstrapping && !scanError && (
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
                {scanProgress?.message ||
                  (registering
                    ? 'Registering repository…'
                    : 'Scan in progress…')}
              </Typography>
            </div>
          </Paper>
        )}
        {scanError && (
          <Typography
            variant="body2"
            color="error"
            style={{ marginBottom: 16 }}
          >
            {scanError.message}
          </Typography>
        )}
        <div className={classes.noData}>
          <Typography variant="h6" gutterBottom>
            {bootstrapping ? 'Scan in progress…' : 'No quality scans yet'}
          </Typography>
          <Typography
            variant="body2"
            color="textSecondary"
            style={{ marginBottom: 16 }}
          >
            {bootstrapping
              ? 'Registering this repository with Ansible content modernization and running the first scan. Results will appear here when it finishes.'
              : 'Quality scans run on push when the APME workflow is configured, or use Scan to check this repository now.'}
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
          {effectiveRepoUrl && !bootstrapping && (
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
  const counts = SEVERITY_ORDER.reduce((acc, sev) => {
    acc[sev] = 0;
    return acc;
  }, {} as Record<SeverityLevel, number>);
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

  const scanTotalViolations =
    project.latest_scan?.total_violations ?? project.total_violations;
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
  const showIncludeAiSwitch =
    enableAi && !gatewayAiDisconnected && bulkAiFixableCount > 0;

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
  const hasViewFilter =
    activeCategory !== 'all' ||
    hasSeverityFilter ||
    fixTypeFilter !== 'all' ||
    Boolean(ruleFilter);

  const toggleSeverity = (sev: SeverityLevel) => {
    setSeverityFilters(prev => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  };

  const clearViewFilters = () => {
    setSeverityFilters(new Set());
    setActiveCategory('all');
    setFixTypeFilter('all');
    setRuleFilter(null);
  };

  const operationInFlight =
    scanInFlight || Boolean(fixProgress) || creatingPr || violationsLoading;

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

  const devSpacesBaseUrl = configApi.getOptionalString(
    'ansible.devSpaces.baseUrl',
  );
  const devSpacesBranch = prBranchName ?? branch;
  const devSpacesUrl =
    devSpacesBaseUrl && effectiveRepoUrl
      ? buildDevSpacesUrlFromRepoUrl(
          devSpacesBaseUrl,
          effectiveRepoUrl,
          devSpacesBranch || undefined,
        )
      : null;
  const githubCompareUrl = buildGithubCompareUrl(
    effectiveRepoUrl,
    branch,
    prBranchName,
  );

  return (
    <Content
      stretch={showScanHistory}
      className={showScanHistory ? classes.historyContent : undefined}
    >
      <PreviewNotice />
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
            proposals will not be generated. <strong>Push branch</strong> still
            applies auto-generated fixes. Connect Abbenay on the gateway or
            check Quality settings → Overview for component health.
          </Typography>
        </Paper>
      )}

      {/* Scan toolbar */}
      {showScanHistory ? (
        <ScanHistoryView
          activity={scanHistory}
          onBack={() => setShowScanHistory(false)}
          repoUrl={effectiveRepoUrl}
          currentRemediationActivityId={remediationActivityId}
          currentBranchFileChanges={branchFileChanges}
          currentBranchName={prBranchName}
        />
      ) : (
        <>
          <div className={classes.scanStatusRow}>
            <div className={classes.scanStatusLeft}>
              <Typography variant="body2" color="textSecondary">
                Last quality scan · {formatScanAge(project.last_scanned_at)}
              </Typography>
              <Tooltip title={`Scan target: ${scanTarget.label}`}>
                <HelpOutlineIcon
                  style={{ fontSize: 16, color: '#6a6e73', cursor: 'help' }}
                />
              </Tooltip>
              <Link
                component={RouterLink}
                to="/self-service/repositories/quality-settings"
                style={{ fontSize: 12, whiteSpace: 'nowrap' }}
              >
                Quality settings
              </Link>
            </div>
            <Button
              size="small"
              variant="outlined"
              className={classes.pillScan}
              startIcon={
                scanInFlight ? <CircularProgress size={14} /> : <ScanIcon />
              }
              onClick={handleScan}
              disabled={scanInFlight}
            >
              {scanInFlight ? 'Scanning…' : 'Scan'}
            </Button>
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
                    ? ` · ${ruleAutoFixCount} auto-fix${
                        enableAi && ruleAiCount > 0
                          ? ` · ${ruleAiCount} AI`
                          : ''
                      }${
                        ruleManualCount > 0
                          ? ` · ${ruleManualCount} manual`
                          : ''
                      }`
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

          {/* Scan progress — hide when fix/remediation banner is already showing */}
          {scanInFlight && !scanError && !fixProgress && (
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
                  {scanProgress?.message || 'Scan in progress…'}
                </Typography>
                {scanProgress?.violationsFound !== undefined && (
                  <Typography variant="caption">
                    {scanProgress.violationsFound} violations found
                  </Typography>
                )}
              </div>
            </Paper>
          )}
          {/* Brief post-complete banner after polling finishes */}
          {!scanInFlight &&
            scanProgress?.status === 'completed' &&
            !scanError && (
              <Paper className={classes.progressBanner} elevation={1}>
                <LinearProgress variant="determinate" value={100} />
                <div className={classes.progressText}>
                  <Typography variant="caption" color="textSecondary">
                    {scanProgress.message || 'Scan complete'}
                  </Typography>
                  {scanProgress.violationsFound !== undefined && (
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
                style={{ color: colorTokens.dependencyViolation.countPillText, marginBottom: 4 }}
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
              <div className={classes.remediationErrorBody}>
                <Typography
                  variant="subtitle2"
                  style={{ color: colorTokens.dependencyViolation.countPillText, marginBottom: 4 }}
                >
                  {apmeRemediationErrorTitle(remediationError.message)}
                </Typography>
                <Typography variant="body2">
                  {formatApmeUserFacingError(remediationError.message)}
                </Typography>
              </div>
              <IconButton
                className={classes.remediationErrorDismiss}
                aria-label="Dismiss error"
                size="small"
                onClick={() => {
                  setRemediationError(null);
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Paper>
          )}

          {violations.length > 0 && (
            <QualityWorkflowStepper
              activeStep={remediationStep}
              busy={creatingPr}
            />
          )}

          {fixProgress && (
            <FixProgressBanner
              message={fixProgress.message}
              progress={fixProgress.progress}
            />
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
              githubCompareUrl={githubCompareUrl}
              devSpacesUrl={devSpacesUrl}
              creatingPr={creatingPr}
              onCreatePr={() => void handleCreatePullRequest()}
              onScanAgain={() => {
                setPrMerged(false);
                setPrUrl(null);
                setPrBranchName(undefined);
                setBranchPushed(false);
                setPushError(null);
                setPrError(null);
                setRemediationActivityId(null);
                setTier1Result(null);
                setIncludeAiInBulk(false);
                setSelectedReviewFile(null);
                setReviewDialogOpen(false);
                setGeneratedViolationIds(new Set());
                generatedViolationIdsRef.current = new Set();
                setRemediationStep('select');
                setApprovedProposalIds(new Set());
                handleScan();
              }}
            />
          )}

          {remediationStep === 'review' &&
            branchFileChanges.length > 0 &&
            !branchPushed && (
              <Paper className={classes.reviewPanel} elevation={0}>
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  style={{ gap: 12, flexWrap: 'wrap' }}
                >
                  <Typography variant="body2" color="textSecondary">
                    {branchFileChanges.length} file
                    {branchFileChanges.length === 1 ? '' : 's'} ·{' '}
                    {reviewFindingCount} finding
                    {reviewFindingCount === 1 ? '' : 's'} ready to push
                  </Typography>
                  <Box display="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setReviewDialogOpen(true)}
                    >
                      View patches
                    </Button>
                    <Tooltip title={pushBranchReviewTooltip()}>
                      <span>
                        <Button
                          size="small"
                          variant="contained"
                          color="primary"
                          onClick={() => void handlePushBranch()}
                          disabled={
                            creatingPr || branchFileChanges.length === 0
                          }
                        >
                          {creatingPr ? 'Pushing branch…' : 'Push branch'}
                        </Button>
                      </span>
                    </Tooltip>
                  </Box>
                </Box>
              </Paper>
            )}

          <RemediationReviewDialog
            open={reviewDialogOpen && remediationStep === 'review'}
            onClose={() => setReviewDialogOpen(false)}
            fileCount={branchFileChanges.length}
            findingCount={reviewFindingCount}
            files={branchFileChanges}
            selectedFile={selectedReviewFile}
            onSelectedFileChange={setSelectedReviewFile}
          />

          {violations.length > 0 && (
            <>
              <div className={classes.violationSummary}>
                <Typography
                  component="span"
                  variant="body2"
                  style={{ fontWeight: 600 }}
                >
                  {hasViewFilter
                    ? `${filteredViolations.length} of ${violationTotal}`
                    : violationTotal}{' '}
                  violation{violationTotal !== 1 ? 's' : ''}
                </Typography>
                {SEVERITY_ORDER.map(sev => {
                  const count = counts[sev];
                  if (count === 0) return null;
                  const color = colorTokens.severity[sev].inlineText;
                  const isActive = severityFilters.has(sev);
                  return (
                    <Box
                      key={sev}
                      component="span"
                      display="inline-flex"
                      alignItems="center"
                    >
                      <span className={classes.summarySep}>|</span>
                      <Typography
                        component="button"
                        variant="body2"
                        onClick={() => toggleSeverity(sev)}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          color,
                          fontWeight: isActive ? 700 : 500,
                          textDecoration: isActive ? 'underline' : 'none',
                        }}
                      >
                        {count} {SEVERITY_STYLES[sev].label}
                      </Typography>
                    </Box>
                  );
                })}
                {hasViewFilter && (
                  <Button
                    size="small"
                    variant="text"
                    style={{ fontSize: 12, textTransform: 'none' }}
                    onClick={clearViewFilters}
                  >
                    Clear filters
                  </Button>
                )}
              </div>

              <div className={classes.scanMetaBelow}>
                <Typography variant="caption" color="textSecondary">
                  Scan target: {scanTarget.label}
                </Typography>
                {scanHistory.length > 0 && (
                  <Button
                    size="small"
                    variant="text"
                    color="primary"
                    onClick={() => setShowScanHistory(true)}
                    style={{ textTransform: 'none', fontSize: 12, padding: 0 }}
                  >
                    View history ({scanHistory.length})
                  </Button>
                )}
              </div>

              {violationTotal > 0 && (
                <div className={classes.severityBar} aria-hidden>
                  {SEVERITY_ORDER.map(sev => {
                    const count = counts[sev];
                    if (count === 0) return null;
                    return (
                      <div
                        key={sev}
                        className={classes.severityBarSegment}
                        style={{
                          width: `${(count / violationTotal) * 100}%`,
                          backgroundColor: colorTokens.severity[sev].barFill,
                        }}
                      />
                    );
                  })}
                </div>
              )}

              <div className={classes.actionBar}>
                <div className={classes.actionBarLeft}>
                  <FormControl
                    variant="outlined"
                    size="small"
                    className={classes.filterSelect}
                  >
                    <Select
                      value={fixTypeFilter}
                      onChange={e => setFixTypeFilter(e.target.value as string)}
                      displayEmpty
                      renderValue={value => fixMethodFilterLabel(String(value))}
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
                  <FormControl
                    variant="outlined"
                    size="small"
                    className={classes.filterSelect}
                  >
                    <Select
                      value={activeCategory}
                      onChange={e =>
                        setActiveCategory(e.target.value as string)
                      }
                      displayEmpty
                      renderValue={value => {
                        const cat = String(value);
                        if (cat === 'all') {
                          return 'All categories';
                        }
                        const count = catCounts[cat] ?? 0;
                        return `${categoryLabel(cat)} (${count})`;
                      }}
                    >
                      <MenuItem value="all">
                        All categories ({violations.length})
                      </MenuItem>
                      {CATEGORIES.slice(1).map(cat => {
                        const count = catCounts[cat];
                        return count ? (
                          <MenuItem key={cat} value={cat}>
                            {categoryLabel(cat)} ({count})
                          </MenuItem>
                        ) : null;
                      })}
                    </Select>
                  </FormControl>
                  {acknowledgedCount > 0 && (
                    <Chip
                      size="small"
                      label={`${acknowledgedCount} acknowledged`}
                      onClick={() => setShowAcknowledgedOnly(prev => !prev)}
                      color={showAcknowledgedOnly ? 'primary' : 'default'}
                      variant={showAcknowledgedOnly ? 'default' : 'outlined'}
                    />
                  )}
                </div>
                <Box
                  display="flex"
                  alignItems="center"
                  style={{ gap: 8, flexWrap: 'wrap' }}
                >
                  {remediationStep === 'select' && showIncludeAiSwitch && (
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={includeAiInBulk}
                          onChange={event =>
                            setIncludeAiInBulk(event.target.checked)
                          }
                          color="primary"
                        />
                      }
                      label={`Include AI suggestions (${bulkAiFixableCount})`}
                    />
                  )}
                  {remediationStep === 'select' && (
                    <Tooltip title={generateFixesTooltip(bulkFixableIds.size)}>
                      <span>
                        <Button
                          size="small"
                          variant="contained"
                          color="primary"
                          onClick={() => void handlePrepareFixes()}
                          disabled={bulkFixableIds.size === 0 || creatingPr}
                        >
                          {generateFixesButtonLabel(creatingPr, bulkFixableIds.size)}
                        </Button>
                      </span>
                    </Tooltip>
                  )}
                </Box>
              </div>
            </>
          )}

          {violations.length === 0 && !operationInFlight && (
            <Typography
              variant="body2"
              color="textSecondary"
              className={classes.emptyMessage}
            >
              {project.scan_count === 0
                ? 'No quality scans yet. Click Scan to analyze this repository.'
                : 'No violations found. This repository is clean.'}
            </Typography>
          )}
          {violations.length > 0 && (
            <div id="apme-violations-table">
              <ApmeViolationsTable
                key={`violations-${activeCategory}-${[...severityFilters].join(
                  ',',
                )}-${fixTypeFilter}-${ruleFilter ?? ''}-${remediationStep}`}
                violations={filteredViolations}
                aiAssistedViolationIds={aiAssistedViolationIds}
                reviewDiffs={reviewDiffs}
                showReviewPreparedCaption={
                  remediationStep === 'review' && !branchPushed
                }
                onJumpToFile={
                  remediationStep === 'review' && !branchPushed
                    ? handleJumpToReviewFile
                    : undefined
                }
                showScanPreviewCaption={remediationStep === 'select'}
                showAcknowledgedOnly={showAcknowledgedOnly}
                onAcknowledge={handleAcknowledge}
                onUnacknowledge={handleUnacknowledge}
                acknowledgingId={acknowledgingId}
                isAcknowledged={isAcknowledged}
                onRequestShowOpenIssues={() => setShowAcknowledgedOnly(false)}
                onRequestShowWontFix={() => setShowAcknowledgedOnly(true)}
                toolbarActions={null}
                filterContext={{
                  totalViolationCount: violationTotal,
                  activeFixTypeFilter: fixTypeFilter,
                  ruleFilter,
                  autoFixCount: ruleFilter ? ruleAutoFixCount : autoFix,
                  onClearFixTypeFilter: () => setFixTypeFilter('all'),
                  onClearRuleFilter: () => setRuleFilter(null),
                }}
              />
            </div>
          )}
        </>
      )}
    </Content>
  );
};
