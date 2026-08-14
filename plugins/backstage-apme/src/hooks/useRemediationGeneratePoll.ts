/*
 * Copyright Red Hat
 */

import { useEffect, type MutableRefObject } from 'react';
import type { Proposal, Violation } from '@ansible/backstage-apme-common/types';
import { normalizeProposals } from '@ansible/backstage-apme-common/proposalTier';
import {
  formatOperationError,
  isTerminalOperationState,
  latestOperationProgressMessage,
  latestOperationProgressPercent,
} from '@ansible/backstage-apme-common/operationStatus';
import type { OperationState } from '@ansible/backstage-apme-common/types';
import {
  extractTier1FromOperationState,
  type Tier1RemediationCache,
} from '../utils/remediationWorkflowCache';
import type { RemediationStep } from '../components/RemediationStepper';
import type { ApmeApi } from '../api/ApmeApi';

export function applyGeneratedBulkSet(
  ids: Set<number>,
  setGeneratedViolationIds: (ids: Set<number>) => void,
  generatedViolationIdsRef: MutableRefObject<Set<number>>,
): void {
  generatedViolationIdsRef.current = ids;
  setGeneratedViolationIds(ids);
}

export function violationIdsFromProposals(proposals: Proposal[]): Set<number> {
  const ids = new Set<number>();
  for (const proposal of proposals) {
    if (proposal.violation_id > 0) {
      ids.add(proposal.violation_id);
    }
  }
  return ids;
}

export function violationIdsFromTier1(
  tier1: Tier1RemediationCache,
  violations: Violation[],
  fallback: Set<number>,
): Set<number> {
  const ids = new Set<number>();
  for (const fv of tier1.fixedViolations) {
    const match = violations.find(
      v =>
        v.rule_id === fv.rule_id &&
        v.file === fv.file &&
        (fv.line === null || fv.line === undefined || v.line === fv.line),
    );
    if (match) {
      ids.add(match.id);
    }
  }
  if (ids.size === 0 && fallback.size > 0) {
    return new Set(fallback);
  }
  return ids;
}

export type FinalizeRemediationGenerationResult =
  | {
      kind: 'failed';
      error: Error;
    }
  | {
      kind: 'timeout';
      error: Error;
    }
  | {
      kind: 'review';
      proposals: Proposal[];
      tier1Result: Tier1RemediationCache | null;
      generatedIds: Set<number>;
    }
  | {
      kind: 'empty';
      error: Error;
    };

export function finalizeRemediationGeneration(params: {
  state: OperationState | null | undefined;
  violations: Violation[];
  generatedViolationIdsRef: Set<number>;
}): FinalizeRemediationGenerationResult {
  const { state, violations, generatedViolationIdsRef } = params;

  if (state?.status === 'failed') {
    return {
      kind: 'failed',
      error: new Error(formatOperationError(state.error)),
    };
  }

  const nextProposals = normalizeProposals(state?.proposals ?? [], violations);
  const tier1 = extractTier1FromOperationState(state);
  if (nextProposals.length > 0) {
    return {
      kind: 'review',
      proposals: nextProposals,
      tier1Result: null,
      generatedIds: violationIdsFromProposals(nextProposals),
    };
  }
  if (tier1) {
    return {
      kind: 'review',
      proposals: [],
      tier1Result: tier1,
      generatedIds: violationIdsFromTier1(
        tier1,
        violations,
        generatedViolationIdsRef,
      ),
    };
  }
  return {
    kind: 'empty',
    error: new Error(
      'No automated patches were produced for this run. Manual-only findings require hand-editing in your repo or Dev Spaces.',
    ),
  };
}

export interface UseRemediationGeneratePollOptions {
  remediationStep: RemediationStep;
  creatingPr: boolean;
  projectId: string | undefined;
  apmeApi: Pick<ApmeApi, 'getOperationState' | 'getActivity'>;
  violationsRef: MutableRefObject<Violation[]>;
  setFixProgress: React.Dispatch<
    React.SetStateAction<{ message: string; progress?: number } | null>
  >;
  setProposals: React.Dispatch<React.SetStateAction<Proposal[]>>;
  setTier1Result: React.Dispatch<
    React.SetStateAction<Tier1RemediationCache | null>
  >;
  setGeneratedViolationIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  generatedViolationIdsRef: MutableRefObject<Set<number>>;
  setRemediationStep: React.Dispatch<React.SetStateAction<RemediationStep>>;
  setRemediationError: React.Dispatch<React.SetStateAction<Error | null>>;
  setRemediationActivityId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
}

const MAX_POLLS = 180;
const POLL_INTERVAL_MS = 2000;

export function useRemediationGeneratePoll({
  remediationStep,
  creatingPr,
  projectId,
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
}: UseRemediationGeneratePollOptions): void {
  useEffect(() => {
    if (remediationStep !== 'generate' || creatingPr || !projectId) {
      return undefined;
    }
    let cancelled = false;
    let pollCount = 0;
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
          setProposals(
            normalizeProposals(state.proposals, violationsRef.current),
          );
        }
        const completed = isTerminalOperationState(state, pollCount, 2, true);
        if (completed || pollCount >= MAX_POLLS) {
          clearInterval(pollInterval);
          setFixProgress(null);
          if (pollCount >= MAX_POLLS && !state) {
            setRemediationError(
              new Error('Fix generation timed out. Try again in a moment.'),
            );
            setRemediationStep('select');
            return;
          }
          const outcome = finalizeRemediationGeneration({
            state,
            violations: violationsRef.current,
            generatedViolationIdsRef: generatedViolationIdsRef.current,
          });
          if (outcome.kind === 'failed' || outcome.kind === 'timeout') {
            setRemediationError(outcome.error);
            setRemediationStep('select');
            return;
          }
          if (outcome.kind === 'empty') {
            setTier1Result(null);
            setRemediationError(outcome.error);
            setRemediationStep('select');
            return;
          }
          if (outcome.tier1Result) {
            setProposals([]);
            setTier1Result(outcome.tier1Result);
          } else {
            setTier1Result(null);
            setProposals(outcome.proposals);
          }
          applyGeneratedBulkSet(
            outcome.generatedIds,
            setGeneratedViolationIds,
            generatedViolationIdsRef,
          );
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
  }, [
    remediationStep,
    creatingPr,
    projectId,
    apmeApi,
    violationsRef,
    generatedViolationIdsRef,
    setFixProgress,
    setProposals,
    setTier1Result,
    setGeneratedViolationIds,
    setRemediationStep,
    setRemediationError,
    setRemediationActivityId,
  ]);
}
