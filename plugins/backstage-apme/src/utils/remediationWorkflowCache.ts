/*
 * Copyright Red Hat
 *
 * Session cache for in-progress remediation workflows (ADR-052).
 */

import type {
  OperationState,
  Project,
  Proposal,
} from '@ansible/backstage-apme-common/types';
import type { RemediationStep } from '../components/RemediationStepper';

const CACHE_PREFIX = 'apme-remediation-workflow:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface Tier1RemediationCache {
  remediatedCount: number;
  fixedViolations: NonNullable<
    NonNullable<OperationState['result']>['fixed_violations']
  >;
  patches: NonNullable<NonNullable<OperationState['result']>['patches']>;
}

export interface RemediationWorkflowCache {
  savedAt: string;
  projectId: string;
  lastScannedAt?: string;
  scanCount?: number;
  remediationStep: RemediationStep;
  remediationActivityId: string | null;
  proposals: Proposal[];
  tier1Result: Tier1RemediationCache | null;
  selectedIds: number[];
  approvedProposalIds: string[];
  branchPushed: boolean;
  prBranchName?: string;
}

function cacheKey(projectId: string): string {
  return `${CACHE_PREFIX}${projectId}`;
}

export function clearRemediationWorkflowCache(projectId: string): void {
  try {
    sessionStorage.removeItem(cacheKey(projectId));
  } catch {
    // sessionStorage may be unavailable
  }
}

export function loadRemediationWorkflowCache(
  projectId: string,
): RemediationWorkflowCache | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(projectId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as RemediationWorkflowCache;
    if (parsed.projectId !== projectId) {
      return null;
    }
    const ageMs = Date.now() - Date.parse(parsed.savedAt);
    if (Number.isNaN(ageMs) || ageMs > CACHE_TTL_MS) {
      clearRemediationWorkflowCache(projectId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isRemediationWorkflowCacheValid(
  cache: RemediationWorkflowCache,
  project: Pick<Project, 'last_scanned_at' | 'scan_count'>,
): boolean {
  if (
    cache.lastScannedAt !== undefined &&
    project.last_scanned_at !== undefined &&
    cache.lastScannedAt !== project.last_scanned_at
  ) {
    return false;
  }
  if (
    cache.scanCount !== undefined &&
    project.scan_count !== undefined &&
    cache.scanCount !== project.scan_count
  ) {
    return false;
  }
  return true;
}

export function saveRemediationWorkflowCache(
  project: Pick<Project, 'id' | 'last_scanned_at' | 'scan_count'>,
  state: Omit<RemediationWorkflowCache, 'savedAt' | 'projectId'>,
): void {
  try {
    const payload: RemediationWorkflowCache = {
      ...state,
      savedAt: new Date().toISOString(),
      projectId: project.id,
      lastScannedAt: project.last_scanned_at,
      scanCount: project.scan_count,
    };
    sessionStorage.setItem(cacheKey(project.id), JSON.stringify(payload));
  } catch {
    // sessionStorage may be unavailable or full
  }
}

export function extractTier1FromOperationState(
  state: OperationState | null | undefined,
): Tier1RemediationCache | null {
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

export function restoreRemediationFromOperationState(
  state: OperationState | null | undefined,
): Pick<
  RemediationWorkflowCache,
  'remediationStep' | 'remediationActivityId' | 'proposals' | 'tier1Result'
> | null {
  if (!state || state.scan_type !== 'remediate') {
    return null;
  }
  if (state.status === 'failed') {
    return null;
  }
  const activeStatuses = new Set([
    'running',
    'cloning',
    'scanning',
    'remediating',
    'awaiting_approval',
  ]);
  if (activeStatuses.has(state.status)) {
    return {
      remediationStep: 'generate',
      remediationActivityId: state.scan_id ?? null,
      proposals: state.proposals ?? [],
      tier1Result: null,
    };
  }
  const proposals = state.proposals ?? [];
  const tier1Result = extractTier1FromOperationState(state);
  if (proposals.length === 0 && !tier1Result) {
    return null;
  }
  return {
    remediationStep: 'review',
    remediationActivityId: state.scan_id ?? null,
    proposals,
    tier1Result,
  };
}
