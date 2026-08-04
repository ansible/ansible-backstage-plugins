/**
 * DashboardAggregator — computes dashboard statistics and posture history.
 *
 * Extracted from ComplianceService to isolate the 280-line dashboard
 * aggregation logic.
 */
import { LoggerService } from '@backstage/backend-plugin-api';

import type {
  DashboardStats,
  PostureSnapshot,
  RemediationProfile,
  InventoryPosture,
  ScoreFormula,
} from '@ansible/backstage-compliance-common';

function computeRate(
  pass: number,
  fail: number,
  total: number,
  formula: ScoreFormula = 'compliance_rate',
  scanMeta?: {
    totalScannedPackages?: number;
    totalVulnerablePackages?: number;
  },
): number {
  if (formula === 'vulnerability_free_rate') {
    const scanned = scanMeta?.totalScannedPackages;
    const vulnerable = scanMeta?.totalVulnerablePackages;
    if (scanned && scanned > 0 && vulnerable !== undefined) {
      return Math.round(((scanned - vulnerable) / scanned) * 1000) / 10;
    }
    return total > 0 ? Math.round(((total - fail) / total) * 1000) / 10 : 0;
  }
  const sum = pass + fail;
  return sum > 0 ? Math.round((pass / sum) * 1000) / 10 : 0;
}

import { ComplianceDatabase } from '../database/ComplianceDatabase';
import { MockDataProvider } from './MockDataProvider';

/**
 * Minimal interface for the ComplianceService methods that
 * DashboardAggregator needs. Avoids a circular import by
 * depending on a narrow contract instead of the full class.
 */
export interface DashboardServiceDeps {
  getInventories(
    token?: string,
  ): Promise<Array<{ id: number; name: string; hostCount: number }>>;
  getRemediationProfile(id: string): Promise<RemediationProfile | null>;
  getDataSource(): 'mock' | 'live';
}

export class DashboardAggregator {
  private readonly logger: LoggerService;
  private readonly database: ComplianceDatabase;
  private readonly service: DashboardServiceDeps;

  constructor(
    logger: LoggerService,
    database: ComplianceDatabase,
    service: DashboardServiceDeps,
  ) {
    this.logger = logger;
    this.database = database;
    this.service = service;
  }

  // ─── Dashboard ──────────────────────────────────────────────────────

