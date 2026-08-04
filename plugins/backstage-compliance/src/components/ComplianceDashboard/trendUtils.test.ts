import {
  detectEvents,
  buildMultiProfileSeries,
  buildFilteredSeries,
} from './trendUtils';
import type { PostureSnapshot } from '@ansible/backstage-compliance-common/types';

function snap(
  overrides: Partial<PostureSnapshot> & {
    compliancePct: number;
    timestamp: string;
  },
): PostureSnapshot {
  return {
    id: `snap-${Math.random().toString(36).slice(2, 8)}`,
    profileId: 'prof-1',
    totalHosts: 10,
    totalRules: 100,
    passCount: Math.round(overrides.compliancePct),
    failCount: 100 - Math.round(overrides.compliancePct),
    ...overrides,
  };
}

describe('detectEvents', () => {
  it('marks first point as normal with zero delta', () => {
    const result = detectEvents([
      snap({ compliancePct: 80, timestamp: '2026-06-01T00:00:00Z' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].eventType).toBe('normal');
    expect(result[0].delta).toBe(0);
  });

  it('detects regression when score drops >= 3pp', () => {
    const result = detectEvents([
      snap({ compliancePct: 80, timestamp: '2026-06-01T00:00:00Z' }),
      snap({ compliancePct: 77, timestamp: '2026-06-02T00:00:00Z' }),
    ]);
    expect(result[1].eventType).toBe('regression');
    expect(result[1].delta).toBe(-3);
  });

  it('detects regression at exactly -3pp threshold', () => {
    const result = detectEvents([
      snap({ compliancePct: 80, timestamp: '2026-06-01T00:00:00Z' }),
      snap({ compliancePct: 77, timestamp: '2026-06-02T00:00:00Z' }),
    ]);
    expect(result[1].eventType).toBe('regression');
  });

  it('does NOT flag regression at -2pp (below threshold)', () => {
    const result = detectEvents([
      snap({ compliancePct: 80, timestamp: '2026-06-01T00:00:00Z' }),
      snap({ compliancePct: 78, timestamp: '2026-06-02T00:00:00Z' }),
    ]);
    expect(result[1].eventType).toBe('normal');
  });

  it('detects improvement when score improves >= 5pp', () => {
    const result = detectEvents([
      snap({ compliancePct: 70, timestamp: '2026-06-01T00:00:00Z' }),
      snap({ compliancePct: 75, timestamp: '2026-06-02T00:00:00Z' }),
    ]);
    expect(result[1].eventType).toBe('improvement');
    expect(result[1].delta).toBe(5);
  });

  it('does NOT flag improvement at +4pp (below threshold)', () => {
    const result = detectEvents([
      snap({ compliancePct: 70, timestamp: '2026-06-01T00:00:00Z' }),
      snap({ compliancePct: 74, timestamp: '2026-06-02T00:00:00Z' }),
    ]);
    expect(result[1].eventType).toBe('normal');
  });

  it('handles alternating ups and downs', () => {
    const result = detectEvents([
      snap({ compliancePct: 80, timestamp: '2026-06-01T00:00:00Z' }),
      snap({ compliancePct: 70, timestamp: '2026-06-02T00:00:00Z' }),
      snap({ compliancePct: 85, timestamp: '2026-06-03T00:00:00Z' }),
      snap({ compliancePct: 80, timestamp: '2026-06-04T00:00:00Z' }),
    ]);
    expect(result[0].eventType).toBe('normal');
    expect(result[1].eventType).toBe('regression');
    expect(result[2].eventType).toBe('improvement');
    expect(result[3].eventType).toBe('regression'); // 85→80 = -5pp
  });

  it('returns empty array for empty input', () => {
    expect(detectEvents([])).toEqual([]);
  });

  it('converts timestamps to epoch milliseconds', () => {
    const result = detectEvents([
      snap({ compliancePct: 80, timestamp: '2026-06-01T12:00:00Z' }),
    ]);
    expect(result[0].timestamp).toBe(
      new Date('2026-06-01T12:00:00Z').getTime(),
    );
  });

  it('preserves scanId for navigation', () => {
    const result = detectEvents([
      snap({
        compliancePct: 80,
        timestamp: '2026-06-01T00:00:00Z',
        scanId: 'scan-abc',
      }),
    ]);
    expect(result[0].scanId).toBe('scan-abc');
  });
});

describe('buildMultiProfileSeries', () => {
  const profileMap = new Map([
    ['prof-stig', 'DISA STIG'],
    ['prof-cis', 'CIS L1'],
  ]);

  it('groups snapshots by profileId', () => {
    const snapshots = [
      snap({
        profileId: 'prof-stig',
        compliancePct: 80,
        timestamp: '2026-06-01T00:00:00Z',
      }),
      snap({
        profileId: 'prof-cis',
        compliancePct: 90,
        timestamp: '2026-06-01T00:00:00Z',
      }),
      snap({
        profileId: 'prof-stig',
        compliancePct: 85,
        timestamp: '2026-06-02T00:00:00Z',
      }),
    ];
    const { data, profileIds } = buildMultiProfileSeries(snapshots, profileMap);
    expect(profileIds).toContain('prof-stig');
    expect(profileIds).toContain('prof-cis');
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it('fills forward last known value for profiles without data at a timestamp', () => {
    const snapshots = [
      snap({
        profileId: 'prof-stig',
        compliancePct: 80,
        timestamp: '2026-06-01T00:00:00Z',
      }),
      snap({
        profileId: 'prof-cis',
        compliancePct: 90,
        timestamp: '2026-06-02T00:00:00Z',
      }),
      snap({
        profileId: 'prof-stig',
        compliancePct: 85,
        timestamp: '2026-06-03T00:00:00Z',
      }),
    ];
    const { data } = buildMultiProfileSeries(snapshots, profileMap);
    const lastRow = data[data.length - 1];
    expect(lastRow['prof-stig']).toBe(85);
    expect(lastRow['prof-cis']).toBe(90);
  });

  it('returns empty data for no matching profiles', () => {
    const { data, profileIds } = buildMultiProfileSeries(
      [
        snap({
          profileId: 'unknown',
          compliancePct: 50,
          timestamp: '2026-06-01T00:00:00Z',
        }),
      ],
      profileMap,
    );
    expect(data).toEqual([]);
    expect(profileIds).toEqual([]);
  });

  it('handles single profile', () => {
    const snapshots = [
      snap({
        profileId: 'prof-stig',
        compliancePct: 80,
        timestamp: '2026-06-01T00:00:00Z',
      }),
      snap({
        profileId: 'prof-stig',
        compliancePct: 85,
        timestamp: '2026-06-02T00:00:00Z',
      }),
    ];
    const { data, profileIds } = buildMultiProfileSeries(snapshots, profileMap);
    expect(profileIds).toEqual(['prof-stig']);
    expect(data).toHaveLength(2);
    expect(data[0]['prof-stig']).toBe(80);
    expect(data[1]['prof-stig']).toBe(85);
  });

  it('handles empty input', () => {
    const { data, profileIds } = buildMultiProfileSeries([], profileMap);
    expect(data).toEqual([]);
    expect(profileIds).toEqual([]);
  });
});

describe('buildFilteredSeries', () => {
  it('groups by profileId when groupByInventory is false', () => {
    const seriesMap = new Map([
      ['prof-stig', 'DISA STIG'],
      ['prof-cis', 'CIS L1'],
    ]);
    const snapshots = [
      snap({
        profileId: 'prof-stig',
        compliancePct: 80,
        timestamp: '2026-06-01T00:00:00Z',
        inventoryId: 1,
      }),
      snap({
        profileId: 'prof-cis',
        compliancePct: 90,
        timestamp: '2026-06-01T00:00:00Z',
        inventoryId: 1,
      }),
      snap({
        profileId: 'prof-stig',
        compliancePct: 85,
        timestamp: '2026-06-02T00:00:00Z',
        inventoryId: 2,
      }),
    ];
    const { data, seriesIds } = buildFilteredSeries(
      snapshots,
      seriesMap,
      false,
    );
    expect(seriesIds).toContain('prof-stig');
    expect(seriesIds).toContain('prof-cis');
    expect(data.length).toBeGreaterThanOrEqual(2);
    expect(data[data.length - 1]['prof-stig']).toBe(85);
  });

  it('groups by composite key when groupByInventory is true', () => {
    const seriesMap = new Map([
      ['prof-stig:1', 'DISA STIG - Prod'],
      ['prof-stig:2', 'DISA STIG - Staging'],
    ]);
    const snapshots = [
      snap({
        profileId: 'prof-stig',
        compliancePct: 80,
        timestamp: '2026-06-01T00:00:00Z',
        inventoryId: 1,
      }),
      snap({
        profileId: 'prof-stig',
        compliancePct: 70,
        timestamp: '2026-06-01T00:00:00Z',
        inventoryId: 2,
      }),
      snap({
        profileId: 'prof-stig',
        compliancePct: 85,
        timestamp: '2026-06-02T00:00:00Z',
        inventoryId: 1,
      }),
    ];
    const { data, seriesIds } = buildFilteredSeries(snapshots, seriesMap, true);
    expect(seriesIds).toEqual(
      expect.arrayContaining(['prof-stig:1', 'prof-stig:2']),
    );
    expect(data[data.length - 1]['prof-stig:1']).toBe(85);
    expect(data[data.length - 1]['prof-stig:2']).toBe(70);
  });

  it('forward-fills last known value across composite series', () => {
    const seriesMap = new Map([
      ['prof-stig:1', 'DISA STIG - Prod'],
      ['prof-cis:1', 'CIS - Prod'],
    ]);
    const snapshots = [
      snap({
        profileId: 'prof-stig',
        compliancePct: 80,
        timestamp: '2026-06-01T00:00:00Z',
        inventoryId: 1,
      }),
      snap({
        profileId: 'prof-cis',
        compliancePct: 90,
        timestamp: '2026-06-02T00:00:00Z',
        inventoryId: 1,
      }),
      snap({
        profileId: 'prof-stig',
        compliancePct: 85,
        timestamp: '2026-06-03T00:00:00Z',
        inventoryId: 1,
      }),
    ];
    const { data } = buildFilteredSeries(snapshots, seriesMap, true);
    const lastRow = data[data.length - 1];
    expect(lastRow['prof-stig:1']).toBe(85);
    expect(lastRow['prof-cis:1']).toBe(90);
  });

  it('filters out series not in seriesMap', () => {
    const seriesMap = new Map([['prof-stig', 'DISA STIG']]);
    const snapshots = [
      snap({
        profileId: 'prof-stig',
        compliancePct: 80,
        timestamp: '2026-06-01T00:00:00Z',
      }),
      snap({
        profileId: 'prof-unknown',
        compliancePct: 50,
        timestamp: '2026-06-01T00:00:00Z',
      }),
    ];
    const { seriesIds } = buildFilteredSeries(snapshots, seriesMap, false);
    expect(seriesIds).toEqual(['prof-stig']);
  });

  it('returns empty for empty input', () => {
    const { data, seriesIds } = buildFilteredSeries([], new Map(), false);
    expect(data).toEqual([]);
    expect(seriesIds).toEqual([]);
  });

  it('returns empty when no series match', () => {
    const snapshots = [
      snap({
        profileId: 'prof-stig',
        compliancePct: 80,
        timestamp: '2026-06-01T00:00:00Z',
      }),
    ];
    const { data, seriesIds } = buildFilteredSeries(
      snapshots,
      new Map(),
      false,
    );
    expect(data).toEqual([]);
    expect(seriesIds).toEqual([]);
  });

  it('stopped series does not forward-fill past its last data point', () => {
    const seriesMap = new Map([
      ['prof-stig', 'DISA STIG'],
      ['prof-cis', 'CIS L1'],
    ]);
    const snapshots = [
      snap({
        profileId: 'prof-stig',
        compliancePct: 80,
        timestamp: '2026-06-01T00:00:00Z',
      }),
      snap({
        profileId: 'prof-cis',
        compliancePct: 90,
        timestamp: '2026-06-01T00:00:00Z',
      }),
      snap({
        profileId: 'prof-stig',
        compliancePct: 85,
        timestamp: '2026-06-03T00:00:00Z',
      }),
    ];
    const stopped = new Set(['prof-cis']);
    const { data } = buildFilteredSeries(snapshots, seriesMap, false, stopped);
    const lastRow = data[data.length - 1];
    expect(lastRow['prof-stig']).toBe(85);
    expect(lastRow['prof-cis']).toBeUndefined();
  });

  it('non-stopped series forward-fills normally', () => {
    const seriesMap = new Map([
      ['prof-stig', 'DISA STIG'],
      ['prof-cis', 'CIS L1'],
    ]);
    const snapshots = [
      snap({
        profileId: 'prof-stig',
        compliancePct: 80,
        timestamp: '2026-06-01T00:00:00Z',
      }),
      snap({
        profileId: 'prof-cis',
        compliancePct: 90,
        timestamp: '2026-06-01T00:00:00Z',
      }),
      snap({
        profileId: 'prof-stig',
        compliancePct: 85,
        timestamp: '2026-06-03T00:00:00Z',
      }),
    ];
    const { data } = buildFilteredSeries(snapshots, seriesMap, false);
    const lastRow = data[data.length - 1];
    expect(lastRow['prof-stig']).toBe(85);
    expect(lastRow['prof-cis']).toBe(90);
  });

  it('empty stoppedSeriesIds behaves like not passing it', () => {
    const seriesMap = new Map([['prof-stig', 'DISA STIG']]);
    const snapshots = [
      snap({
        profileId: 'prof-stig',
        compliancePct: 80,
        timestamp: '2026-06-01T00:00:00Z',
      }),
      snap({
        profileId: 'prof-stig',
        compliancePct: 85,
        timestamp: '2026-06-02T00:00:00Z',
      }),
    ];
    const { data } = buildFilteredSeries(
      snapshots,
      seriesMap,
      false,
      new Set(),
    );
    expect(data).toHaveLength(2);
    expect(data[1]['prof-stig']).toBe(85);
  });
});
