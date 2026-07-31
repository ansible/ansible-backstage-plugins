/*
 * Copyright Red Hat
 *
 * Shared findings + acknowledge chrome for Quality / Quality activity (US-007).
 */

import { useMemo } from 'react';
import {
  Alert,
  AlertActionCloseButton,
  Button,
  Flex,
  FlexItem,
} from '@patternfly/react-core';
import { AssessFindingsPanel } from '@apme/ui-workflow';
import type { Violation } from '@ansible/backstage-apme-common/types';
import {
  filterViolationsForAssessPanel,
  violationsToAssessFindings,
} from '../../utils/violationToAssessFinding';
import { normalizeRuleId } from '../../utils/violationAnalytics';

export interface QualityFindingsSectionProps {
  projectId: string;
  violations: Violation[];
  /** Prefills AssessFindingsPanel Rule filter (fleet drill-down). */
  ruleFilter?: string;
  categoryFilter?: string;
  acknowledgedIds: ReadonlySet<number>;
  pendingId: number | null;
  ackError: string | null;
  onAcknowledge: (violation: Violation) => void;
  onClearAckError: () => void;
  /** Override AssessFindingsPanel description (history vs latest). */
  description?: string;
}

/**
 * Read-only AssessFindingsPanel (SPA history pattern) plus host acknowledge
 * actions — the shared panel owns severity/rule filters.
 */
export function QualityFindingsSection({
  violations,
  ruleFilter,
  categoryFilter,
  acknowledgedIds,
  pendingId,
  ackError,
  onAcknowledge,
  onClearAckError,
  description,
}: QualityFindingsSectionProps) {
  // Pass the full open set into the panel so Rule filter can show "N of total".
  const panelFilterOpts = useMemo(
    () => ({
      category: categoryFilter,
      acknowledgedIds,
    }),
    [categoryFilter, acknowledgedIds],
  );

  const ackFilterOpts = useMemo(
    () => ({
      ruleId: ruleFilter,
      category: categoryFilter,
      acknowledgedIds,
    }),
    [ruleFilter, categoryFilter, acknowledgedIds],
  );

  const openViolations = useMemo(
    () => filterViolationsForAssessPanel(violations, ackFilterOpts),
    [violations, ackFilterOpts],
  );

  const findings = useMemo(
    () => violationsToAssessFindings(violations, panelFilterOpts),
    [violations, panelFilterOpts],
  );

  const initialRuleFilters = useMemo(
    () => (ruleFilter ? [normalizeRuleId(ruleFilter)] : undefined),
    [ruleFilter],
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
      {ackError ? (
        <Alert
          variant="danger"
          title="Acknowledge failed"
          actionClose={
            <AlertActionCloseButton onClose={onClearAckError} />
          }
        >
          {ackError}
        </Alert>
      ) : null}

      {findings.length > 0 ? (
        <AssessFindingsPanel
          findings={findings}
          description={description}
          initialRuleFilters={initialRuleFilters}
        />
      ) : (
        <div style={{ opacity: 0.7 }}>
          No open findings match the current filters.
        </div>
      )}

      {openViolations.length > 0 ? (
        <FlexItem>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Acknowledge</div>
          <div style={{ opacity: 0.75, fontSize: 13, marginBottom: 8 }}>
            Suppress a finding for this project. Suppressed rows drop from the
            panel above after the gateway accepts the request.
          </div>
          <table
            className="pf-v6-c-table pf-m-compact pf-m-grid-md"
            role="grid"
            style={{ width: '100%' }}
          >
            <thead>
              <tr role="row">
                <th role="columnheader">Rule</th>
                <th role="columnheader">Severity</th>
                <th role="columnheader">Message</th>
                <th role="columnheader">
                  <span className="pf-v6-screen-reader">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {openViolations.map(violation => (
                <tr key={violation.id} role="row">
                  <td role="cell">{violation.rule_id}</td>
                  <td role="cell">{violation.level}</td>
                  <td role="cell">{violation.message}</td>
                  <td role="cell">
                    <Button
                      variant="secondary"
                      size="sm"
                      isDisabled={pendingId === violation.id}
                      onClick={() => void onAcknowledge(violation)}
                    >
                      {pendingId === violation.id
                        ? 'Acknowledging…'
                        : 'Acknowledge'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </FlexItem>
      ) : null}
    </Flex>
  );
}
