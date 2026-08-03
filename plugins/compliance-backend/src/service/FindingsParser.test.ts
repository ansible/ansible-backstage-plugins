import { LoggerService } from '@backstage/backend-plugin-api';
import { FindingsParser, buildRuleMetadataRecords } from './FindingsParser';
import type {
  StoredFinding,
  JobEvent,
  RuleMetadataRecord,
} from '@ansible/backstage-compliance-common';
import type { ComplianceDatabase } from '../database/ComplianceDatabase';

// ─── Mock factories ──────────────────────────────────────────────────

function createMockLogger(): LoggerService {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  } as unknown as LoggerService;
}

function createMockDatabase(
  overrides?: Partial<jest.Mocked<ComplianceDatabase>>,
): jest.Mocked<ComplianceDatabase> {
  return {
    getRuleMetadataBulk: jest.fn().mockResolvedValue(new Map()),
    ...overrides,
  } as unknown as jest.Mocked<ComplianceDatabase>;
}

function makeStoredFinding(overrides: Partial<StoredFinding> = {}): StoredFinding {
  return {
    id: 'f-1',
    scanId: 'scan-1',
    ruleId: 'sshd_set_idle_timeout',
    stigId: 'V-257844',
    host: 'web-01',
    status: 'fail',
    severity: 'CAT_II',
    actualValue: '900',
    expectedValue: '600',
    evidence: null,
    findingState: null,
    ...overrides,
  };
}

// ─── buildRuleMetadataRecords ────────────────────────────────────────

describe('buildRuleMetadataRecords', () => {
  it('builds metadata records from raw findings', () => {
    const raw = [
      { rule_id: 'r1', stig_id: 'V-001', title: 'Rule 1', severity: 'high', fix_text: '- name: fix\n  test: yes' },
      { rule_id: 'r2', stig_id: 'V-002', title: 'Rule 2', severity: 'medium' },
    ];
    const records = buildRuleMetadataRecords(raw);
    expect(records).toHaveLength(2);
    expect(records[0].ruleId).toBe('r1');
    expect(records[0].stigId).toBe('V-001');
    expect(records[1].ruleId).toBe('r2');
  });

  it('deduplicates by rule_id (keeps first occurrence)', () => {
    const raw = [
      { rule_id: 'r1', title: 'First' },
      { rule_id: 'r1', title: 'Second' },
    ];
    const records = buildRuleMetadataRecords(raw);
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe('First');
  });

  it('defaults disruption to medium and aapImpact to safe', () => {
    const records = buildRuleMetadataRecords([{ rule_id: 'r1' }]);
    expect(records[0].disruption).toBe('medium');
    expect(records[0].aapImpact).toBe('safe');
  });

  it('skips entries with no rule_id', () => {
    const records = buildRuleMetadataRecords([{ title: 'No ID' }]);
    expect(records).toHaveLength(0);
  });
});

// ─── FindingsParser.mapRawFinding ────────────────────────────────────

