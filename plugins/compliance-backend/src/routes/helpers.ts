import type { ComplianceDatabase } from '../database/ComplianceDatabase';
import type { ComplianceService } from '../service/ComplianceService';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { MultiHostFinding } from '@ansible/backstage-compliance-common';
import type { ScanResolution, SharedState } from './types';

export async function resolveScanId(
  database: ComplianceDatabase,
  scanId: string | undefined,
): Promise<ScanResolution> {
  let resolvedScanId = scanId;
  let workflowJobId: number | undefined;
  let dbScan: ScanResolution['dbScan'];

  if (scanId) {
    const match = scanId.match(/^(?:scan-)?(\d+)$/);
    if (match) {
      workflowJobId = Number(match[1]);
      dbScan =
        (await database.getScanByWorkflowJobId(workflowJobId)) ?? undefined;
      if (dbScan) {
        resolvedScanId = dbScan.id;
      }
    }
  }
  return { resolvedScanId, workflowJobId, dbScan };
}

export async function savePostureFromFindings(
  database: ComplianceDatabase,
  logger: LoggerService,
  findings: Array<{ status: string; host: string; ruleId: string }>,
  profileId: string,
  inventoryId?: number,
  scanId?: string,
  opts?: {
    scoreFormula?: string;
    scanMetadata?: {
      totalPackages?: number;
      totalScannedPackages?: number;
      totalVulnerablePackages?: number;
    } | null;
  },
): Promise<void> {
  const applicable = findings.filter(
    f => f.host !== 'localhost' && f.status !== 'not_applicable',
  );
  const passCount = applicable.filter(f => f.status === 'pass').length;
  const failCount = applicable.filter(f => f.status === 'fail').length;
  const uniqueHosts = new Set(applicable.map(f => f.host)).size;
  const uniqueRules = new Set(applicable.map(f => f.ruleId)).size;
  const total = passCount + failCount;

  let compliancePct: number;
  if (opts?.scoreFormula === 'vulnerability_free_rate') {
    const scanned = opts.scanMetadata?.totalScannedPackages;
    const vulnerable = opts.scanMetadata?.totalVulnerablePackages;
    if (scanned && scanned > 0 && vulnerable !== undefined) {
      compliancePct = Math.round(((scanned - vulnerable) / scanned) * 100);
    } else if (
      opts.scanMetadata?.totalPackages &&
      opts.scanMetadata.totalPackages > 0
    ) {
      const tp = opts.scanMetadata.totalPackages;
      compliancePct = tp > 0 ? Math.round(((tp - failCount) / tp) * 100) : 0;
    } else {
      compliancePct = 0;
    }
  } else {
    compliancePct = total > 0 ? Math.round((passCount / total) * 100) : 0;
  }

  await database.savePostureSnapshot({
    profileId,
    inventoryId,
    scanId,
    timestamp: new Date().toISOString(),
    totalHosts: uniqueHosts,
    totalRules: uniqueRules,
    passCount,
    failCount,
    compliancePct,
  });
  logger.info(
    `Saved posture snapshot for profile=${profileId} inventory=${
      inventoryId ?? 'unknown'
    }`,
  );
}

export async function fetchLiveFindings(
  database: ComplianceDatabase,
  service: ComplianceService,
  logger: LoggerService,
  state: SharedState,
  resolvedScanId: string,
  workflowJobId: number,
  dbScan: ScanResolution['dbScan'],
  userToken: string | undefined,
): Promise<MultiHostFinding[] | null> {
  let status;
  try {
    status = await service.getWorkflowJobStatus(workflowJobId, userToken);
  } catch (err) {
    logger.debug(
      `WJT status failed for ${workflowJobId}, falling back to JT: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    status = await service.getJobStatus(workflowJobId, userToken);
  }

  const st = status.status.toLowerCase();
  if (st !== 'successful' && st !== 'failed') {
    logger.info(
      `Workflow ${workflowJobId} status is "${status.status}" — not yet ready to parse`,
    );
    return null;
  }

  const effectiveScanId = dbScan?.id ?? resolvedScanId;

  if (state.parseInProgress.has(effectiveScanId)) {
    await new Promise(r => setTimeout(r, 2000));
    const dbFindings = await database.getFindingsByScanId(effectiveScanId);
    if (dbFindings.length > 0) {
      return service.aggregateFindingsWithMetadata(dbFindings);
    }
  }

  state.parseInProgress.add(effectiveScanId);
  let parsed;
  try {
    parsed = await service.fetchAndParseResults(
      workflowJobId,
      effectiveScanId,
      userToken,
    );
  } finally {
    state.parseInProgress.delete(effectiveScanId);
  }

  if (dbScan) {
    const alreadyCompleted = dbScan.status === 'completed';
    if (!alreadyCompleted) {
      const scanStatus = st === 'successful' ? 'completed' : 'failed';
      await database.updateScanStatus(
        dbScan.id,
        scanStatus,
        new Date().toISOString(),
      );
    }
  }

  if (parsed.length > 0) {
    try {
      await savePostureFromFindings(
        database,
        logger,
        parsed,
        dbScan?.profileId ?? resolvedScanId,
        dbScan?.inventoryId,
        dbScan?.id,
      );
    } catch (snapshotError) {
      logger.warn(
        `Failed to save posture snapshot: ${
          snapshotError instanceof Error
            ? snapshotError.message
            : String(snapshotError)
        }`,
      );
    }

    const freshFindings = await database.getFindingsByScanId(effectiveScanId);
    if (freshFindings.length > 0) {
      return service.aggregateFindingsWithMetadata(freshFindings);
    }
    return service.aggregateFindingsWithMetadata(parsed);
  }

  return null;
}
