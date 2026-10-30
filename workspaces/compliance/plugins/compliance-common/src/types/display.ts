/**
 * Portable Display Configuration — allows compliance profiles to declare
 * how their data renders in the dashboard without hardcoded framework checks.
 *
 * Profiles ship a `display:` block in compliance-profile.yml. The frontend
 * reads this config and renders columns, labels, tabs, and widgets dynamically.
 * If no config is present, STIG defaults apply (backward-compatible fallback).
 */

/** A column definition for the findings table / ResultsViewer. */
export interface DisplayColumn {
  field: string;
  label: string;
  width?: number;
  sortable?: boolean;
}

/** Maps CFF severity categories to profile-specific display labels. */
export interface SeverityMap {
  CAT_I?: string;
  CAT_II?: string;
  CAT_III?: string;
}

/** Widget types available for Tier 1 tab composition. */
export type WidgetType =
  | 'summary_card'
  | 'severity_breakdown'
  | 'findings_table'
  | 'trend_chart'
  | 'gauge'
  | 'host_breakdown'
  | 'score_grid'
  | 'action_table'
  | 'host_risk_heatmap';

/** A widget instance declared in a tab layout. */
export interface TabWidget {
  widget: WidgetType;
  title?: string;
  metric?: string;
  unit?: string;
  label?: string;
  group_by?: string;
  labels?: Record<string, string>;
  columns?: DisplayColumn[];
  fixable_label?: string;
  unfixable_label?: string;
  actions?: TabWidgetAction[];
}

/** An action button declared on a widget (e.g., per-row download). */
export interface TabWidgetAction {
  type: 'download_artifact';
  artifact_key_prefix: string;
  label?: string;
  mime_type?: string;
  file_extension?: string;
}

/** Tier 2: custom React component bundled in the collection's backstage/ directory. */
export interface CustomComponentRef {
  bundle: string;
  export: string;
}

/** Tab configuration — either Tier 1 (widget layout) or Tier 2 (custom component). */
export interface TabConfig {
  label: string;
  icon?: string;
  layout?: TabWidget[];
  custom_component?: CustomComponentRef;
}

/** Export format specification — profiles declare available export formats. */
export interface ExportFormatSpec {
  key: string;
  label: string;
  description?: string;
  type: 'cff_derived' | 'artifact';
  artifact_key?: string;
  mime_type?: string;
  file_extension?: string;
}

/**
 * Score formula identifier — controls how the compliance gauge value
 * is computed. Profiles declare this to override the default pass-rate
 * calculation (e.g., supply chain uses vulnerability-free rate).
 *
 * - compliance_rate: pass / (pass + fail) — default, used by STIG/CIS
 * - vulnerability_free_rate: (total_rules - fail) / total_rules — for CVE scans
 *   where "pass" means "no known vulnerability" (supply chain)
 */
export type ScoreFormula = 'compliance_rate' | 'vulnerability_free_rate';

/** Top-level display configuration declared in compliance-profile.yml. */
export interface ProfileDisplayConfig {
  gauge_label?: string;
  gauge_unit?: string;
  score_formula?: ScoreFormula;
  columns?: DisplayColumn[];
  severity_map?: SeverityMap;
  remediation_verb?: string;
  tab?: TabConfig;
  export_formats?: ExportFormatSpec[];
}
