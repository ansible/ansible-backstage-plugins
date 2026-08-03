import express from 'express';
import rateLimit from 'express-rate-limit';
import { createInterface } from 'readline';
import type { RouterDependencies } from './types';
import type { IngestFinding, ComplianceScan } from '@ansible/backstage-compliance-common';
import type { LoggerService } from '@backstage/backend-plugin-api';
import { getUserAapToken } from './permissions';
import { isValidScanId, isValidProfileId } from './validation';
import { buildRuleMetadataRecords } from '../service/ComplianceService';
import { resolveScanId, savePostureFromFindings, fetchLiveFindings } from './helpers';
import type { ComplianceDatabase } from '../database/ComplianceDatabase';

const ingestLimiter = rateLimit({
  windowMs: 60_000,
  limit: 500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many ingest requests, please try again later' },
});

export function registerFindingsRoutes(
  router: express.Router,
  deps: RouterDependencies,
): void {
  const { logger, service, database, state } = deps;

  router.get('/findings', async (req, res) => {
    const scanId = req.query.scanId as string | undefined;
    const profileId = req.query.profileId as string | undefined;
    const stateFilter = req.query.state as string | undefined;
    const userToken = getUserAapToken(req);
    const limitParam = req.query.limit as string | undefined;
    const offsetParam = req.query.offset as string | undefined;
    const severityParam = req.query.severity as string | undefined;
    const statusParam = req.query.status as string | undefined;

    if (scanId && !isValidScanId(scanId)) {
      res.status(400).json({ error: 'Invalid scanId' });
      return;
    }
    if (profileId && !isValidProfileId(profileId)) {
      res.status(400).json({ error: 'Invalid profileId' });
      return;
    }

    const VALID_SEVERITIES = new Set(['CAT_I', 'CAT_II', 'CAT_III']);
    const VALID_STATUSES = new Set(['pass', 'fail', 'not_applicable', 'error']);
    if (severityParam && !VALID_SEVERITIES.has(severityParam)) {
      res.status(400).json({ error: `Invalid severity filter. Must be one of: ${[...VALID_SEVERITIES].join(', ')}` });
      return;
    }
    if (statusParam && !VALID_STATUSES.has(statusParam)) {
      res.status(400).json({ error: `Invalid status filter. Must be one of: ${[...VALID_STATUSES].join(', ')}` });
      return;
    }

    const paginated = limitParam !== undefined;
    const limit = Math.min(Math.max(1, Number(limitParam) || 100), 500);
    const offset = Math.max(0, Number(offsetParam) || 0);

    const validStates = new Set(['new', 'active', 'fixed', 'resurfaced']);
    const stateFilterSet = stateFilter
      ? new Set(stateFilter.split(',').filter(s => validStates.has(s)))
      : null;

    const { resolvedScanId, workflowJobId, dbScan } = await resolveScanId(database, scanId);

    // Paginated path: query DB directly with limit/offset
    if (paginated && resolvedScanId && dbScan) {
      const { findings: dbFindings, total, totalFailing } = await database.getFindingsByScanIdPaginated(
        resolvedScanId,
        { limit, offset, severity: severityParam, status: statusParam },
      );
      const results = dbFindings.length > 0
        ? await service.aggregateFindingsWithMetadata(dbFindings)
        : [];
      res.json({ findings: results, total, totalFailing, limit, offset });
      return;
    }

    // Non-paginated path: backward compat (returns full array)
    let results: import('@ansible/backstage-compliance-common').MultiHostFinding[] | null = null;

    const skipDbLookup = workflowJobId !== undefined && !dbScan;
    if (resolvedScanId && !skipDbLookup) {
      const dbFindings = await database.getFindingsByScanId(resolvedScanId);
      if (dbFindings.length > 0) {
        results = await service.aggregateFindingsWithMetadata(dbFindings);
      }
    }

    if (!results && resolvedScanId && service.getDataSource() === 'live' && workflowJobId) {
      try {
        const liveResult = await fetchLiveFindings(
          database, service, logger, state,
          resolvedScanId, workflowJobId, dbScan, userToken,
        );
        if (liveResult) {
          results = liveResult;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to fetch/parse results for scan ${resolvedScanId}: ${msg}`);
      }
    }

    if (!results) {
      results = await service.getFindings(resolvedScanId, profileId);
    }

    if (stateFilterSet && stateFilterSet.size > 0) {
      results = results.filter(f =>
        f.stateSummary && (
          (stateFilterSet.has('new') && f.stateSummary.new > 0) ||
          (stateFilterSet.has('active') && f.stateSummary.active > 0) ||
          (stateFilterSet.has('fixed') && f.stateSummary.fixed > 0) ||
          (stateFilterSet.has('resurfaced') && f.stateSummary.resurfaced > 0)
        ),
      );
    }

    res.json(results);
  });

  router.get('/previous-findings', async (req, res) => {
    const scanId = req.query.scanId as string | undefined;

    if (!scanId) {
      res.status(400).json({ error: 'scanId query parameter is required' });
      return;
    }

    if (!isValidScanId(scanId)) {
      res.status(400).json({ error: 'Invalid scanId' });
      return;
    }

    try {
      let currentScan = await database.getScanById(scanId);
      if (!currentScan && /^\d+$/.test(scanId)) {
        currentScan = await database.getScanByWorkflowJobId(Number(scanId));
      }

      if (!currentScan) {
        res.json([]);
        return;
      }

      const previousScan = await database.getPreviousScan(currentScan);
      if (!previousScan) {
        res.json([]);
        return;
      }

      const dbFindings = await database.getFindingsByScanId(previousScan.id);
      if (dbFindings.length > 0) {
        res.json(await service.aggregateFindingsWithMetadata(dbFindings));
        return;
      }

      const findings = await service.getFindings(previousScan.id);
      res.json(findings);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get previous findings: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve previous scan findings' });
    }
  });

  // Content-type negotiation: NDJSON streams bypass express.json()
  const jsonParser = express.json({ limit: '200mb' });

  router.post('/findings/ingest', ingestLimiter, (req, res, _next) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('ndjson')) {
      handleNdjsonIngest(req, res, { logger, service, database });
    } else {
      jsonParser(req, res, () => handleJsonIngest(req, res, { logger, service, database }));
    }
  });
}

// ── Shared finalization logic (ADR-033) ─────────────────────────────

async function finalizeIngest(
  database: ComplianceDatabase,
  logger: LoggerService,
  scanId: string,
  scan: ComplianceScan,
): Promise<void> {
  await database.updateScanStatus(scanId, 'completed', new Date().toISOString());

  const uniqueRules = await database.getDistinctRuleCountForScan(scanId);
  if (uniqueRules > 0) {
    await database.updateProfileRuleCount(scan.profileId, uniqueRules);
  }

  try {
    const allFindings = await database.getFindingsByScanId(scanId);
    const profile = await database.getProfile(scan.profileId);
    const scoreFormula = profile?.displayConfig?.score_formula;
    const freshScan = await database.getScanById(scanId);
    const scanMetadata = freshScan?.scanMetadata as { totalPackages?: number; totalScannedPackages?: number; totalVulnerablePackages?: number } | null;
    await savePostureFromFindings(database, logger, allFindings, scan.profileId, scan.inventoryId, scan.id,
      { scoreFormula, scanMetadata });
  } catch (err) {
    logger.debug(`Posture snapshot failed for scan ${scanId}: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    await database.computeFindingStates(scanId, scan.profileId, scan.inventoryId);
  } catch (err) {
    logger.warn(`Finding state computation failed for scan ${scanId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── JSON ingest (existing path, unchanged behavior) ─────────────────

type IngestDeps = Pick<RouterDependencies, 'logger' | 'service' | 'database'>;

async function handleJsonIngest(
  req: express.Request,
  res: express.Response,
  deps: IngestDeps,
): Promise<void> {
  const { logger, service, database } = deps;
  const body = req.body;
  const scanId = body.scanId as string | undefined;
  const ingestToken = body.ingestToken as string | undefined;
  const findings = body.findings as Array<Record<string, unknown>> | undefined;
  const finalize = body.finalize === true;

  if (!scanId || !findings || !Array.isArray(findings)) {
    res.status(400).json({ error: 'scanId (string) and findings (array) are required' });
    return;
  }

  if (!isValidScanId(scanId)) {
    res.status(400).json({ error: 'Invalid scanId' });
    return;
  }

  if (findings.length > 50000) {
    res.status(400).json({ error: 'Findings count exceeds maximum allowed (50000)' });
    return;
  }

  const MAX_FINDING_SIZE = 100 * 1024;
  for (let i = 0; i < findings.length; i++) {
    const size = JSON.stringify(findings[i]).length;
    if (size > MAX_FINDING_SIZE) {
      res.status(400).json({ error: `findings[${i}] exceeds maximum size (${MAX_FINDING_SIZE} bytes)` });
      return;
    }
  }

  try {
    const scan = await database.getScanById(scanId);
    if (!scan) {
      res.status(404).json({ error: `Scan ${scanId} not found` });
      return;
    }

    const expectedToken = await database.getIngestToken(scanId);
    if (!expectedToken || expectedToken !== ingestToken) {
      res.status(403).json({ error: 'Invalid ingest token' });
      return;
    }

    const mapped = findings.map(raw => service.mapRawFindingPublic(
      raw as IngestFinding,
      (raw.host as string) || 'unknown',
      scanId,
    ));

    const count = await database.saveFindingsForScan(scanId, mapped);

    try {
      const metadataRecords = buildRuleMetadataRecords(findings as Array<Record<string, unknown>>);
      const metaCount = await database.upsertRuleMetadata(metadataRecords);
      logger.info(`Upserted ${metaCount} rule metadata records`);
    } catch (metaErr) {
      logger.warn(`Rule metadata upsert failed (non-fatal): ${metaErr instanceof Error ? metaErr.message : String(metaErr)}`);
    }

    if (finalize || body.finalize === undefined) {
      await finalizeIngest(database, logger, scanId, scan);
    }

    logger.info(`Ingested ${count} findings for scan ${scanId} via JSON POST (finalize=${finalize})`);
    res.status(201).json({ scanId, findingsCount: count });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to ingest findings: ${msg}`);
    res.status(500).json({ error: 'Failed to ingest findings' });
  }
}

// ── NDJSON streaming ingest (ADR-034) ───────────────────────────────

async function handleNdjsonIngest(
  req: express.Request,
  res: express.Response,
  deps: IngestDeps,
): Promise<void> {
  const { logger, service, database } = deps;
  const BATCH_SIZE = 500;
  const MAX_LINE_SIZE = 100 * 1024;
  const MAX_ERRORS = 50;
  const MAX_FINDINGS = 500_000;

  const rl = createInterface({ input: req, crlfDelay: Infinity });
  let preambleParsed = false;
  let scanId = '';
  let finalize = true;
  let scan: ComplianceScan | null = null;

  let batch: Array<ReturnType<typeof service.mapRawFindingPublic>> = [];
  let metadataBatch: Array<Record<string, unknown>> = [];
  let totalCount = 0;
  let lineNumber = 0;
  const errors: Array<{ line: number; error: string }> = [];

  try {
    for await (const line of rl) {
      lineNumber++;
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      if (trimmed.length > MAX_LINE_SIZE) {
        errors.push({ line: lineNumber, error: `Line exceeds ${MAX_LINE_SIZE} bytes` });
        if (errors.length >= MAX_ERRORS) {
          res.status(400).json({ error: `Too many malformed lines (${MAX_ERRORS})`, errors: errors.slice(0, 10) });
          rl.close();
          return;
        }
        continue;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        errors.push({ line: lineNumber, error: 'Invalid JSON' });
        if (errors.length >= MAX_ERRORS) {
          res.status(400).json({ error: `Too many malformed lines (${MAX_ERRORS})`, errors: errors.slice(0, 10) });
          rl.close();
          return;
        }
        continue;
      }

      // First line is the preamble with metadata
      if (!preambleParsed) {
        preambleParsed = true;

        if (!parsed._meta) {
          res.status(400).json({ error: 'First NDJSON line must be a preamble with _meta: true' });
          rl.close();
          return;
        }

        scanId = parsed.scanId as string || '';
        const ingestToken = parsed.ingestToken as string || '';
        finalize = parsed.finalize !== undefined ? parsed.finalize === true : true;

        if (!scanId || !isValidScanId(scanId)) {
          res.status(400).json({ error: 'Preamble scanId is required and must be valid' });
          rl.close();
          return;
        }

        scan = await database.getScanById(scanId);
        if (!scan) {
          res.status(404).json({ error: `Scan ${scanId} not found` });
          rl.close();
          return;
        }

        const expectedToken = await database.getIngestToken(scanId);
        if (!expectedToken || expectedToken !== ingestToken) {
          res.status(403).json({ error: 'Invalid ingest token' });
          rl.close();
          return;
        }

        const preambleHost = (parsed.host as string) || 'unknown';
        const preambleTotalScannedPackages = parsed.totalScannedPackages as number | undefined;
        const preambleTotalVulnerablePackages = parsed.totalVulnerablePackages as number | undefined;
        const preambleTotalVulnerabilities = parsed.totalVulnerabilities as number | undefined;
        if (preambleTotalScannedPackages !== undefined || preambleTotalVulnerablePackages !== undefined || preambleTotalVulnerabilities !== undefined) {
          await database.mergeScanMetadata(scanId, preambleHost, {
            totalScannedPackages: preambleTotalScannedPackages,
            totalVulnerablePackages: preambleTotalVulnerablePackages,
            totalVulnerabilities: preambleTotalVulnerabilities,
          });
        } else {
          const preambleTotalPackages = parsed.totalPackages as number | undefined;
          if (preambleTotalPackages !== undefined || preambleTotalVulnerabilities !== undefined) {
            await database.updateScanMetadata(scanId, {
              ...(preambleTotalPackages !== undefined ? { totalPackages: preambleTotalPackages } : {}),
              ...(preambleTotalVulnerabilities !== undefined ? { totalVulnerabilities: preambleTotalVulnerabilities } : {}),
            });
          }
        }

        continue;
      }

      // Subsequent lines are findings
      if (totalCount >= MAX_FINDINGS) {
        logger.warn(`NDJSON stream for scan ${scanId} exceeded ${MAX_FINDINGS} findings — truncating`);
        break;
      }

      const mapped = service.mapRawFindingPublic(
        parsed as IngestFinding,
        (parsed.host as string) || 'unknown',
        scanId,
      );
      batch.push(mapped);
      metadataBatch.push(parsed);
      totalCount++;

      if (batch.length >= BATCH_SIZE) {
        await database.saveFindingsForScan(scanId, batch);
        try {
          const records = buildRuleMetadataRecords(metadataBatch);
          await database.upsertRuleMetadata(records);
        } catch (metaErr) {
          logger.warn(`Rule metadata upsert failed for batch: ${metaErr instanceof Error ? metaErr.message : String(metaErr)}`);
        }
        batch = [];
        metadataBatch = [];
      }
    }
  } catch (streamErr) {
    logger.warn(`NDJSON stream interrupted for scan ${scanId} after ${totalCount} findings: ${streamErr}`);
    if (batch.length > 0) {
      try { await database.saveFindingsForScan(scanId, batch); } catch { /* best effort */ }
    }
    if (!res.headersSent) {
      res.status(500).json({ error: 'Stream interrupted', findingsCommitted: totalCount });
    }
    return;
  }

  if (!preambleParsed) {
    res.status(400).json({ error: 'Empty NDJSON body — no preamble line received' });
    return;
  }

  // Flush remaining batch
  if (batch.length > 0) {
    await database.saveFindingsForScan(scanId, batch);
    try {
      const records = buildRuleMetadataRecords(metadataBatch);
      await database.upsertRuleMetadata(records);
    } catch (metaErr) {
      logger.warn(`Rule metadata upsert failed for final batch: ${metaErr instanceof Error ? metaErr.message : String(metaErr)}`);
    }
  }

  if (finalize && scan) {
    await finalizeIngest(database, logger, scanId, scan);
  }

  logger.info(`Streamed ${totalCount} findings for scan ${scanId} via NDJSON (errors=${errors.length}, finalize=${finalize})`);
  res.status(201).json({
    scanId,
    findingsCount: totalCount,
    ...(errors.length > 0 ? { warningCount: errors.length, errors: errors.slice(0, 10) } : {}),
  });
}