  async getDashboardStats(): Promise<DashboardStats> {
    if (this.service.getDataSource() === 'mock') {
      const profiles = await this.database.listProfiles();
      if (profiles.length === 0) {
        return MockDataProvider.getDashboardStats();
      }
    }

    const empty: DashboardStats = {
      hostsScanned: 0,
      criticalFindings: 0,
      pendingRemediation: 0,
      activeProfiles: 0,
      recentScans: [],
      frameworkScores: [],
      postureStatus: [],
      byInventory: [],
    };

    try {
      // Fetch latest scan per (profileId, inventoryId) directly from DB —
      // no arbitrary limit, so profiles don't disappear when remediation
      // noise pushes them out of a "recent N" window.
      const postureScans =
        await this.database.getLatestScanPerProfileInventory();
      const recentScans = await this.database.getRecentScans(8);
      const profiles = await this.database.listProfiles();

      const inventoryNameMap = new Map<number, string>();
      try {
        const inventories = await this.service.getInventories();
        for (const inv of inventories) {
          inventoryNameMap.set(inv.id, inv.name);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to fetch inventories: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      // postureScans already contains only the latest per (profileId, inventoryId)
      const latestByProfileInventory = new Map<
        string,
        (typeof postureScans)[0]
      >();
      for (const scan of postureScans) {
        const key = `${scan.profileId}::${scan.inventoryId}`;
        latestByProfileInventory.set(key, scan);
      }

      // For deltas, find the second-latest scan per group by excluding
      // the latest IDs from the same per-profile-inventory query results.
      const allPostureScans = await this.database.getRecentScans(50);
      const completedAssessments = allPostureScans.filter(
        s => s.status === 'completed' && s.scanner !== 'remediation',
      );
      const latestIds = new Set(
        Array.from(latestByProfileInventory.values()).map(s => s.id),
      );
      const previousByProfileInventory = new Map<
        string,
        (typeof postureScans)[0]
      >();
      for (const scan of completedAssessments) {
        if (latestIds.has(scan.id)) continue;
        const key = `${scan.profileId}::${scan.inventoryId}`;
        if (!previousByProfileInventory.has(key)) {
          previousByProfileInventory.set(key, scan);
        }
      }

      // Batch-fetch aggregated stats for all needed scans in a single query
      const allScanIds = new Set<string>();
      for (const scan of latestByProfileInventory.values())
        allScanIds.add(scan.id);
      for (const scan of previousByProfileInventory.values())
        allScanIds.add(scan.id);
      recentScans.forEach(s => {
        if (s.status === 'completed' && s.scanner !== 'remediation')
          allScanIds.add(s.id);
      });
      const batchStats = await this.database.getAggregatedStatsByScanIds(
        Array.from(allScanIds),
      );

      const hostsSet = new Set<string>();
      let criticalFindings = 0;
      let pendingRemediation = 0;

      const profileAgg = new Map<
        string,
        {
          pass: number;
          fail: number;
          totalPackages: number;
          totalScannedPackages: number;
          totalVulnerablePackages: number;
          rules: Set<string>;
          lastScan: string;
          contributing: Array<{
            scan: (typeof postureScans)[0];
            pass: number;
            fail: number;
            rules: number;
            totalPackages?: number;
            totalScannedPackages?: number;
            totalVulnerablePackages?: number;
          }>;
        }
      >();

      const inventoryProfileStats = new Map<
        string,
        {
          profileId: string;
          inventoryId: number;
          pass: number;
          fail: number;
          totalPackages?: number;
          totalScannedPackages?: number;
          totalVulnerablePackages?: number;
        }
      >();

      for (const scan of latestByProfileInventory.values()) {
        const stats = batchStats.get(scan.id);
        if (!stats) continue;

        const { pass, fail, catI, hosts, rules: ruleIds } = stats;
        for (const h of hosts) hostsSet.add(h);
        pendingRemediation += fail;
        criticalFindings += catI;

        const agg = profileAgg.get(scan.profileId) ?? {
          pass: 0,
          fail: 0,
          totalPackages: 0,
          totalScannedPackages: 0,
          totalVulnerablePackages: 0,
          rules: new Set<string>(),
          lastScan: '',
          contributing: [],
        };
        agg.pass += pass;
        agg.fail += fail;
        agg.totalPackages += stats.totalPackages ?? 0;
        agg.totalScannedPackages += stats.totalScannedPackages ?? 0;
        agg.totalVulnerablePackages += stats.totalVulnerablePackages ?? 0;
        for (const r of ruleIds) agg.rules.add(r);
        const scanTs = scan.completedAt || scan.startedAt;
        if (!agg.lastScan || scanTs > agg.lastScan) agg.lastScan = scanTs;
        agg.contributing.push({
          scan,
          pass,
          fail,
          rules: ruleIds.size,
          totalPackages: stats.totalPackages,
          totalScannedPackages: stats.totalScannedPackages,
          totalVulnerablePackages: stats.totalVulnerablePackages,
        });
        profileAgg.set(scan.profileId, agg);

        inventoryProfileStats.set(`${scan.profileId}::${scan.inventoryId}`, {
          profileId: scan.profileId,
          inventoryId: scan.inventoryId,
          pass,
          fail,
          totalPackages: stats.totalPackages,
          totalScannedPackages: stats.totalScannedPackages,
          totalVulnerablePackages: stats.totalVulnerablePackages,
        });
      }

      const profileNameMap = new Map(profiles.map(p => [p.id, p.displayName]));
      const profileFormulaMap = new Map(
        profiles.map(p => [
          p.id,
          (p.displayConfig?.score_formula ?? 'compliance_rate') as ScoreFormula,
        ]),
      );
      const TARGET_THRESHOLD = 80;

      const frameworkScores: DashboardStats['frameworkScores'] = profiles.map(
        p => {
          const agg = profileAgg.get(p.id);
          const formula = profileFormulaMap.get(p.id) ?? 'compliance_rate';
          let total = 0;
          if (formula === 'vulnerability_free_rate' && agg?.totalPackages) {
            total = agg.totalPackages;
          } else if (agg) {
            total = agg.pass + agg.fail;
          }
          const aggMeta = agg
            ? {
                totalScannedPackages: agg.totalScannedPackages,
                totalVulnerablePackages: agg.totalVulnerablePackages,
              }
            : undefined;
          const rate = computeRate(
            agg?.pass ?? 0,
            agg?.fail ?? 0,
            total,
            formula,
            aggMeta,
          );
          const contributingScans = (agg?.contributing ?? []).map(c => {
            const cTotal =
              formula === 'vulnerability_free_rate' && c.totalPackages
                ? c.totalPackages
                : c.pass + c.fail;
            const cMeta = {
              totalScannedPackages: c.totalScannedPackages,
              totalVulnerablePackages: c.totalVulnerablePackages,
            };
            return {
              scanId: c.scan.id,
              workflowJobId: c.scan.workflowJobId ?? undefined,
              inventoryId: c.scan.inventoryId,
              inventoryName:
                inventoryNameMap.get(c.scan.inventoryId) ||
                `Inventory ${c.scan.inventoryId}`,
              passRate: computeRate(c.pass, c.fail, cTotal, formula, cMeta),
              passCount: c.pass,
              failCount: c.fail,
              ruleCount: c.rules,
              timestamp: c.scan.completedAt || c.scan.startedAt,
            };
          });
          return {
            profileId: p.id,
            name: p.displayName,
            target: p.platform || 'RHEL 9',
            rules: agg?.rules.size ?? 0,
            rate,
            passCount: agg?.pass ?? 0,
            failCount: agg?.fail ?? 0,
            lastScan: agg?.lastScan ?? '',
            contributingScans,
          };
        },
      );

      const postureStatus = frameworkScores.map(fw => ({
        profileId: fw.profileId,
        name: fw.name,
        rate: fw.rate,
        aboveTarget: fw.rate >= TARGET_THRESHOLD,
      }));

      // Build by-inventory view
      const inventoryIds = new Set<number>();
      for (const scan of latestByProfileInventory.values()) {
        inventoryIds.add(scan.inventoryId);
      }
      const byInventory: InventoryPosture[] = Array.from(inventoryIds)
        .map(invId => ({
          inventoryId: invId,
          inventoryName: inventoryNameMap.get(invId) || `Inventory ${invId}`,
          profileScores: profiles
            .map(p => {
              const stats = inventoryProfileStats.get(`${p.id}::${invId}`);
              if (!stats) return null;
              const pFormula = profileFormulaMap.get(p.id) ?? 'compliance_rate';
              const total =
                pFormula === 'vulnerability_free_rate' && stats.totalPackages
                  ? stats.totalPackages
                  : stats.pass + stats.fail;
              const pMeta = {
                totalScannedPackages: stats.totalScannedPackages,
                totalVulnerablePackages: stats.totalVulnerablePackages,
              };
              return {
                profileId: p.id,
                name: p.displayName,
                scanTags: p.scanTags,
                rate: computeRate(
                  stats.pass,
                  stats.fail,
                  total,
                  pFormula,
                  pMeta,
                ),
                passCount: stats.pass,
                failCount: stats.fail,
              };
            })
            .filter((s): s is NonNullable<typeof s> => s !== null),
        }))
        .filter(inv => inv.profileScores.length > 0);

      // ── Baseline enrichment (ADR-014 §7) — batched to avoid N+1 ─────
      const allBaselines = await this.database.getAllBaselineTargets();
      if (allBaselines.length > 0) {
        const remProfileCache = new Map<string, RemediationProfile | null>();
        // Pre-fetch all remediation profiles (deduplicated)
        const uniqueRemProfileIds = [
          ...new Set(allBaselines.map(b => b.remediationProfileId)),
        ];
        await Promise.all(
          uniqueRemProfileIds.map(async id => {
            remProfileCache.set(
              id,
              await this.service.getRemediationProfile(id),
            );
          }),
        );

        // Collect all baseline score configs for batch query
        const scoreConfigs: Array<{
          key: string;
          scanId: string;
          ruleIds: string[];
          baseline: (typeof allBaselines)[0];
          remProfile: RemediationProfile;
        }> = [];
        for (const baseline of allBaselines) {
          const remProfile = remProfileCache.get(baseline.remediationProfileId);
          if (!remProfile) continue;

          const baselineRuleIds = remProfile.selections
            .filter(s => s.enabled)
            .map(s => s.ruleId);
          if (baselineRuleIds.length === 0) continue;

          const scanKey = `${baseline.complianceProfileId}::${baseline.inventoryId}`;
          const latestScan = latestByProfileInventory.get(scanKey);
          if (!latestScan) continue;

          scoreConfigs.push({
            key: scanKey,
            scanId: latestScan.id,
            ruleIds: baselineRuleIds,
            baseline,
            remProfile,
          });
        }

        // Single batch query for all baseline scores
        const batchScores = await this.database.getBaselineScoresBatch(
          scoreConfigs.map(c => ({
            key: c.key,
            scanId: c.scanId,
            ruleIds: c.ruleIds,
          })),
        );

        for (const cfg of scoreConfigs) {
          const score = batchScores.get(cfg.key) ?? {
            passCount: 0,
            failCount: 0,
          };
          const total = score.passCount + score.failCount;
          const blFormula =
            profileFormulaMap.get(cfg.baseline.complianceProfileId) ??
            'compliance_rate';
          const baselineRate = computeRate(
            score.passCount,
            score.failCount,
            total,
            blFormula,
          );

          const invEntry = byInventory.find(
            inv => inv.inventoryId === cfg.baseline.inventoryId,
          );
          const profileScore = invEntry?.profileScores.find(
            ps => ps.profileId === cfg.baseline.complianceProfileId,
          );
          if (profileScore) {
            profileScore.baseline = {
              remediationProfileId: cfg.baseline.remediationProfileId,
              remediationProfileName: cfg.remProfile.name,
              rate: baselineRate,
              passCount: score.passCount,
              ruleCount: cfg.ruleIds.length,
              pinnedAt: cfg.baseline.pinnedAt,
            };
          }
        }

        for (const fw of frameworkScores) {
          const profileBaselines = byInventory
            .flatMap(inv => inv.profileScores)
            .filter(ps => ps.profileId === fw.profileId && ps.baseline);
          if (profileBaselines.length > 0) {
            // Average per-inventory rates (each rate is already host-normalized)
            const rateSum = profileBaselines.reduce(
              (sum, ps) => sum + (ps.baseline?.rate ?? 0),
              0,
            );
            const avgRate =
              Math.round((rateSum / profileBaselines.length) * 10) / 10;
            const totalPass = profileBaselines.reduce(
              (sum, ps) => sum + (ps.baseline?.passCount ?? 0),
              0,
            );
            const totalRules = profileBaselines.reduce(
              (sum, ps) => sum + (ps.baseline?.ruleCount ?? 0),
              0,
            );
            fw.baseline = {
              rate: avgRate,
              passCount: totalPass,
              ruleCount: totalRules,
              inventoryCount: profileBaselines.length,
            };
          }
        }
      }

      // Recent scans with pass rates (using batch stats, no extra queries)
      const recentScansList = recentScans.map(scan => {
        let passRate = 0;
        if (scan.status === 'completed' && scan.scanner !== 'remediation') {
          const scanStats = batchStats.get(scan.id);
          if (scanStats) {
            const scanFormula =
              profileFormulaMap.get(scan.profileId) ?? 'compliance_rate';
            const total =
              scanFormula === 'vulnerability_free_rate' &&
              scanStats.totalPackages
                ? scanStats.totalPackages
                : scanStats.pass + scanStats.fail;
            const sMeta = {
              totalScannedPackages: scanStats.totalScannedPackages,
              totalVulnerablePackages: scanStats.totalVulnerablePackages,
            };
            passRate = computeRate(
              scanStats.pass,
              scanStats.fail,
              total,
              scanFormula,
              sMeta,
            );
          }
        }
        return {
          id: scan.id,
          workflowJobId: scan.workflowJobId ?? undefined,
          profileName: profileNameMap.get(scan.profileId) || scan.profileId,
          inventoryName:
            inventoryNameMap.get(scan.inventoryId) ||
            `Inventory ${scan.inventoryId}`,
          passRate,
          timestamp: scan.completedAt || scan.startedAt,
          status: scan.status,
          scanType: scan.scanType,
          scanner: scan.scanner,
        };
      });

      // Compute deltas vs previous scan set
      let prevCritical = 0;
      let prevPending = 0;
      let hasPrevious = false;
      for (const scan of previousByProfileInventory.values()) {
        const prevStats = batchStats.get(scan.id);
        if (prevStats) {
          prevCritical += prevStats.catI;
          prevPending += prevStats.fail;
          hasPrevious = true;
        }
      }

      return {
        hostsScanned: hostsSet.size,
        criticalFindings,
        ...(hasPrevious
          ? { criticalFindingsDelta: criticalFindings - prevCritical }
          : {}),
        pendingRemediation,
        ...(hasPrevious
          ? { pendingRemediationDelta: pendingRemediation - prevPending }
          : {}),
        activeProfiles: profiles.length,
        recentScans: recentScansList,
        frameworkScores,
        postureStatus,
        byInventory,
      };
    } catch (error) {
      this.logger.warn(`Dashboard stats aggregation failed: ${error}`);
      return empty;
    }
  }

  // ─── Posture history ────────────────────────────────────────────────

  async getPostureHistory(
    profileId?: string,
    days?: number,
  ): Promise<PostureSnapshot[]> {
    if (this.service.getDataSource() === 'mock') {
      return MockDataProvider.getPostureHistory(profileId, days);
    }
    return this.database.getPostureHistory(profileId, days);
  }

  // ─── Baseline scores ───────────────────────────────────────────────

  async getBaselineScoresForProfile(remediationProfileId: string): Promise<
    Array<{
      inventoryId: number;
      passRate: number;
      passCount: number;
      failCount: number;
    }>
  > {
    const profile = await this.database.getRemediationProfile(
      remediationProfileId,
    );
    if (!profile) return [];

    const ruleIds = profile.selections
      .filter(s => s.enabled)
      .map(s => s.ruleId);
    if (ruleIds.length === 0) return [];

    const pins = await this.database.getAllBaselineTargets();
    const profilePins = pins.filter(
      p => p.remediationProfileId === remediationProfileId,
    );
    if (profilePins.length === 0) return [];

    // Resolve score formula from the compliance profile linked to these pins
    let blScoreFormula: ScoreFormula = 'compliance_rate';
    if (profilePins[0]) {
      const allProfiles = await this.database.listProfiles();
      const cp = allProfiles.find(
        p => p.id === profilePins[0].complianceProfileId,
      );
      blScoreFormula = (cp?.displayConfig?.score_formula ??
        'compliance_rate') as ScoreFormula;
    }

    const latestScans = await this.database.getLatestScanPerProfileInventory();
    const scanMap = new Map(
      latestScans.map(s => [`${s.profileId}::${s.inventoryId}`, s]),
    );

    const results: Array<{
      inventoryId: number;
      passRate: number;
      passCount: number;
      failCount: number;
    }> = [];
    for (const pin of profilePins) {
      const scan = scanMap.get(
        `${pin.complianceProfileId}::${pin.inventoryId}`,
      );
      if (!scan) continue;
      const score = await this.database.getBaselineScore(scan.id, ruleIds);
      const total = score.passCount + score.failCount;
      results.push({
        inventoryId: pin.inventoryId,
        passRate: computeRate(
          score.passCount,
          score.failCount,
          total,
          blScoreFormula,
        ),
        passCount: score.passCount,
        failCount: score.failCount,
      });
    }
    return results;
  }
}
