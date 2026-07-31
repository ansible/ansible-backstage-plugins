/*
 * Copyright Red Hat
 *
 * Host-side suppressions for Quality triage (US-007). SPA AssessFindingsPanel
 * has no acknowledge CTA — Portal owns createSuppression.
 */

import { useCallback, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import type { Violation } from '@ansible/backstage-apme-common/types';
import { apmeApiRef } from '../api';

export function useViolationAcknowledge(projectId: string | undefined) {
  const apmeApi = useApi(apmeApiRef);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [ackError, setAckError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const acknowledge = useCallback(
    async (violation: Violation) => {
      if (!projectId) return;
      setAckError(null);
      setPendingId(violation.id);
      try {
        const hasYaml = !!violation.original_yaml?.trim();
        await apmeApi.createSuppression({
          rule_id: violation.rule_id,
          original_yaml: hasYaml ? violation.original_yaml! : '',
          fingerprint_mode: hasYaml ? 'full' : 'rule_only',
          scope: `project:${projectId}`,
          reason: 'Acknowledged via Quality triage',
        });
        setAcknowledgedIds(prev => new Set(prev).add(violation.id));
      } catch (err: unknown) {
        const status =
          err != null && typeof err === 'object' && 'status' in err
            ? (err as { status: number }).status
            : undefined;
        if (status === 409) {
          setAcknowledgedIds(prev => new Set(prev).add(violation.id));
        } else {
          setAckError(
            `Failed to acknowledge: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      } finally {
        setPendingId(null);
      }
    },
    [apmeApi, projectId],
  );

  const resetAcknowledged = useCallback(() => {
    setAcknowledgedIds(new Set());
    setAckError(null);
  }, []);

  return {
    acknowledgedIds,
    ackError,
    pendingId,
    acknowledge,
    resetAcknowledged,
    clearAckError: () => setAckError(null),
  };
}
