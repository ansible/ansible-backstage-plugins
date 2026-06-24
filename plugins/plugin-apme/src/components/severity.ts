export const SEVERITY_ORDER = [
  'critical',
  'error',
  'high',
  'medium',
  'low',
  'info',
] as const;

export const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  error: 'Error',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

export const SEVERITY_INT_TO_API: Record<number, string> = {
  0: 'info',
  1: 'info',
  2: 'low',
  3: 'medium',
  4: 'high',
  5: 'error',
  6: 'critical',
};

export const SEVERITY_INT_OPTIONS: { value: number; label: string }[] = [
  { value: 6, label: 'Critical' },
  { value: 5, label: 'Error' },
  { value: 4, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 2, label: 'Low' },
  { value: 1, label: 'Info' },
];

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  error: 1,
  high: 2,
  medium: 3,
  low: 4,
  info: 5,
};

export function severityClass(level: string, ruleId?: string): string {
  if (ruleId?.startsWith('SEC')) return 'critical';
  const l = level.toLowerCase();
  if (l === 'fatal' || l === 'critical') return 'critical';
  if (l === 'error') return 'error';
  if (l === 'very_high' || l === 'high') return 'high';
  if (l === 'medium') return 'medium';
  if (['warning', 'warn'].includes(l)) return 'medium';
  if (l === 'low') return 'low';
  if (['very_low', 'info', 'none'].includes(l)) return 'info';
  return 'info';
}

export function severityLabel(level: string, ruleId?: string): string {
  if (ruleId?.startsWith('SEC')) return 'CRITICAL';
  const cls = severityClass(level, ruleId);
  return SEVERITY_LABELS[cls]?.toUpperCase() ?? 'INFO';
}

export function severityOrder(cls: string): number {
  return SEVERITY_RANK[cls] ?? 6;
}

export const SEVERITY_COLORS: Record<string, string> = {
  critical: '#a30000',
  error: '#c9190b',
  high: '#ec7a08',
  medium: '#f0ab00',
  low: '#3e8635',
  info: '#2b9af3',
};

export function severityColor(level: string, ruleId?: string): string {
  return SEVERITY_COLORS[severityClass(level, ruleId)] ?? '#6a6e73';
}

export function healthColor(score: number): string {
  if (score < 25) return '#c9190b';
  if (score < 50) return '#ec7a08';
  if (score < 75) return '#f0ab00';
  return '#3e8635';
}

export const SCOPE_LABELS: Record<number, string> = {
  1: 'Task',
  2: 'Block',
  3: 'Play',
  4: 'Playbook',
  5: 'Role',
  6: 'Inventory',
  7: 'Collection',
};

export function scopeLabel(scope: number | undefined): string {
  return scope !== undefined ? SCOPE_LABELS[scope] || '' : '';
}

export const FIX_LABELS: Record<number, string> = {
  1: 'Fixable',
  2: 'AI',
  3: 'Manual',
  4: 'AI Tried',
};

export function fixLabel(rc: number | undefined): string {
  return rc !== undefined ? FIX_LABELS[rc] || '' : '';
}

export function bareRuleId(ruleId: string): string {
  const idx = ruleId.indexOf(':');
  if (idx > 0 && idx < ruleId.length - 1) return ruleId.slice(idx + 1);
  return ruleId;
}
