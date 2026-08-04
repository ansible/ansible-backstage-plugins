import { useMemo } from 'react';
import type {
  ProfileDisplayConfig,
  DisplayColumn,
  SeverityMap,
  ScoreFormula,
} from '@ansible/backstage-compliance-common/types';

const DEFAULT_COLUMNS: DisplayColumn[] = [
  { field: 'rule_id', label: 'Rule ID' },
  { field: 'stig_id', label: 'STIG ID' },
  { field: 'title', label: 'Title' },
  { field: 'severity', label: 'Severity' },
  { field: 'status', label: 'Status' },
  { field: 'check_text', label: 'Check' },
  { field: 'fix_text', label: 'Fix' },
];

const DEFAULT_SEVERITY_MAP: Required<SeverityMap> = {
  CAT_I: 'CAT I',
  CAT_II: 'CAT II',
  CAT_III: 'CAT III',
};

const DEFAULTS = {
  gauge_label: 'compliance rate',
  gauge_unit: 'rules',
  columns: DEFAULT_COLUMNS,
  severity_map: DEFAULT_SEVERITY_MAP,
  remediation_verb: 'Remediate',
};

export interface ResolvedDisplayConfig {
  gaugeLabel: string;
  gaugeUnit: string;
  scoreFormula: ScoreFormula;
  columns: DisplayColumn[];
  severityMap: Required<SeverityMap>;
  remediationVerb: string;
  severityLabel: (key: string) => string;
  computeScore: (
    pass: number,
    fail: number,
    total: number,
    scanMeta?: {
      totalScannedPackages?: number;
      totalVulnerablePackages?: number;
    },
  ) => number;
}

export function useDisplayConfig(
  displayConfig?: ProfileDisplayConfig,
): ResolvedDisplayConfig {
  return useMemo(() => {
    const config = displayConfig ?? {};

    const severityMap: Required<SeverityMap> = {
      CAT_I: config.severity_map?.CAT_I ?? DEFAULT_SEVERITY_MAP.CAT_I,
      CAT_II: config.severity_map?.CAT_II ?? DEFAULT_SEVERITY_MAP.CAT_II,
      CAT_III: config.severity_map?.CAT_III ?? DEFAULT_SEVERITY_MAP.CAT_III,
    };

    const scoreFormula: ScoreFormula =
      config.score_formula ?? 'compliance_rate';

    const computeScore = (
      pass: number,
      fail: number,
      total: number,
      scanMeta?: {
        totalScannedPackages?: number;
        totalVulnerablePackages?: number;
      },
    ): number => {
      if (scoreFormula === 'vulnerability_free_rate') {
        const scanned = scanMeta?.totalScannedPackages;
        const vulnerable = scanMeta?.totalVulnerablePackages;
        if (scanned && scanned > 0 && vulnerable !== undefined) {
          return Math.round(((scanned - vulnerable) / scanned) * 1000) / 10;
        }
        return total > 0 ? Math.round(((total - fail) / total) * 1000) / 10 : 0;
      }
      const sum = pass + fail;
      return sum > 0 ? Math.round((pass / sum) * 1000) / 10 : 0;
    };

    return {
      gaugeLabel: config.gauge_label ?? DEFAULTS.gauge_label,
      gaugeUnit: config.gauge_unit ?? DEFAULTS.gauge_unit,
      scoreFormula,
      columns: config.columns ?? DEFAULTS.columns,
      severityMap,
      remediationVerb: config.remediation_verb ?? DEFAULTS.remediation_verb,
      severityLabel: (key: string) => {
        if (key in severityMap) return severityMap[key as keyof SeverityMap]!;
        return key;
      },
      computeScore,
    };
  }, [displayConfig]);
}
