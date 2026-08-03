import { LoggerService } from '@backstage/backend-plugin-api';
import { DashboardAggregator, DashboardServiceDeps } from './DashboardAggregator';
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

function createMockDatabase(): jest.Mocked<ComplianceDatabase> {
  return {
    getLatestScanPerProfileInventory: jest.fn().mockResolvedValue([]),
    getRecentScans: jest.fn().mockResolvedValue([]),
    listProfiles: jest.fn().mockResolvedValue([]),
    getAggregatedStatsByScanIds: jest.fn().mockResolvedValue(new Map()),
    getAllBaselineTargets: jest.fn().mockResolvedValue([]),
    getBaselineScoresBatch: jest.fn().mockResolvedValue(new Map()),
    getPostureHistory: jest.fn().mockResolvedValue([]),
    getRemediationProfile: jest.fn().mockResolvedValue(null),
    getBaselineScore: jest.fn().mockResolvedValue({ passCount: 0, failCount: 0 }),
  } as unknown as jest.Mocked<ComplianceDatabase>;
}

function createMockService(overrides?: Partial<DashboardServiceDeps>): jest.Mocked<DashboardServiceDeps> {
  return {
    getInventories: jest.fn().mockResolvedValue([]),
    getRemediationProfile: jest.fn().mockResolvedValue(null),
    getDataSource: jest.fn().mockReturnValue('live'),
    ...overrides,
  } as jest.Mocked<DashboardServiceDeps>;
}

function createAggregator(dbOverrides?: Partial<jest.Mocked<ComplianceDatabase>>, svcOverrides?: Partial<DashboardServiceDeps>) {
  const logger = createMockLogger();
  const db = createMockDatabase();
  Object.assign(db, dbOverrides);
  const service = createMockService(svcOverrides);
  const aggregator = new DashboardAggregator(logger, db, service);
  return { aggregator, logger, db, service };
}

// Mock scan fixture
function makeScan(id: string, profileId: string, inventoryId: number, extra?: Record<string, unknown>) {
  return {
    id,
    profileId,
    inventoryId,
    scanner: 'oscap',
    scanType: 'assessment',
    status: 'completed',
    startedAt: '2026-06-01T00:00:00Z',
    completedAt: '2026-06-01T00:10:00Z',
    ...extra,
  };
}

