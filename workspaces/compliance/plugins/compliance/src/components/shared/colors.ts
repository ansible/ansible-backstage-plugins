export const SURFACE_COLORS = {
  onDark: '#fff',
} as const;

export const SEVERITY_COLORS = {
  CAT_I: '#C9190B',
  CAT_II: '#F0AB00',
  CAT_III: '#0066CC',
} as const;

export const STATUS_COLORS = {
  success: '#3E8635',
  warning: '#F0AB00',
  error: '#C9190B',
  info: '#0066CC',
  neutral: '#6A6E73',
} as const;

export const EXECUTION_COLORS = {
  pending:   { bg: STATUS_COLORS.warning, fg: '#fff' },
  running:   { bg: STATUS_COLORS.info, fg: '#fff' },
  succeeded: { bg: STATUS_COLORS.success, fg: '#fff' },
  failed:    { bg: STATUS_COLORS.error, fg: '#fff' },
  cancelled: { bg: STATUS_COLORS.neutral, fg: '#fff' },
} as const;

export const PROFILE_STATUS_COLORS = {
  draft:    { bg: STATUS_COLORS.warning, fg: '#fff' },
  saved:    { bg: STATUS_COLORS.success, fg: '#fff' },
  archived: { bg: STATUS_COLORS.neutral, fg: '#fff' },
} as const;

export const FINDING_STATE_COLORS = {
  new:        { color: STATUS_COLORS.info, bgColor: 'transparent', variant: 'outlined' as const },
  active:     { color: STATUS_COLORS.neutral, bgColor: 'transparent', variant: 'outlined' as const },
  fixed:      { color: '#fff', bgColor: STATUS_COLORS.success, variant: 'default' as const },
  resurfaced: { color: STATUS_COLORS.error, bgColor: 'transparent', variant: 'outlined' as const },
} as const;

export const THRESHOLDS = {
  excellent: 90,
  good: 70,
} as const;

export function scoreColor(rate: number): string {
  if (rate >= THRESHOLDS.excellent) return STATUS_COLORS.success;
  if (rate >= THRESHOLDS.good) return STATUS_COLORS.warning;
  return STATUS_COLORS.error;
}