describe('FindingsParser.mapRawFinding', () => {
  let parser: FindingsParser;

  beforeEach(() => {
    parser = new FindingsParser(createMockLogger(), null);
  });

  it('maps severity: high → CAT_I', () => {
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'fail', severity: 'high' } as any,
      'host-1',
      'scan-1',
    );
    expect(result.severity).toBe('CAT_I');
  });

  it('maps severity: medium → CAT_II', () => {
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'fail', severity: 'medium' } as any,
      'host-1',
      'scan-1',
    );
    expect(result.severity).toBe('CAT_II');
  });

  it('maps severity: low → CAT_III', () => {
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'fail', severity: 'low' } as any,
      'host-1',
      'scan-1',
    );
    expect(result.severity).toBe('CAT_III');
  });

  it('passes through CAT_ prefixed severity unchanged', () => {
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'pass', severity: 'CAT_I' } as any,
      'host-1',
      'scan-1',
    );
    expect(result.severity).toBe('CAT_I');
  });

  it('defaults unknown severity to CAT_II', () => {
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'fail', severity: 'critical' } as any,
      'host-1',
      'scan-1',
    );
    expect(result.severity).toBe('CAT_II');
  });

  it('defaults missing severity to CAT_II', () => {
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'fail' } as any,
      'host-1',
      'scan-1',
    );
    expect(result.severity).toBe('CAT_II');
  });

  it('extracts string evidence directly', () => {
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'fail', evidence: 'some evidence text' } as any,
      'host-1',
      'scan-1',
    );
    expect(result.evidence).toBe('some evidence text');
  });

  it('JSON-stringifies object evidence', () => {
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'fail', evidence: { actual: 900, expected: 600 } } as any,
      'host-1',
      'scan-1',
    );
    expect(result.evidence).toBe('{"actual":900,"expected":600}');
  });

  it('sets evidence to null when missing', () => {
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'pass' } as any,
      'host-1',
      'scan-1',
    );
    expect(result.evidence).toBeNull();
  });

  it('uses explicit actual_value and expected_value fields', () => {
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'fail', actual_value: '0', expected_value: '600' } as any,
      'host-1',
      'scan-1',
    );
    expect(result.actualValue).toBe('0');
    expect(result.expectedValue).toBe('600');
  });

  it('extracts actual/expected from object evidence when fields are missing', () => {
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'fail', evidence: { actual: '0', expected: '600' } } as any,
      'host-1',
      'scan-1',
    );
    expect(result.actualValue).toBe('0');
    expect(result.expectedValue).toBe('600');
  });

  it('parses actual/expected from string evidence pattern', () => {
    const evidence = 'sshd_config clientaliveinterval: 0 (expected: 600)';
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'fail', evidence } as any,
      'host-1',
      'scan-1',
    );
    expect(result.actualValue).toBe('0');
    expect(result.expectedValue).toBe('600');
  });

  it('sets actualValue to (not set) when colon before paren yields empty', () => {
    const evidence = 'parameter: (expected: yes)';
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'fail', evidence } as any,
      'host-1',
      'scan-1',
    );
    expect(result.expectedValue).toBe('yes');
  });

  it('preserves scanId and host on mapped finding', () => {
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'pass' } as any,
      'web-01.example.com',
      'scan-42',
    );
    expect(result.scanId).toBe('scan-42');
    expect(result.host).toBe('web-01.example.com');
  });

  it('sets findingState to null on new findings', () => {
    const result = parser.mapRawFindingPublic(
      { rule_id: 'r1', status: 'pass' } as any,
      'host-1',
      'scan-1',
    );
    expect(result.findingState).toBeNull();
  });
});

// ─── FindingsParser.groupFindingsByRule ───────────────────────────────

describe('FindingsParser.groupFindingsByRule', () => {
  let parser: FindingsParser;

  beforeEach(() => {
    parser = new FindingsParser(createMockLogger(), null);
  });

  it('groups findings by ruleId', () => {
    const findings = [
      makeStoredFinding({ ruleId: 'r1', host: 'host-1' }),
      makeStoredFinding({ ruleId: 'r1', host: 'host-2' }),
      makeStoredFinding({ ruleId: 'r2', host: 'host-1' }),
    ];
    const grouped = parser.groupFindingsByRule(findings);
    expect(grouped.size).toBe(2);
    expect(grouped.get('r1')?.hosts).toHaveLength(2);
    expect(grouped.get('r2')?.hosts).toHaveLength(1);
  });

  it('deduplicates same host per rule', () => {
    const findings = [
      makeStoredFinding({ ruleId: 'r1', host: 'host-1', status: 'fail' }),
      makeStoredFinding({ ruleId: 'r1', host: 'host-1', status: 'pass' }),
    ];
    const grouped = parser.groupFindingsByRule(findings);
    expect(grouped.get('r1')?.hosts).toHaveLength(1);
    expect(grouped.get('r1')?.hosts[0].status).toBe('fail');
  });

  it('maps unknown status to error', () => {
    const findings = [
      makeStoredFinding({ ruleId: 'r1', host: 'host-1', status: 'notchecked' as any }),
    ];
    const grouped = parser.groupFindingsByRule(findings);
    expect(grouped.get('r1')?.hosts[0].status).toBe('error');
  });

  it('preserves findingState on hosts', () => {
    const findings = [
      makeStoredFinding({ ruleId: 'r1', host: 'host-1', findingState: 'new' }),
      makeStoredFinding({ ruleId: 'r1', host: 'host-2', findingState: 'fixed' }),
    ];
    const grouped = parser.groupFindingsByRule(findings);
    const hosts = grouped.get('r1')?.hosts ?? [];
    expect(hosts[0].findingState).toBe('new');
    expect(hosts[1].findingState).toBe('fixed');
  });
});

