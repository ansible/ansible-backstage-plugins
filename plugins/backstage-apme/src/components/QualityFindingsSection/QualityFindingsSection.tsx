/*
 * Copyright Red Hat
 *
 * Shared findings chrome for Quality activity (US-007).
 * Acknowledge/suppress actions live on Dependencies (richer context).
 */

import { useMemo } from 'react';
import { Flex } from '@patternfly/react-core';
import { AssessFindingsPanel } from '@apme/ui-workflow';
import type { Violation } from '@ansible/backstage-apme-common/types';
import { violationsToAssessFindings } from '../../utils/violationToAssessFinding';

export interface QualityFindingsSectionProps {
  violations: Violation[];
  /** Prefills AssessFindingsPanel Rule filter (fleet drill-down). */
  ruleFilter?: string;
  categoryFilter?: string;
  /** Override AssessFindingsPanel description (history vs latest). */
  description?: string;
}

/**
 * Read-only AssessFindingsPanel (SPA history pattern).
 * The shared panel owns severity/rule filters.
 */
export function QualityFindingsSection({
  violations,
  ruleFilter,
  categoryFilter,
  description,
}: QualityFindingsSectionProps) {
  const panelFilterOpts = useMemo(
    () => ({
      ruleId: ruleFilter,
      category: categoryFilter,
    }),
    [ruleFilter, categoryFilter],
  );

  const findings = useMemo(
    () => violationsToAssessFindings(violations, panelFilterOpts),
    [violations, panelFilterOpts],
  );

  if (violations.length === 0 && findings.length === 0) {
    return (
      <div style={{ opacity: 0.7, padding: '8px 0' }}>
        No open findings for this project yet. Run a scan to assess content
        quality.
      </div>
    );
  }

  return (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
      {findings.length > 0 ? (
        <AssessFindingsPanel findings={findings} description={description} />
      ) : (
        <div style={{ opacity: 0.7 }}>
          No open findings match the current filters.
        </div>
      )}
    </Flex>
  );
}
