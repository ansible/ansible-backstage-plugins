import type express from 'express';
import type { RouterDependencies } from './types';
import type { LaunchScanRequest } from '@ansible/backstage-compliance-common';
import { randomUUID } from 'crypto';
import { requireAuth, requirePermission, getUserAapToken } from './permissions';
import { isNonEmptyString, isPositiveInteger, isValidScanId, isValidProfileId } from './validation';
import { validatePlatform } from '../service/PlatformValidator';
import { resolveScanId, savePostureFromFindings } from './helpers';
import { buildRuleMetadataRecords } from '../service/ComplianceService';

export function registerScanRoutes(
  router: express.Router,
  deps: RouterDependencies,
): void {
  const { logger, service, database, httpAuth, permissions, state } = deps;

  router.get('/profiles', async (_req, res) => {
    const profiles = await service.getProfiles();
    res.json(profiles);
  });

  router.get('/scans', async (req, res) => {
    if (!(await requireAuth(req, res, httpAuth))) return;
    const userToken = getUserAapToken(req);
    const scans = await database.getRecentScans(50);

    if (service.getDataSource() === 'live') {
      const now = Date.now();
      const staleScans = scans.filter(
        s => (s.status === 'running' || s.status === 'pending') && s.workflowJobId
          && now - (state.staleScanThrottle.get(s.id) ?? 0) > state.STALE_CHECK_INTERVAL_MS,
      );
      await Promise.all(staleScans.map(async scan => {
        try {
          state.staleScanThrottle.set(scan.id, now);
          let status;
          try {
            status = await service.getWorkflowJobStatus(scan.workflowJobId!, userToken);
          } catch (err) {
            logger.debug(`WJT status failed for scan ${scan.id}, falling back to JT: ${err instanceof Error ? err.message : String(err)}`);
            status = await service.getJobStatus(scan.workflowJobId!, userToken);
          }
          if (status.status === 'running' && scan.status === 'pending') {
            await database.updateScanStatus(scan.id, 'running');
            scan.status = 'running';
          }
          const terminal = ['successful', 'failed', 'error', 'canceled'];
          if (terminal.includes(status.status) && scan.status !== 'completed') {
            const newStatus = status.status === 'successful' ? 'completed' : 'failed';
            await database.updateScanStatus(scan.id, newStatus, status.finished ?? new Date().toISOString());
            scan.status = newStatus as typeof scan.status;
            scan.completedAt = status.finished ?? new Date().toISOString();
            state.staleScanThrottle.delete(scan.id);
          }
        } catch (err) {
          logger.debug(`Stale scan check failed for ${scan.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }));
    }

    res.json(scans);
  });

  router.get('/inventories', async (req, res) => {
    const userToken = getUserAapToken(req);
    const inventories = await service.getInventories(userToken);
    res.json(inventories);
  });

  // Must be registered BEFORE /scans/:scanId to avoid wildcard capture.
  router.get('/scans/authoritative', async (req, res) => {
    if (!(await requireAuth(req, res, httpAuth))) return;
    const profileId = req.query.profileId as string | undefined;
    const inventoryIdRaw = req.query.inventoryId as string | undefined;

    if (!profileId || !isValidProfileId(profileId)) {
      res.status(400).json({ error: 'profileId is required and must be valid' });
      return;
    }
    const inventoryId = Number(inventoryIdRaw);
    if (!inventoryIdRaw || !Number.isInteger(inventoryId) || inventoryId <= 0) {
      res.status(400).json({ error: 'inventoryId is required and must be a positive integer' });
      return;
    }

    try {
      const scan = await database.getAuthoritativeScan(profileId, inventoryId);
      if (!scan) {
        res.status(404).json({ error: 'No completed assessment scan found for this profile and inventory' });
        return;
      }

      const statsMap = await database.getAggregatedStatsByScanIds([scan.id]);
      const stats = statsMap.get(scan.id);
      const passCount = stats?.pass ?? 0;
      const failCount = stats?.fail ?? 0;
      const total = passCount + failCount;
      const passRate = total > 0 ? Math.round((passCount / total) * 1000) / 10 : 0;

      res.json({ scan, passRate, passCount, failCount });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to resolve authoritative scan: ${msg}`);
      res.status(500).json({ error: 'Failed to resolve authoritative scan' });
    }
  });

  // Must be registered BEFORE /scans/:scanId to avoid wildcard capture.
  router.get('/scans/stats', async (req, res) => {
    if (!(await requireAuth(req, res, httpAuth))) return;
    const idsParam = req.query.ids as string | undefined;
    if (!idsParam) {
      res.status(400).json({ error: 'ids query parameter is required (comma-separated scan IDs)' });
      return;
    }
    const scanIds = idsParam.split(',').map(s => s.trim()).filter(Boolean);
    if (scanIds.length === 0) {
      res.status(400).json({ error: 'ids must contain at least one scan ID' });
      return;
    }
    if (scanIds.length > 100) {
      res.status(400).json({ error: 'Maximum 100 scan IDs per request' });
      return;
    }
    if (scanIds.some(id => !isValidScanId(id))) {
      res.status(400).json({ error: 'Invalid scan ID format' });
      return;
    }
    try {
      const result = await database.getBatchScanStatsAggregated(scanIds);
      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get batch scan stats: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve scan statistics' });
    }
  });

  router.get('/profile-tab-data/:profileId', async (req, res) => {
    const { profileId } = req.params;
    if (!isValidProfileId(profileId)) {
      res.status(400).json({ error: 'Invalid profileId' });
      return;
    }
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 500);

      const allScans = await database.getLatestScanPerProfileInventory();
      const profileScans = allScans.filter(s => s.profileId === profileId);
      if (profileScans.length === 0) {
        res.json({ findings: [], summary: { totalPackages: 0, totalVulnerabilities: 0, totalScannedPackages: 0, totalVulnerablePackages: 0, fixable: 0, unfixable: 0, hostsAffected: 0, criticalHigh: 0 }, hostRisk: [] });
        return;
      }

      const scanIds = profileScans.map(s => s.id);
      const stats = await database.getBatchScanStatsAggregated(scanIds);

      let totalPackages = 0;
      let totalVulnerabilities = 0;
      let totalScannedPackages = 0;
      let totalVulnerablePackages = 0;
      for (const sid of scanIds) {
        const s = stats[sid];
        if (!s) continue;
        if (s.totalPackages) totalPackages += s.totalPackages;
        if (s.totalVulnerabilities) totalVulnerabilities += s.totalVulnerabilities;
        if (s.totalScannedPackages) totalScannedPackages += s.totalScannedPackages;
        if (s.totalVulnerablePackages) totalVulnerablePackages += s.totalVulnerablePackages;
      }

      const [allFindings, summaryCounts, hostSeverities] = await Promise.all([
        database.getAggregatedFindingsForScans(scanIds, limit),
        database.getSummaryCounts(scanIds),
        database.getHostSeverityCounts(scanIds),
      ]);

      const hostRiskMap = new Map<string, { critical: number; medium: number; low: number; total: number; score: number; scannedPackages: number; latestScanId?: string }>();
      for (const hs of hostSeverities) {
        const score = hs.critical * 10 + hs.medium * 5 + hs.low;
        hostRiskMap.set(hs.host, { ...hs, score, scannedPackages: 0 });
      }

      // Enrich with per-host scanned package counts and latest scan ID from scan_metadata.
      // Hosts with zero findings are added here so they appear in the heatmap with a download button.
      for (const scan of profileScans) {
        const meta = scan.scanMetadata as Record<string, unknown> | null;
        const hosts = (meta?.hosts ?? {}) as Record<string, { totalScannedPackages?: number }>;
        for (const [hostname, hostMeta] of Object.entries(hosts)) {
          if (!hostRiskMap.has(hostname)) {
            hostRiskMap.set(hostname, { critical: 0, medium: 0, low: 0, total: 0, score: 0, scannedPackages: 0 });
          }
          const hr = hostRiskMap.get(hostname)!;
          if (hostMeta.totalScannedPackages) {
            hr.scannedPackages = Math.max(hr.scannedPackages, hostMeta.totalScannedPackages);
          }
          if (!hr.latestScanId) {
            hr.latestScanId = String(scan.workflowJobId ?? scan.id);
          }
        }
      }

      const hostRisk = Array.from(hostRiskMap.entries())
        .map(([hostname, r]) => ({ hostname, ...r }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);

      res.json({
        findings: allFindings,
        summary: { totalPackages, totalVulnerabilities, totalScannedPackages, totalVulnerablePackages, fixable: summaryCounts.fixable, unfixable: summaryCounts.unfixable, hostsAffected: summaryCounts.hostsAffected, criticalHigh: summaryCounts.criticalHigh },
        hostRisk,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get profile tab data for ${profileId}: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve profile tab data' });
    }
  });

  // Must be registered BEFORE /scans/:scanId to avoid wildcard capture.
  router.get('/scans/:scanId/findings/na', async (req, res) => {
    if (!(await requireAuth(req, res, httpAuth))) return;
    const { scanId: rawScanId } = req.params;
    if (!rawScanId || rawScanId.length > 128 || !isValidScanId(rawScanId)) {
      res.status(400).json({ error: 'Invalid scanId' });
      return;
    }
    try {
      const { resolvedScanId: resolved } = await resolveScanId(database, rawScanId);
      if (!resolved) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }
      const rules = await database.getNotApplicableRules(resolved);
      res.json(rules);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get N/A rules for scan ${rawScanId}: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve not-applicable rules' });
    }
  });

  router.get('/scans/:scanId', async (req, res) => {
    if (!(await requireAuth(req, res, httpAuth))) return;
    const { scanId } = req.params;
    const userToken = getUserAapToken(req);
    if (!scanId || scanId.length > 128) {
      res.status(400).json({ error: 'Invalid scanId' });
      return;
    }
    try {
      let scan = await database.getScanById(scanId);
      if (!scan && /^\d+$/.test(scanId)) {
        scan = await database.getScanByWorkflowJobId(Number(scanId));
      }
      if (!scan) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }

      if (
        scan.status === 'failed' &&
        scan.errorDetails === null &&
        scan.workflowJobId
      ) {
        try {
          const details = await service.fetchScanErrorDetails(
            scan.workflowJobId,
            userToken,
          );
          if (details) {
            await database.updateScanErrorDetails(scan.id, details);
            scan.errorDetails = details;
          }
        } catch (err) {
          logger.debug(`Error details fetch failed for scan ${scanId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      res.json(scan);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get scan ${scanId}: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve scan details' });
    }
  });

  // Re-ingest findings from Controller for scans created before N/A reporting
  router.post('/scans/:scanId/backfill', async (req, res) => {
    if (!await requirePermission(req, res, httpAuth, permissions)) return;

    const { scanId } = req.params;
    const userToken = getUserAapToken(req);

    if (!scanId || !isValidScanId(scanId)) {
      res.status(400).json({ error: 'Invalid scanId' });
      return;
    }

    try {
      const scan = await database.getScanById(scanId);
      if (!scan) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }
      if (!scan.workflowJobId) {
        res.status(400).json({ error: 'Scan has no associated Controller job for backfill' });
        return;
      }

      const parsed = await service.fetchAndParseResults(scan.workflowJobId, scan.id, userToken);
      if (parsed.length === 0) {
        res.json({ scanId, findingsBackfilled: 0, message: 'No findings found in Controller events' });
        return;
      }

      const count = await database.saveFindingsForScan(scan.id, parsed);

      try {
        const metadataRecords = buildRuleMetadataRecords(
          parsed.map(f => ({ rule_id: f.ruleId, stig_id: f.stigId, title: '', severity: f.severity, status: f.status })),
        );
        await database.upsertRuleMetadata(metadataRecords);
      } catch (metaErr) {
        logger.warn(`Backfill metadata upsert failed: ${metaErr instanceof Error ? metaErr.message : String(metaErr)}`);
      }

      try {
        await savePostureFromFindings(database, logger, parsed, scan.profileId, scan.inventoryId, scan.id);
      } catch (err) {
        logger.debug(`Backfill posture snapshot failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      try {
        await database.computeFindingStates(scan.id, scan.profileId, scan.inventoryId);
      } catch (err) {
        logger.warn(`Backfill finding states failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      logger.info(`Backfilled ${count} findings for scan ${scanId}`);
      res.json({ scanId, findingsBackfilled: count });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to backfill scan ${scanId}: ${msg}`);
      res.status(500).json({ error: 'Failed to backfill scan findings' });
    }
  });

  router.post('/scan/validate', async (req, res) => {
    if (!await requirePermission(req, res, httpAuth, permissions)) return;

    const { profileId, inventoryId } = req.body;
    const userToken = getUserAapToken(req);

    if (!isNonEmptyString(profileId)) {
      res.status(400).json({ error: 'profileId is required' });
      return;
    }
    if (!isPositiveInteger(inventoryId)) {
      res.status(400).json({ error: 'inventoryId must be a positive integer' });
      return;
    }

    try {
      const profile = await database.getProfile(profileId);
      if (!profile?.platformSpec || profile.platformSpec.scanner_validates) {
        res.json({ valid: true, matchedHosts: [], mismatchedHosts: [], factsAvailable: true });
        return;
      }

      const hostFacts = await service.getInventoryHostFacts(inventoryId, userToken);
      const factsAvailable = hostFacts.some(h => !!(h.ansible_os_family || h.ansible_distribution_major_version || h.device_type));
      const result = validatePlatform(profile.platformSpec, hostFacts);
      res.json({ ...result, factsAvailable });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Platform validation failed: ${msg}`);
      res.status(500).json({ error: 'Platform validation failed' });
    }
  });

  router.post('/scan', async (req, res) => {
    if (!await requirePermission(req, res, httpAuth, permissions)) return;

    const body = req.body;
    const userToken = getUserAapToken(req);

    if (!isNonEmptyString(body.profileId)) {
      res.status(400).json({ error: 'profileId is required and must be a non-empty string' });
      return;
    }
    if (!isPositiveInteger(body.inventoryId)) {
      res.status(400).json({ error: 'inventoryId is required and must be a positive integer' });
      return;
    }
    if (body.workflowTemplateId !== undefined && body.workflowTemplateId !== null && !isPositiveInteger(body.workflowTemplateId)) {
      res.status(400).json({ error: 'workflowTemplateId must be a positive integer when provided' });
      return;
    }
    const validScanTypes = ['assessment', 'verification'];
    if (body.scanType && !validScanTypes.includes(body.scanType)) {
      res.status(400).json({ error: `scanType must be one of: ${validScanTypes.join(', ')}` });
      return;
    }

    const scanRequest: LaunchScanRequest = {
      profileId: body.profileId,
      inventoryId: body.inventoryId,
      limit: body.limit,
      workflowTemplateId: body.workflowTemplateId ?? undefined,
      gatherFacts: body.gatherFacts ?? false,
    };

    logger.info(`Launching scan for profile=${scanRequest.profileId}`);

    let scanRecordId: string | undefined;
    try {
      const ingestToken = randomUUID();

      const profile = await database.getProfile(scanRequest.profileId);
      const scanRecord = await database.createScan({
        profileId: scanRequest.profileId,
        profileVersion: profile?.version ?? undefined,
        inventoryId: scanRequest.inventoryId,
        scanner: 'oscap',
        scanType: body.scanType || 'assessment',
        workflowJobId: null,
        status: 'pending',
        startedAt: new Date().toISOString(),
        completedAt: null,
        errorDetails: null,
      });
      scanRecordId = scanRecord.id;
      await database.storeIngestToken(scanRecord.id, ingestToken);

      const result = await service.launchScan(scanRequest, userToken, scanRecord.id, ingestToken);

      await database.updateScanWorkflowJobId(scanRecord.id, result.workflowJobId);

      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to launch scan: ${msg}`);
      if (scanRecordId) {
        await database.updateScanStatus(scanRecordId, 'failed', new Date().toISOString()).catch(() => {});
        await database.updateScanErrorDetails(scanRecordId, msg).catch(() => {});
      }
      res.status(500).json({ error: 'Failed to launch compliance scan' });
    }
  });
}
