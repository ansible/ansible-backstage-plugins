/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { scmAuthApiRef } from '@backstage/integration-react';
import type {
  OperationState,
  Project,
  Proposal,
  Violation,
} from '@ansible/backstage-apme-common/types';
import {
  isTerminalOperationState,
  formatOperationError,
  latestOperationProgressMessage,
  latestOperationProgressPercent,
} from '@ansible/backstage-apme-common/operationStatus';
import {
  isFixableViolation,
  proposalNeedsManualApproval,
} from '@ansible/backstage-apme-common/severity';
import type { RemediationStep } from '../components/RemediationStepper';
import { apmeApiRef } from '../api';

export interface Tier1RemediationResult {
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
  if (!result) return null;
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
  selectedViolationIds: Set<number>,
  violations: Violation[],
): Tier1RemediationResult {
  if (selectedViolationIds.size === 0) return tier1;

  const selectedViolations = violations.filter(v =>
    selectedViolationIds.has(v.id),
  );
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

export interface RemediationOrchestrationOptions {
  project: Project | null | undefined;
  repoUrl: string | null;
  violations: Violation[];
  selectedIds: Set<number>;
  enableAi: boolean;
}

export interface RemediationOrchestrationState {
  remediationStep: RemediationStep;
  setRemediationStep: (step: RemediationStep) => void;
  fixProgress: { message: string; progress?: number } | null;
  proposals: Proposal[];
  visibleProposals: Proposal[];
  approvedProposalIds: Set<string>;
  declinedProposalIds: Set<string>;
  prUrl: string | null;
  prBranchName: string | undefined;
  prNumber: number | undefined;
  prError: string | null;
  pushError: string | null;
  branchPushed: boolean;
  creatingPr: boolean;
  prMerged: boolean;
  setPrMerged: (merged: boolean) => void;
  remediationError: Error | null;
  tier1Result: Tier1RemediationResult | null;
  remediationActivityId: string | null;
  selectedFixableIds: Set<number>;
  handleGenerateFixes: () => Promise<void>;
  handleApproveProposal: (proposal: Proposal) => Promise<void>;
  handleDeclineProposal: (proposalId: string) => void;
  handlePushBranch: () => Promise<void>;
  handleCreatePr: () => Promise<void>;
  generatedViolationIdsRef: React.MutableRefObject<Set<number>>;
}

const MAX_POLLS = 180;
const POLL_INTERVAL_MS = 2000;

export function useRemediationOrchestration({
  project,
  repoUrl,
  violations,
  selectedIds,
  enableAi,
}: RemediationOrchestrationOptions): RemediationOrchestrationState {
  const apmeApi = useApi(apmeApiRef);
  const scmAuthApi = useApi(scmAuthApiRef);

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
  const autoApprovedRef = useRef<Set<string>>(new Set());

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
    if (active.length === 0) return [];
    if (remediationStep === 'review') return active;
    if (selectedFixableIds.size > 0) {
      return active.filter(p => selectedFixableIds.has(p.violation_id));
    }
    return active;
  }, [proposals, selectedFixableIds, declinedProposalIds, remediationStep]);

  // Poll remediation operation with cancellation guard
  useEffect(() => {
    if (remediationStep !== 'generate' || !project?.id) return undefined;
    let cancelled = false;
    let pollCount = 0;
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
          setProposals(state.proposals);
        }
        const completed = isTerminalOperationState(state, pollCount, 2, true);
        if (completed || pollCount >= MAX_POLLS) {
          clearInterval(pollInterval);
          setFixProgress(null);
          if (state?.status === 'failed') {
            setRemediationError(new Error(formatOperationError(state.error)));
            setRemediationStep('select');
            return;
          }
          if (pollCount >= MAX_POLLS && !state) {
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
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [remediationStep, project?.id, apmeApi, violations]);

  // Auto-approve deterministic proposals when review starts
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
        if (!v) return true;
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

  return {
    remediationStep,
    setRemediationStep,
    fixProgress,
    proposals,
    visibleProposals,
    approvedProposalIds,
    declinedProposalIds,
    prUrl,
    prBranchName,
    prNumber,
    prError,
    pushError,
    branchPushed,
    creatingPr,
    prMerged,
    setPrMerged,
    remediationError,
    tier1Result,
    remediationActivityId,
    selectedFixableIds,
    handleGenerateFixes,
    handleApproveProposal,
    handleDeclineProposal,
    handlePushBranch,
    handleCreatePr,
    generatedViolationIdsRef,
  };
}