// ─── FindingsParser.buildMultiHostFindings ───────────────────────────

describe('FindingsParser.buildMultiHostFindings', () => {
  let parser: FindingsParser;

  beforeEach(() => {
    parser = new FindingsParser(createMockLogger(), null);
  });

  it('calculates pass/fail/naCount correctly', () => {
    const findings = [
      makeStoredFinding({ ruleId: 'r1', host: 'h1', status: 'pass' }),
      makeStoredFinding({ ruleId: 'r1', host: 'h2', status: 'fail' }),
      makeStoredFinding({ ruleId: 'r1', host: 'h3', status: 'not_applicable' }),
    ];
    const byRule = parser.groupFindingsByRule(findings);
    const multi = parser.buildMultiHostFindings(byRule, new Map());
    expect(multi).toHaveLength(1);
    expect(multi[0].passCount).toBe(1);
    expect(multi[0].failCount).toBe(1);
    expect(multi[0].naCount).toBe(1);
  });

  it('excludes N/A from totalCount (applicable hosts only)', () => {
    const findings = [
      makeStoredFinding({ ruleId: 'r1', host: 'h1', status: 'pass' }),
      makeStoredFinding({ ruleId: 'r1', host: 'h2', status: 'not_applicable' }),
    ];
    const byRule = parser.groupFindingsByRule(findings);
    const multi = parser.buildMultiHostFindings(byRule, new Map());
    expect(multi[0].totalCount).toBe(1);
  });

  it('aggregates stateSummary from host findingStates', () => {
    const findings = [
      makeStoredFinding({ ruleId: 'r1', host: 'h1', findingState: 'new' }),
      makeStoredFinding({ ruleId: 'r1', host: 'h2', findingState: 'active' }),
      makeStoredFinding({ ruleId: 'r1', host: 'h3', findingState: 'fixed' }),
      makeStoredFinding({ ruleId: 'r1', host: 'h4', findingState: 'resurfaced' }),
    ];
    const byRule = parser.groupFindingsByRule(findings);
    const multi = parser.buildMultiHostFindings(byRule, new Map());
    expect(multi[0].stateSummary).toEqual({ new: 1, active: 1, fixed: 1, resurfaced: 1 });
  });

  it('enriches with DB metadata when available', () => {
    const findings = [
      makeStoredFinding({ ruleId: 'r1', host: 'h1', severity: 'CAT_I' }),
    ];
    const dbMeta = new Map<string, RuleMetadataRecord>([
      ['r1', {
        ruleId: 'r1',
        stigId: 'V-999',
        title: 'DB Title',
        description: 'DB Description',
        checkText: 'DB Check',
        fixText: '- name: fix\n  test: yes',
        category: 'Network',
        disruption: 'high' as const,
        aapImpact: 'caution' as const,
        aapImpactReason: 'May disrupt SSH',
        scanner: 'openscap',
        updatedAt: '2026-01-01T00:00:00Z',
      }],
    ]);
    const byRule = parser.groupFindingsByRule(findings);
    const multi = parser.buildMultiHostFindings(byRule, dbMeta);
    expect(multi[0].title).toBe('DB Title');
    expect(multi[0].description).toBe('DB Description');
    expect(multi[0].category).toBe('Network');
    expect(multi[0].disruption).toBe('high');
    expect(multi[0].aapImpact).toBe('caution');
    expect(multi[0].automationAvailable).toBe(true);
  });

  it('detects automationAvailable from fixText YAML pattern', () => {
    const findings = [makeStoredFinding({ ruleId: 'r1', host: 'h1' })];
    const dbMeta = new Map<string, RuleMetadataRecord>([
      ['r1', {
        ruleId: 'r1', stigId: '', title: 'R1', description: '', checkText: '',
        fixText: 'Just a text description, no YAML',
        category: '', disruption: 'low' as const, aapImpact: 'safe' as const,
        aapImpactReason: '', scanner: 'openscap', updatedAt: '',
      }],
    ]);
    const byRule = parser.groupFindingsByRule(findings);
    const multi = parser.buildMultiHostFindings(byRule, dbMeta);
    expect(multi[0].automationAvailable).toBe(false);
  });

  it('falls back to finding data when no DB metadata', () => {
    const findings = [
      makeStoredFinding({ ruleId: 'r1', host: 'h1', stigId: 'V-100', severity: 'CAT_I' }),
    ];
    const byRule = parser.groupFindingsByRule(findings);
    const multi = parser.buildMultiHostFindings(byRule, new Map());
    expect(multi[0].stigId).toBe('V-100');
    expect(multi[0].title).toBe('r1');
    expect(multi[0].severity).toBe('CAT_I');
  });
});

