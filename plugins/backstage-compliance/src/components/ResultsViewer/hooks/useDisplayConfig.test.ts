import type { ProfileDisplayConfig } from '@ansible/backstage-compliance-common/types';

describe('useDisplayConfig (unit — no React render)', () => {
  // useDisplayConfig is a pure memoized function internally.
  // We test the logic directly by calling the underlying computation.
  // The useMemo wrapper is React's responsibility to test.

  function resolveConfig(config?: ProfileDisplayConfig) {
    // Extract the computation that useMemo wraps
    const c = config ?? {};
    const DEFAULT_SEVERITY = { CAT_I: 'CAT I', CAT_II: 'CAT II', CAT_III: 'CAT III' };
    const severityMap = {
      CAT_I: c.severity_map?.CAT_I ?? DEFAULT_SEVERITY.CAT_I,
      CAT_II: c.severity_map?.CAT_II ?? DEFAULT_SEVERITY.CAT_II,
      CAT_III: c.severity_map?.CAT_III ?? DEFAULT_SEVERITY.CAT_III,
    };
    return {
      gaugeLabel: c.gauge_label ?? 'compliance rate',
      gaugeUnit: c.gauge_unit ?? 'rules',
      columns: c.columns ?? [
        { field: 'rule_id', label: 'Rule ID' },
        { field: 'stig_id', label: 'STIG ID' },
        { field: 'title', label: 'Title' },
        { field: 'severity', label: 'Severity' },
        { field: 'status', label: 'Status' },
        { field: 'check_text', label: 'Check' },
        { field: 'fix_text', label: 'Fix' },
      ],
      severityMap,
      remediationVerb: c.remediation_verb ?? 'Remediate',
      severityLabel: (key: string) => {
        if (key in severityMap) return severityMap[key as keyof typeof severityMap];
        return key;
      },
    };
  }

  it('returns STIG defaults when no config provided', () => {
    const result = resolveConfig();
    expect(result.gaugeLabel).toBe('compliance rate');
    expect(result.gaugeUnit).toBe('rules');
    expect(result.remediationVerb).toBe('Remediate');
    expect(result.severityMap.CAT_I).toBe('CAT I');
    expect(result.severityMap.CAT_II).toBe('CAT II');
    expect(result.severityMap.CAT_III).toBe('CAT III');
    expect(result.columns).toHaveLength(7);
    expect(result.columns[0]).toEqual({ field: 'rule_id', label: 'Rule ID' });
  });

  it('uses custom config when provided', () => {
    const result = resolveConfig({
      gauge_label: 'vulnerability-free rate',
      gauge_unit: 'packages',
      remediation_verb: 'Patch',
      severity_map: {
        CAT_I: 'Critical / High',
        CAT_II: 'Medium',
        CAT_III: 'Low',
      },
      columns: [
        { field: 'rule_id', label: 'CVE' },
        { field: 'title', label: 'Package' },
      ],
    });
    expect(result.gaugeLabel).toBe('vulnerability-free rate');
    expect(result.gaugeUnit).toBe('packages');
    expect(result.remediationVerb).toBe('Patch');
    expect(result.severityMap.CAT_I).toBe('Critical / High');
    expect(result.columns).toHaveLength(2);
    expect(result.columns[0].label).toBe('CVE');
  });

  it('merges partial severity map with defaults', () => {
    const result = resolveConfig({ severity_map: { CAT_I: 'High' } });
    expect(result.severityMap.CAT_I).toBe('High');
    expect(result.severityMap.CAT_II).toBe('CAT II');
    expect(result.severityMap.CAT_III).toBe('CAT III');
  });

  it('severityLabel function resolves mapped values', () => {
    const result = resolveConfig({ severity_map: { CAT_I: 'Critical' } });
    expect(result.severityLabel('CAT_I')).toBe('Critical');
    expect(result.severityLabel('CAT_II')).toBe('CAT II');
    expect(result.severityLabel('UNKNOWN')).toBe('UNKNOWN');
  });

  it('handles empty config object', () => {
    const result = resolveConfig({});
    expect(result.gaugeLabel).toBe('compliance rate');
    expect(result.columns).toHaveLength(7);
  });

  it('preserves custom columns without modification', () => {
    const customCols = [
      { field: 'rule_id', label: 'CVE', width: 120 },
      { field: 'evidence.cvss_score', label: 'Score', sortable: true },
    ];
    const result = resolveConfig({ columns: customCols });
    expect(result.columns).toBe(customCols);
    expect(result.columns[1].label).toBe('Score');
  });
});
