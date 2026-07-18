/*
 * Copyright Red Hat
 */

import type { Violation } from '@ansible/backstage-apme-common/types';
import { effectiveViolationFixType } from '@ansible/backstage-apme-common/proposalTier';

/** Violation ids included in a bulk remedia run (autofix ± optional AI). */
export function collectBulkFixableViolationIds(
  violations: Violation[],
  enableAi: boolean,
  includeAiInBulk: boolean,
  aiAssistedViolationIds?: ReadonlySet<number>,
): Set<number> {
  const ids = new Set<number>();
  for (const violation of violations) {
    const fixType = effectiveViolationFixType(
      violation,
      enableAi,
      aiAssistedViolationIds,
    );
    if (fixType === 'auto') {
      ids.add(violation.id);
    } else if (fixType === 'ai' && includeAiInBulk) {
      ids.add(violation.id);
    }
  }
  return ids;
}