// ─── FindingsParser.aggregateFindings (integration) ──────────────────

describe('FindingsParser.aggregateFindings', () => {
  let parser: FindingsParser;

  beforeEach(() => {
    parser = new FindingsParser(createMockLogger(), null);
  });

  it('filters out localhost findings', () => {
    const findings = [
      makeStoredFinding({ ruleId: 'r1', host: 'web-01' }),
      makeStoredFinding({ ruleId: 'r1', host: 'localhost' }),
    ];
    const result = parser.aggregateFindings(findings);
    expect(result[0].hosts).toHaveLength(1);
    expect(result[0].hosts[0].host).toBe('web-01');
  });

  it('returns empty array for empty input', () => {
    expect(parser.aggregateFindings([])).toEqual([]);
  });

  it('handles multiple rules across multiple hosts', () => {
    const findings = [
      makeStoredFinding({ ruleId: 'r1', host: 'h1', status: 'pass' }),
      makeStoredFinding({ ruleId: 'r1', host: 'h2', status: 'fail' }),
      makeStoredFinding({ ruleId: 'r2', host: 'h1', status: 'fail' }),
      makeStoredFinding({ ruleId: 'r2', host: 'h2', status: 'fail' }),
    ];
    const result = parser.aggregateFindings(findings);
    expect(result).toHaveLength(2);
    const r1 = result.find(r => r.ruleId === 'r1')!;
    const r2 = result.find(r => r.ruleId === 'r2')!;
    expect(r1.passCount).toBe(1);
    expect(r1.failCount).toBe(1);
    expect(r2.failCount).toBe(2);
  });
});

// ─── FindingsParser.aggregateFindingsWithMetadata (async) ────────────

describe('FindingsParser.aggregateFindingsWithMetadata', () => {
  it('fetches DB metadata and enriches findings', async () => {
    const db = createMockDatabase({
      getRuleMetadataBulk: jest.fn().mockResolvedValue(
        new Map([
          ['r1', {
            ruleId: 'r1', stigId: 'V-100', title: 'Enriched Title',
            description: '', checkText: '', fixText: '', category: '',
            disruption: 'low', aapImpact: 'safe', aapImpactReason: '',
            scanner: 'openscap', updatedAt: '',
          }],
        ]),
      ),
    });
    const parser = new FindingsParser(createMockLogger(), db);
    const findings = [makeStoredFinding({ ruleId: 'r1', host: 'h1' })];
    const result = await parser.aggregateFindingsWithMetadata(findings);
    expect(result[0].title).toBe('Enriched Title');
    expect(db.getRuleMetadataBulk).toHaveBeenCalledWith(['r1']);
  });

  it('handles DB failure gracefully (falls back to no metadata)', async () => {
    const db = createMockDatabase({
      getRuleMetadataBulk: jest.fn().mockRejectedValue(new Error('DB error')),
    });
    const parser = new FindingsParser(createMockLogger(), db);
    const findings = [makeStoredFinding({ ruleId: 'r1', host: 'h1' })];
    const result = await parser.aggregateFindingsWithMetadata(findings);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('r1');
  });

  it('works without database (null)', async () => {
    const parser = new FindingsParser(createMockLogger(), null);
    const findings = [makeStoredFinding({ ruleId: 'r1', host: 'h1' })];
    const result = await parser.aggregateFindingsWithMetadata(findings);
    expect(result).toHaveLength(1);
  });
});

