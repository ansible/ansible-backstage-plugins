/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import type {
  CreateSuppressionRequest,
  Violation,
} from '@ansible/backstage-apme-common/types';
import { apmeApiRef } from '../api';

export type AcknowledgeLabelVariant = 'wontFix' | 'acknowledge';

export function acknowledgeButtonLabel(
  acknowledgingId: number | null | undefined,
  violationId: number,
  isAcknowledged: boolean,
  variant: AcknowledgeLabelVariant = 'acknowledge',
): string {
  if (acknowledgingId === violationId) return 'Saving…';
  if (variant === 'acknowledge') {
    return isAcknowledged ? 'Acknowledged' : 'Acknowledge';
  }
  return isAcknowledged ? "Won't be fixed" : "Won't fix";
}

function isDuplicateSuppressionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes('409') ||
    err.message.toLowerCase().includes('already exists')
  );
}

function buildSuppressionRequest(
  violation: Violation,
  scope: string,
): CreateSuppressionRequest {
  const yaml = violation.original_yaml ?? '';
  const hasYaml = Boolean(yaml.trim());
  return {
    rule_id: violation.rule_id,
    // Gateway requires original_yaml (even empty) or fingerprint_hash for rule_only.
    original_yaml: hasYaml ? yaml : '',
    fingerprint_mode: hasYaml ? 'full' : 'rule_only',
    scope,
    reason: 'Acknowledged from portal',
  };
}

export function useViolationAcknowledge(
  projectId: string | undefined,
  onChanged?: () => void,
  violations?: Violation[],
) {
  const apmeApi = useApi(apmeApiRef);
  const [acknowledgingId, setAcknowledgingId] = useState<number | null>(null);
  const [suppressionByViolation, setSuppressionByViolation] = useState<
    Map<number, number>
  >(new Map());
  const [optimisticAcknowledgedIds, setOptimisticAcknowledgedIds] = useState<
    Set<number>
  >(() => new Set());

  useEffect(() => {
    if (!violations?.length) return;
    setOptimisticAcknowledgedIds(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const v of violations) {
        if (v.suppressed && next.delete(v.id)) {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [violations]);

  const markAcknowledged = useCallback((violationId: number) => {
    setOptimisticAcknowledgedIds(prev => new Set(prev).add(violationId));
  }, []);

  const isAcknowledged = useCallback(
    (violation: Violation) =>
      violation.suppressed === true ||
      optimisticAcknowledgedIds.has(violation.id),
    [optimisticAcknowledgedIds],
  );

  const acknowledge = useCallback(
    async (violation: Violation) => {
      if (!projectId) return;
      setAcknowledgingId(violation.id);
      try {
        const suppression = await apmeApi.createSuppression(
          buildSuppressionRequest(violation, `project:${projectId}`),
        );
        setSuppressionByViolation(prev =>
          new Map(prev).set(violation.id, suppression.id),
        );
        markAcknowledged(violation.id);
        onChanged?.();
      } catch (err) {
        if (isDuplicateSuppressionError(err)) {
          markAcknowledged(violation.id);
          onChanged?.();
          return;
        }
        throw err;
      } finally {
        setAcknowledgingId(null);
      }
    },
    [apmeApi, markAcknowledged, onChanged, projectId],
  );

  const unacknowledge = useCallback(
    async (violation: Violation) => {
      if (!projectId) return;
      setAcknowledgingId(violation.id);
      try {
        let suppressionId = suppressionByViolation.get(violation.id);
        if (suppressionId === undefined) {
          const list = await apmeApi.getSuppressions(`project:${projectId}`);
          const match = list.find(s => s.rule_id === violation.rule_id);
          suppressionId = match?.id;
        }
        if (suppressionId !== undefined) {
          await apmeApi.deleteSuppression(suppressionId);
          setSuppressionByViolation(prev => {
            const next = new Map(prev);
            next.delete(violation.id);
            return next;
          });
        }
        // Always clear optimistic state — either the suppression was deleted
        // successfully, or it was already removed by another user.
        setOptimisticAcknowledgedIds(prev => {
          const next = new Set(prev);
          next.delete(violation.id);
          return next;
        });
        onChanged?.();
      } finally {
        setAcknowledgingId(null);
      }
    },
    [apmeApi, onChanged, projectId, suppressionByViolation],
  );

  return {
    acknowledge,
    unacknowledge,
    acknowledgingId,
    isAcknowledged,
  };
}
