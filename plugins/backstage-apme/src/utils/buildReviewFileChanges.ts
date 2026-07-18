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

import type { Proposal, Violation } from '@ansible/backstage-apme-common/types';
import { isDeclinedProposal } from '@ansible/backstage-apme-common/proposalTier';
import type { BranchFileChange } from '../components/BranchFileChangesPanel';
import type { Tier1RemediationCache } from './remediationWorkflowCache';

function fileChangeHasVisibleFix(change: BranchFileChange): boolean {
  if (change.diff?.trim()) {
    return true;
  }
  const after = change.after?.trim();
  if (!after) {
    return false;
  }
  const before = change.before?.trim();
  return !before || before !== after;
}

function preferNonEmpty(
  incoming: string | undefined,
  existing: string | undefined,
): string | undefined {
  return incoming?.trim() ? incoming : existing;
}

function mergeFileChange(
  byFile: Map<string, BranchFileChange>,
  file: string,
  patch: Partial<BranchFileChange>,
): void {
  const existing = byFile.get(file);
  byFile.set(file, {
    file,
    before: preferNonEmpty(patch.before, existing?.before),
    after: preferNonEmpty(patch.after, existing?.after),
    diff: preferNonEmpty(patch.diff, existing?.diff),
  });
}

function findViolationForTier1Patch(
  violations: Violation[],
  tier1Result: Tier1RemediationCache,
  file: string,
): Violation | undefined {
  const fixed = tier1Result.fixedViolations.find(f => f.file === file);
  if (!fixed) {
    return violations.find(v => v.file === file);
  }
  return violations.find(
    v =>
      v.rule_id === fixed.rule_id &&
      v.file === fixed.file &&
      (fixed.line == null || v.line === fixed.line),
  );
}

/** Per-file prepared fixes for the review workspace. */
export function buildReviewFileChanges(
  proposals: Proposal[],
  tier1Result: Tier1RemediationCache | null,
  violations: Violation[],
  generatedViolationIds?: ReadonlySet<number>,
): BranchFileChange[] {
  const byFile = new Map<string, BranchFileChange>();

  for (const proposal of proposals) {
    if (isDeclinedProposal(proposal)) {
      continue;
    }
    const file = proposal.file?.trim();
    if (!file) continue;
    mergeFileChange(byFile, file, {
      before: proposal.original_yaml,
      after: proposal.fixed_yaml,
      diff: proposal.diff_hunk,
    });
  }

  if (tier1Result) {
    for (const patch of tier1Result.patches) {
      if (!patch.file?.trim() || !patch.diff?.trim()) {
        continue;
      }
      const violation = findViolationForTier1Patch(
        violations,
        tier1Result,
        patch.file,
      );
      mergeFileChange(byFile, patch.file, {
        before: violation?.original_yaml,
        after: violation?.fixed_yaml,
        diff: patch.diff,
      });
    }
  }

  if (generatedViolationIds && generatedViolationIds.size > 0) {
    for (const violation of violations) {
      if (!generatedViolationIds.has(violation.id)) {
        continue;
      }
      const file = violation.file?.trim();
      if (!file || byFile.has(file)) {
        continue;
      }
      if (!violation.fixed_yaml?.trim() && !violation.original_yaml?.trim()) {
        continue;
      }
      mergeFileChange(byFile, file, {
        before: violation.original_yaml,
        after: violation.fixed_yaml,
      });
    }
  }

  return [...byFile.values()].filter(fileChangeHasVisibleFix);
}
