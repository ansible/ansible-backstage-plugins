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

import type { Severity } from './types';

export type SeverityLevel =
  'critical' | 'error' | 'high' | 'medium' | 'low' | 'info';

export interface ViolationCountsBySeverity {
  critical: number;
  error: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export type FixType = 'auto' | 'ai' | 'manual';

export interface SeverityStyle {
  background: string;
  text: string;
  sortOrder: number;
  label: string;
}

export interface FixTypeStyle {
  background: string;
  text: string;
  label: string;
  tooltip: string;
}

export const SEVERITY_STYLES: Record<SeverityLevel, SeverityStyle> = {
  critical: {
    background: '#a30000',
    text: '#ffffff',
    sortOrder: 0,
    label: 'Critical',
  },
  error: {
    background: '#c9190b',
    text: '#ffffff',
    sortOrder: 1,
    label: 'Error',
  },
  high: {
    background: '#f56a00',
    text: '#ffffff',
    sortOrder: 2,
    label: 'High',
  },
  medium: {
    background: '#c58c00',
    text: '#ffffff',
    sortOrder: 3,
    label: 'Medium',
  },
  low: { background: '#2b9af3', text: '#ffffff', sortOrder: 4, label: 'Low' },
  info: { background: '#6a6e73', text: '#ffffff', sortOrder: 5, label: 'Info' },
};

export const FIX_TYPE_STYLES: Record<FixType, FixTypeStyle> = {
  auto: {
    background: '#4caf50',
    text: '#ffffff',
    label: 'Auto-fix',
    tooltip:
      'Auto-generated fix available at scan — applied when you run Generate fixes',
  },
  ai: {
    background: '#2196f3',
    text: '#ffffff',
    label: 'AI candidate',
    tooltip:
      'AI tier at scan — Generate fixes may produce a proposal for your review',
  },
  manual: {
    background: '#6a6e73',
    text: '#ffffff',
    label: 'Manual review',
    tooltip:
      'Manual at scan — auto-generated fixes may still apply; hand-edit in Dev Spaces if not',
  },
};

const APME_TO_PORTAL_SEVERITY: Record<string, SeverityLevel> = {
  critical: 'critical',
  fatal: 'critical',
  blocker: 'critical',
  error: 'error',
  high: 'high',
  very_high: 'high',
  medium: 'medium',
  warning: 'medium',
  warn: 'medium',
  low: 'low',
  very_low: 'low',
  info: 'info',
  none: 'info',
  unspecified: 'medium',
};

/** ADR-043 severity order (worst first) for filters and summaries. */
export const SEVERITY_ORDER: SeverityLevel[] = [
  'critical',
  'error',
  'high',
  'medium',
  'low',
  'info',
];

const REMEDIATION_CLASS_TO_FIX_TYPE: Record<number, FixType> = {
  1: 'auto',
  2: 'ai',
  3: 'manual',
};

const REMEDIATION_CLASS_STRING_TO_NUMBER: Record<string, number> = {
  'auto-fixable': 1,
  'ai-candidate': 2,
  'manual-review': 3,
};

// Category labels as shown in the live portal prototype
export const APME_CATEGORY_MAP: Record<string, string> = {
  lint: 'Lint',
  modernize: 'Modernize',
  risk: 'Risk',
  secrets: 'Secrets',
  dependencies: 'Dependencies',
  aap: 'Modernize', // AAP compat = modernize
};

export function normalizeSeverity(level: string): SeverityLevel {
  return APME_TO_PORTAL_SEVERITY[level.toLowerCase()] ?? 'medium';
}

/** Aggregate raw gateway severity keys into ADR-043 portal buckets. */
export function normalizeSeverityBreakdown(
  breakdown: Record<string, number> | undefined,
): ViolationCountsBySeverity {
  const result: ViolationCountsBySeverity = {
    critical: 0,
    error: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  if (!breakdown) {
    return result;
  }
  for (const [level, count] of Object.entries(breakdown)) {
    if (!count) {
      continue;
    }
    const bucket = normalizeSeverity(level);
    result[bucket] += count;
  }
  return result;
}

/** Highest non-zero severity bucket for fleet/repo violation summaries. */
export function getWorstViolationLevel(counts: ViolationCountsBySeverity): {
  level: SeverityLevel;
  count: number;
} {
  if (counts.critical > 0) {
    return { level: 'critical', count: counts.critical };
  }
  if (counts.error > 0) {
    return { level: 'error', count: counts.error };
  }
  if (counts.high > 0) {
    return { level: 'high', count: counts.high };
  }
  if (counts.medium > 0) {
    return { level: 'medium', count: counts.medium };
  }
  if (counts.low > 0) {
    return { level: 'low', count: counts.low };
  }
  if (counts.info > 0) {
    return { level: 'info', count: counts.info };
  }
  return { level: 'medium', count: 0 };
}

export function resolveViolationCounts(project: {
  violationCounts?: ViolationCountsBySeverity;
  severity_breakdown?: Record<string, number>;
}): ViolationCountsBySeverity {
  if (project.violationCounts) {
    return project.violationCounts;
  }
  return normalizeSeverityBreakdown(project.severity_breakdown);
}

export function severityColor(level: string): string {
  return SEVERITY_STYLES[normalizeSeverity(level)].background;
}

export function severityLabel(level: string): string {
  return SEVERITY_STYLES[normalizeSeverity(level)].label;
}

export function severitySortOrder(level: string): number {
  return SEVERITY_STYLES[normalizeSeverity(level)].sortOrder;
}

/** Normalizes gateway remediation class (proto int or engine string) to portal 1/2/3. */
export function normalizeRemediationClass(value: unknown): number {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    if (value >= 1 && value <= 3) {
      return value;
    }
    return 3;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    const mapped = REMEDIATION_CLASS_STRING_TO_NUMBER[trimmed];
    if (mapped !== undefined) {
      return mapped;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 3) {
      return parsed;
    }
  }
  return 3;
}

export function remediationClassToFixType(
  remClass: number,
): FixType | undefined {
  return REMEDIATION_CLASS_TO_FIX_TYPE[normalizeRemediationClass(remClass)];
}

/** Maps engine remediation class to UI fix type, respecting portal AI toggle. */
export function effectiveFixType(
  remClass: number,
  enableAi: boolean,
): FixType | undefined {
  const base = remediationClassToFixType(normalizeRemediationClass(remClass));
  if (base === 'ai' && !enableAi) {
    return 'manual';
  }
  return base;
}

/** True when scan classification allows auto or AI proposal generation in the UI. */
export function isFixableViolation(
  remClass: number,
  enableAi: boolean,
): boolean {
  const ft = effectiveFixType(remClass, enableAi);
  return ft === 'auto' || ft === 'ai';
}

/** True when a proposal requires explicit user approval (AI tier). */
export function proposalNeedsManualApproval(
  remClass: number,
  enableAi: boolean,
): boolean {
  return effectiveFixType(remClass, enableAi) === 'ai';
}

export function fixMethodLabel(fixType: FixType | undefined): string {
  if (fixType === 'auto') {
    return 'Auto-fix';
  }
  if (fixType === 'ai') {
    return 'AI candidate';
  }
  return 'Manual review';
}

/** Tooltip for fix-method column (scan classification, not post-remediate status). */
export function fixMethodTooltip(fixType: FixType | undefined): string {
  if (!fixType) {
    return FIX_TYPE_STYLES.manual.tooltip;
  }
  return FIX_TYPE_STYLES[fixType].tooltip;
}

/** Short fix-tier label for fleet repo rows (design: QualityOverviewContent). */
export function fixTierShortLabel(remClass: number, enableAi: boolean): string {
  const fixType = effectiveFixType(remClass, enableAi);
  if (fixType === 'auto') {
    return 'Auto-fix';
  }
  if (fixType === 'ai') {
    return 'AI candidate';
  }
  return 'Manual review';
}

export function categoryLabel(apmeCategory: string): string {
  return APME_CATEGORY_MAP[apmeCategory] ?? apmeCategory;
}

/** Proto severity enum values from APME gateway (ADR-043). */
const SEVERITY_LABEL_TO_PROTO: Record<string, number> = {
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  error: 5,
  critical: 6,
  blocker: 6,
};

const SEVERITY_PROTO_TO_LABEL: SeverityLevel[] = [
  'medium',
  'info',
  'low',
  'medium',
  'high',
  'error',
  'critical',
];

/** Map portal severity label to gateway proto int for rule config overrides. */
export function severityLabelToProto(label: string): number {
  const normalized = label.toLowerCase();
  return SEVERITY_LABEL_TO_PROTO[normalized] ?? 3;
}

/** Map gateway proto int to portal severity label. */
export function severityProtoToLabel(value: number): SeverityLevel {
  const index = Math.min(
    Math.max(value, 0),
    SEVERITY_PROTO_TO_LABEL.length - 1,
  );
  return SEVERITY_PROTO_TO_LABEL[index] ?? 'medium';
}

/** Map violation/UI severity labels to catalog Rule severity (no separate "error"). */
export function severityLevelToCatalogSeverity(level: SeverityLevel): Severity {
  if (level === 'error') {
    return 'critical';
  }
  return level;
}
