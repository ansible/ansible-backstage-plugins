import { useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  FindingSeverity,
  FindingState,
  MultiHostFinding,
} from '@ansible/backstage-compliance-common/types';

const severityOrder: Record<FindingSeverity, number> = {
  CAT_I: 0,
  CAT_II: 1,
  CAT_III: 2,
};

export interface FindingsFilters {
  severity: string;
  status: string;
  state: string;
  disruption: string;
  aap: string;
  comparison: string;
  search: string;
  host: string;
}

export interface FindingsFilterResult {
  filtered: MultiHostFinding[];
  filters: FindingsFilters;
  updateFilter: (key: string, value: string) => void;
  activeFilterCount: number;
  clearAll: () => void;
}

export function useFindingsFilter(
  findings: MultiHostFinding[],
  comparisonMap?: Map<string, 'improved' | 'regressed' | 'unchanged'>,
): FindingsFilterResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: FindingsFilters = useMemo(
    () => ({
      severity: searchParams.get('severity') || 'all',
      status: searchParams.get('status') || 'all',
      state: searchParams.get('state') || 'all',
      disruption: searchParams.get('disruption') || 'all',
      aap: searchParams.get('aap') || 'all',
      comparison: searchParams.get('comparison') || 'all',
      search: searchParams.get('q') || '',
      host: searchParams.get('host') || 'all',
    }),
    [searchParams],
  );

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams);
      if (value === 'all' || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const clearAll = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set('q', filters.search);
    setSearchParams(params, { replace: true });
  }, [filters.search, setSearchParams]);

  const filtered = useMemo(
    () =>
      findings
        .filter(
          f => filters.severity === 'all' || f.severity === filters.severity,
        )
        .filter(f => {
          if (filters.status === 'all') return true;
          if (filters.status === 'fail') return f.failCount > 0;
          if (filters.status === 'pass') return f.failCount === 0;
          return true;
        })
        .filter(f => {
          if (filters.state === 'all') return true;
          if (!f.stateSummary) return false;
          return (f.stateSummary[filters.state as FindingState] ?? 0) > 0;
        })
        .filter(
          f =>
            filters.disruption === 'all' || f.disruption === filters.disruption,
        )
        .filter(f => filters.aap === 'all' || f.aapImpact === filters.aap)
        .filter(f => {
          if (filters.comparison === 'all' || !comparisonMap) return true;
          return comparisonMap.get(f.ruleId) === filters.comparison;
        })
        .filter(
          f =>
            filters.host === 'all' ||
            f.hosts.some(h => h.host === filters.host),
        )
        .filter(
          f =>
            filters.search === '' ||
            f.title.toLowerCase().includes(filters.search.toLowerCase()) ||
            f.stigId.toLowerCase().includes(filters.search.toLowerCase()),
        )
        .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]),
    [findings, filters, comparisonMap],
  );

  const activeFilterCount = [
    filters.severity,
    filters.status,
    filters.state,
    filters.disruption,
    filters.aap,
    filters.comparison,
    filters.host,
  ].filter(f => f !== 'all').length;

  return { filtered, filters, updateFilter, activeFilterCount, clearAll };
}