// Mock profile fixture
function makeProfile(id: string, displayName: string) {
  return { id, displayName, framework: 'DISA_STIG', platform: 'RHEL 9' };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('DashboardAggregator', () => {
  describe('getDashboardStats', () => {
    it('returns MockDataProvider data when dataSource is mock', async () => {
      const { aggregator, db } = createAggregator(undefined, {
        getDataSource: jest.fn().mockReturnValue('mock'),
      });
      const stats = await aggregator.getDashboardStats();
      expect(stats.hostsScanned).toBeGreaterThan(0);
      expect(db.getLatestScanPerProfileInventory).not.toHaveBeenCalled();
    });

    it('returns zeroed stats when no scans exist', async () => {
      const { aggregator } = createAggregator();
      const stats = await aggregator.getDashboardStats();
      expect(stats.hostsScanned).toBe(0);
      expect(stats.criticalFindings).toBe(0);
      expect(stats.pendingRemediation).toBe(0);
      expect(stats.frameworkScores).toEqual([]);
      expect(stats.byInventory).toEqual([]);
    });

    it('computes hostsScanned from unique host set', async () => {
      const scan = makeScan('s1', 'rhel9-stig', 1);
      const batchStats = new Map([
        ['s1', { pass: 300, fail: 66, catI: 5, hosts: ['web-01', 'web-02', 'db-01'], rules: new Set(['r1', 'r2']) }],
      ]);
      const { aggregator } = createAggregator({
        getLatestScanPerProfileInventory: jest.fn().mockResolvedValue([scan]),
        listProfiles: jest.fn().mockResolvedValue([makeProfile('rhel9-stig', 'DISA STIG')]),
        getAggregatedStatsByScanIds: jest.fn().mockResolvedValue(batchStats),
      });
      const stats = await aggregator.getDashboardStats();
      expect(stats.hostsScanned).toBe(3);
    });

    it('computes criticalFindings and pendingRemediation', async () => {
      const scan = makeScan('s1', 'rhel9-stig', 1);
      const batchStats = new Map([
        ['s1', { pass: 300, fail: 66, catI: 12, hosts: ['h1'], rules: new Set(['r1']) }],
      ]);
      const { aggregator } = createAggregator({
        getLatestScanPerProfileInventory: jest.fn().mockResolvedValue([scan]),
        listProfiles: jest.fn().mockResolvedValue([makeProfile('rhel9-stig', 'STIG')]),
        getAggregatedStatsByScanIds: jest.fn().mockResolvedValue(batchStats),
      });
      const stats = await aggregator.getDashboardStats();
      expect(stats.criticalFindings).toBe(12);
      expect(stats.pendingRemediation).toBe(66);
    });

    it('computes frameworkScores with correct pass rate', async () => {
      const scan = makeScan('s1', 'rhel9-stig', 1);
      const batchStats = new Map([
        ['s1', { pass: 285, fail: 81, catI: 0, hosts: ['h1'], rules: new Set(['r1', 'r2']) }],
      ]);
      const { aggregator } = createAggregator({
        getLatestScanPerProfileInventory: jest.fn().mockResolvedValue([scan]),
        listProfiles: jest.fn().mockResolvedValue([makeProfile('rhel9-stig', 'DISA STIG V2R8')]),
        getAggregatedStatsByScanIds: jest.fn().mockResolvedValue(batchStats),
      });
      const stats = await aggregator.getDashboardStats();
      expect(stats.frameworkScores).toHaveLength(1);
      expect(stats.frameworkScores[0].name).toBe('DISA STIG V2R8');
      expect(stats.frameworkScores[0].rate).toBe(77.9);
      expect(stats.frameworkScores[0].passCount).toBe(285);
      expect(stats.frameworkScores[0].failCount).toBe(81);
    });

    it('aggregates stats across multiple inventories for same profile', async () => {
      const scans = [
        makeScan('s1', 'rhel9-stig', 1),
        makeScan('s2', 'rhel9-stig', 2),
      ];
      const batchStats = new Map([
        ['s1', { pass: 100, fail: 50, catI: 2, hosts: ['h1', 'h2'], rules: new Set(['r1', 'r2']) }],
        ['s2', { pass: 80, fail: 20, catI: 1, hosts: ['h3'], rules: new Set(['r1', 'r3']) }],
      ]);
      const { aggregator } = createAggregator({
        getLatestScanPerProfileInventory: jest.fn().mockResolvedValue(scans),
        listProfiles: jest.fn().mockResolvedValue([makeProfile('rhel9-stig', 'STIG')]),
        getAggregatedStatsByScanIds: jest.fn().mockResolvedValue(batchStats),
      });
      const stats = await aggregator.getDashboardStats();
      expect(stats.hostsScanned).toBe(3);
      expect(stats.criticalFindings).toBe(3);
      expect(stats.frameworkScores[0].passCount).toBe(180);
      expect(stats.frameworkScores[0].failCount).toBe(70);
      expect(stats.byInventory).toHaveLength(2);
    });

    it('builds byInventory view with per-profile scores', async () => {
      const scans = [
        makeScan('s1', 'rhel9-stig', 1),
        makeScan('s2', 'rhel9-cis', 1),
      ];
      const batchStats = new Map([
        ['s1', { pass: 300, fail: 66, catI: 0, hosts: ['h1'], rules: new Set(['r1']) }],
        ['s2', { pass: 150, fail: 39, catI: 0, hosts: ['h1'], rules: new Set(['r2']) }],
      ]);
      const { aggregator } = createAggregator({
        getLatestScanPerProfileInventory: jest.fn().mockResolvedValue(scans),
        listProfiles: jest.fn().mockResolvedValue([
          makeProfile('rhel9-stig', 'STIG'),
          makeProfile('rhel9-cis', 'CIS'),
        ]),
        getAggregatedStatsByScanIds: jest.fn().mockResolvedValue(batchStats),
      });
      const stats = await aggregator.getDashboardStats();
      expect(stats.byInventory).toHaveLength(1);
      expect(stats.byInventory[0].profileScores).toHaveLength(2);
    });

    it('maps inventory names from service, falls back to ID', async () => {
      const scans = [makeScan('s1', 'p1', 99)];
      const batchStats = new Map([
        ['s1', { pass: 10, fail: 0, catI: 0, hosts: ['h1'], rules: new Set(['r1']) }],
      ]);
      const { aggregator } = createAggregator({
        getLatestScanPerProfileInventory: jest.fn().mockResolvedValue(scans),
        listProfiles: jest.fn().mockResolvedValue([makeProfile('p1', 'Profile')]),
        getAggregatedStatsByScanIds: jest.fn().mockResolvedValue(batchStats),
      });
      const stats = await aggregator.getDashboardStats();
      expect(stats.byInventory[0].inventoryName).toBe('Inventory 99');
    });

    it('uses inventory names when service returns them', async () => {
      const scans = [makeScan('s1', 'p1', 5)];
      const batchStats = new Map([
        ['s1', { pass: 10, fail: 0, catI: 0, hosts: ['h1'], rules: new Set(['r1']) }],
      ]);
      const { aggregator } = createAggregator(
        {
          getLatestScanPerProfileInventory: jest.fn().mockResolvedValue(scans),
          listProfiles: jest.fn().mockResolvedValue([makeProfile('p1', 'Profile')]),
          getAggregatedStatsByScanIds: jest.fn().mockResolvedValue(batchStats),
        },
        {
          getInventories: jest.fn().mockResolvedValue([{ id: 5, name: 'production-servers', hostCount: 10 }]),
        },
      );
      const stats = await aggregator.getDashboardStats();
      expect(stats.byInventory[0].inventoryName).toBe('production-servers');
    });

    it('computes deltas when previous scans exist', async () => {
      const scan = makeScan('s1', 'p1', 1);
      const prevScan = makeScan('s-prev', 'p1', 1, { completedAt: '2026-05-31T00:00:00Z' });
      const batchStats = new Map([
        ['s1', { pass: 300, fail: 66, catI: 5, hosts: ['h1'], rules: new Set(['r1']) }],
        ['s-prev', { pass: 280, fail: 86, catI: 8, hosts: ['h1'], rules: new Set(['r1']) }],
      ]);
      const { aggregator } = createAggregator({
        getLatestScanPerProfileInventory: jest.fn().mockResolvedValue([scan]),
        getRecentScans: jest.fn().mockResolvedValue([scan, prevScan]),
        listProfiles: jest.fn().mockResolvedValue([makeProfile('p1', 'STIG')]),
        getAggregatedStatsByScanIds: jest.fn().mockResolvedValue(batchStats),
      });
      const stats = await aggregator.getDashboardStats();
      expect(stats.criticalFindingsDelta).toBe(-3);
      expect(stats.pendingRemediationDelta).toBe(-20);
    });

    it('omits delta fields when no previous scans', async () => {
      const scan = makeScan('s1', 'p1', 1);
      const batchStats = new Map([
        ['s1', { pass: 10, fail: 5, catI: 1, hosts: ['h1'], rules: new Set(['r1']) }],
      ]);
      const { aggregator } = createAggregator({
        getLatestScanPerProfileInventory: jest.fn().mockResolvedValue([scan]),
        getRecentScans: jest.fn().mockResolvedValue([scan]),
        listProfiles: jest.fn().mockResolvedValue([makeProfile('p1', 'STIG')]),
        getAggregatedStatsByScanIds: jest.fn().mockResolvedValue(batchStats),
      });
      const stats = await aggregator.getDashboardStats();
      expect(stats.criticalFindingsDelta).toBeUndefined();
      expect(stats.pendingRemediationDelta).toBeUndefined();
    });

    it('sets passRate to 0 for remediation scanner entries in recent scans', async () => {
      const remScan = makeScan('s-rem', 'p1', 1, { scanner: 'remediation' });
      const { aggregator } = createAggregator({
        getRecentScans: jest.fn().mockResolvedValue([remScan]),
        listProfiles: jest.fn().mockResolvedValue([makeProfile('p1', 'STIG')]),
      });
      const stats = await aggregator.getDashboardStats();
      const remEntry = stats.recentScans.find(s => s.scanner === 'remediation');
      expect(remEntry?.passRate).toBe(0);
    });

    it('returns empty stats when database throws', async () => {
      const { aggregator, logger } = createAggregator({
        getLatestScanPerProfileInventory: jest.fn().mockRejectedValue(new Error('DB down')),
      });
      const stats = await aggregator.getDashboardStats();
      expect(stats.hostsScanned).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Dashboard stats aggregation failed'));
    });

    it('continues when inventory fetch fails', async () => {
      const scan = makeScan('s1', 'p1', 1);
      const batchStats = new Map([
        ['s1', { pass: 10, fail: 5, catI: 0, hosts: ['h1'], rules: new Set(['r1']) }],
      ]);
      const { aggregator, logger } = createAggregator(
        {
          getLatestScanPerProfileInventory: jest.fn().mockResolvedValue([scan]),
          listProfiles: jest.fn().mockResolvedValue([makeProfile('p1', 'STIG')]),
          getAggregatedStatsByScanIds: jest.fn().mockResolvedValue(batchStats),
        },
        {
          getInventories: jest.fn().mockRejectedValue(new Error('Controller down')),
        },
      );
      const stats = await aggregator.getDashboardStats();
      expect(stats.hostsScanned).toBe(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch inventories'));
    });

    it('enriches byInventory scores with baseline data', async () => {
      const scan = makeScan('s1', 'p1', 1);
      const batchStats = new Map([
        ['s1', { pass: 300, fail: 66, catI: 0, hosts: ['h1'], rules: new Set(['r1']) }],
      ]);
      const baselines = [{ id: 'bt-1', remediationProfileId: 'rp-1', complianceProfileId: 'p1', inventoryId: 1, pinnedAt: '2026-06-01' }];
      const baselineScores = new Map([['p1::1', { passCount: 8, failCount: 2 }]]);
      const remProfile = {
        id: 'rp-1', name: 'My Baseline', selections: [
          { ruleId: 'r1', enabled: true },
          { ruleId: 'r2', enabled: true },
        ],
      };
      const { aggregator } = createAggregator(
        {
          getLatestScanPerProfileInventory: jest.fn().mockResolvedValue([scan]),
          listProfiles: jest.fn().mockResolvedValue([makeProfile('p1', 'STIG')]),
          getAggregatedStatsByScanIds: jest.fn().mockResolvedValue(batchStats),
          getAllBaselineTargets: jest.fn().mockResolvedValue(baselines),
          getBaselineScoresBatch: jest.fn().mockResolvedValue(baselineScores),
        },
        {
          getRemediationProfile: jest.fn().mockResolvedValue(remProfile),
        },
      );
      const stats = await aggregator.getDashboardStats();
      const invScore = stats.byInventory[0]?.profileScores[0];
      expect(invScore?.baseline).toBeDefined();
      expect(invScore?.baseline?.rate).toBe(80);
      expect(invScore?.baseline?.remediationProfileName).toBe('My Baseline');
    });
  });

  // ── Posture history ────────────────────────────────────────────────

  describe('getPostureHistory', () => {
    it('returns MockDataProvider data in mock mode', async () => {
      const { aggregator, db } = createAggregator(undefined, {
        getDataSource: jest.fn().mockReturnValue('mock'),
      });
      await aggregator.getPostureHistory('p1', 30);
      expect(db.getPostureHistory).not.toHaveBeenCalled();
    });

    it('delegates to database in live mode', async () => {
      const snapshots = [{ id: 'snap-1', profileId: 'p1', rate: 80, timestamp: '2026-06-01' }];
      const { aggregator, db } = createAggregator({
        getPostureHistory: jest.fn().mockResolvedValue(snapshots),
      });
      const result = await aggregator.getPostureHistory('p1', 30);
      expect(db.getPostureHistory).toHaveBeenCalledWith('p1', 30);
      expect(result).toEqual(snapshots);
    });
  });

  // ── Baseline scores for profile ────────────────────────────────────

  describe('getBaselineScoresForProfile', () => {
    it('returns empty array when remediation profile not found', async () => {
      const { aggregator } = createAggregator({
        getRemediationProfile: jest.fn().mockResolvedValue(null),
      });
      const result = await aggregator.getBaselineScoresForProfile('rp-missing');
      expect(result).toEqual([]);
    });

    it('returns empty array when no enabled selections', async () => {
      const { aggregator } = createAggregator({
        getRemediationProfile: jest.fn().mockResolvedValue({
          id: 'rp-1', selections: [{ ruleId: 'r1', enabled: false }],
        }),
      });
      const result = await aggregator.getBaselineScoresForProfile('rp-1');
      expect(result).toEqual([]);
    });

    it('returns empty array when no baseline pins exist', async () => {
      const { aggregator } = createAggregator({
        getRemediationProfile: jest.fn().mockResolvedValue({
          id: 'rp-1', selections: [{ ruleId: 'r1', enabled: true }],
        }),
        getAllBaselineTargets: jest.fn().mockResolvedValue([]),
      });
      const result = await aggregator.getBaselineScoresForProfile('rp-1');
      expect(result).toEqual([]);
    });

    it('computes per-inventory scores from latest scans', async () => {
      const { aggregator } = createAggregator({
        getRemediationProfile: jest.fn().mockResolvedValue({
          id: 'rp-1', selections: [
            { ruleId: 'r1', enabled: true },
            { ruleId: 'r2', enabled: true },
          ],
        }),
        getAllBaselineTargets: jest.fn().mockResolvedValue([
          { remediationProfileId: 'rp-1', complianceProfileId: 'p1', inventoryId: 1 },
        ]),
        getLatestScanPerProfileInventory: jest.fn().mockResolvedValue([
          makeScan('s1', 'p1', 1),
        ]),
        getBaselineScore: jest.fn().mockResolvedValue({ passCount: 8, failCount: 2 }),
      });
      const result = await aggregator.getBaselineScoresForProfile('rp-1');
      expect(result).toHaveLength(1);
      expect(result[0].inventoryId).toBe(1);
      expect(result[0].passRate).toBe(80);
      expect(result[0].passCount).toBe(8);
      expect(result[0].failCount).toBe(2);
    });

    it('skips inventories with no matching scan', async () => {
      const { aggregator } = createAggregator({
        getRemediationProfile: jest.fn().mockResolvedValue({
          id: 'rp-1', selections: [{ ruleId: 'r1', enabled: true }],
        }),
        getAllBaselineTargets: jest.fn().mockResolvedValue([
          { remediationProfileId: 'rp-1', complianceProfileId: 'p1', inventoryId: 99 },
        ]),
        getLatestScanPerProfileInventory: jest.fn().mockResolvedValue([]),
      });
      const result = await aggregator.getBaselineScoresForProfile('rp-1');
      expect(result).toEqual([]);
    });
  });
});