// ─── FindingsParser.parseJobEvents ───────────────────────────────────

describe('FindingsParser.parseJobEvents', () => {
  let parser: FindingsParser;

  beforeEach(() => {
    parser = new FindingsParser(createMockLogger(), null);
  });

  function makeEvent(overrides: Partial<JobEvent> = {}): JobEvent {
    return {
      id: 1,
      event: 'runner_on_ok',
      host_name: 'web-01',
      event_data: {
        host: 'web-01',
        res: {
          findings: [
            { rule_id: 'r1', status: 'fail', severity: 'high' },
          ],
        },
      },
      ...overrides,
    } as unknown as JobEvent;
  }

  it('parses findings from res.findings (legacy path)', () => {
    const events = [makeEvent()];
    const results = parser.parseJobEvents(events, 'scan-1');
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe('r1');
    expect(results[0].host).toBe('web-01');
    expect(results[0].scanId).toBe('scan-1');
  });

  it('parses findings from res.ansible_facts.findings', () => {
    const events = [makeEvent({
      event_data: {
        host: 'web-01',
        res: {
          ansible_facts: {
            findings: [{ rule_id: 'r2', status: 'pass', severity: 'low' }],
          },
        },
      },
    } as any)];
    const results = parser.parseJobEvents(events, 'scan-2');
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe('r2');
  });

  it('parses findings from res.ansible_facts.compliance_results.findings', () => {
    const events = [makeEvent({
      event_data: {
        host: 'db-01',
        res: {
          ansible_facts: {
            compliance_results: {
              findings: [{ rule_id: 'r3', status: 'fail', severity: 'medium' }],
            },
          },
        },
      },
    } as any)];
    const results = parser.parseJobEvents(events, 'scan-3');
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe('r3');
    expect(results[0].host).toBe('db-01');
  });

  it('skips events with no res field', () => {
    const events = [makeEvent({
      event_data: { host: 'web-01' },
    } as any)];
    const results = parser.parseJobEvents(events, 'scan-1');
    expect(results).toHaveLength(0);
  });

  it('skips events with no findings', () => {
    const events = [makeEvent({
      event_data: { host: 'web-01', res: { changed: false } },
    } as any)];
    const results = parser.parseJobEvents(events, 'scan-1');
    expect(results).toHaveLength(0);
  });

  it('uses raw.host if available (Track A per-host)', () => {
    const events = [makeEvent({
      event_data: {
        host: 'localhost',
        res: {
          findings: [{ rule_id: 'r1', status: 'fail', host: 'actual-host-01' }],
        },
      },
    } as any)];
    const results = parser.parseJobEvents(events, 'scan-1');
    expect(results[0].host).toBe('actual-host-01');
  });

  it('handles multiple events with multiple findings each', () => {
    const events = [
      makeEvent({
        event_data: {
          host: 'h1',
          res: {
            findings: [
              { rule_id: 'r1', status: 'pass', severity: 'low' },
              { rule_id: 'r2', status: 'fail', severity: 'high' },
            ],
          },
        },
      } as any),
      makeEvent({
        event_data: {
          host: 'h2',
          res: {
            findings: [
              { rule_id: 'r1', status: 'fail', severity: 'low' },
            ],
          },
        },
      } as any),
    ];
    const results = parser.parseJobEvents(events, 'scan-1');
    expect(results).toHaveLength(3);
  });

  it('falls back to host_name when event_data.host is missing', () => {
    const events = [makeEvent({
      host_name: 'from-host-name',
      event_data: {
        res: {
          findings: [{ rule_id: 'r1', status: 'pass' }],
        },
      },
    } as any)];
    const results = parser.parseJobEvents(events, 'scan-1');
    expect(results[0].host).toBe('from-host-name');
  });
});
