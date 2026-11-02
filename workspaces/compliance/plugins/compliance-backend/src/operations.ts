/**
 * Business logic for compliance's registered `PortalOperations`, plus the
 * registration entry point (`registerComplianceOperations()`) that wires it
 * all into the host's operation registry.
 *
 * Each `handle*` function below is the single implementation of one
 * compliance write action (scan launch, remediation launch, profile
 * save/delete). It is called from two places:
 *
 *   1. The registered `PortalOperations` handler (production auth mode) —
 *      reached via `operations.execute()`, which has already enforced the
 *      operation's permission, validated `request.input` against its
 *      `inputSchema`, and will emit the SUCCESS/FAILURE audit event around
 *      whatever this function returns or throws.
 *   2. The route's development-mode fallback (see `routes/scans.ts`,
 *      `routes/remediation.ts`, `routes/profiles.ts`) — reached directly,
 *      because `ansible.compliance.authMode: development` carries no real
 *      Backstage credentials for `operations.execute()` to authenticate
 *      (`requirePermission()` has the same no-op-when-unauthenticated
 *      bypass today; see `routes/permissions.ts`).
 *
 * Keeping one implementation per action — rather than duplicating it across
 * an "operation handler" and a "dev route handler" — is the whole point of
 * this file: the host-pipeline concerns (permission, schema, audit) live in
 * `PortalOperations.execute()` and are never re-implemented here.
 *
 * Business-rule failures (already-running remediation, hosts missing from
 * inventory, not-found profile, etc.) are raised as `ComplianceOperationError`
 * so each caller — whether it unwound through `execute()` or called this
 * function directly — can translate it back into the historical REST
 * response its frontend already expects. See `sendOperationError()`.
 */
import { randomUUID } from 'crypto';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type express from 'express';
import {
  ConflictError,
  InputError,
  NotAllowedError,
  NotFoundError,
} from '@backstage/errors';
import type { PortalOperations } from '@ansible/portal-plugin-node';
import type {
  ComplianceProfile,
  LaunchRemediationRequest,
  LaunchRemediationResponse,
  LaunchScanRequest,
  LaunchScanResponse,
  SaveProfileRequest,
} from '@ansible/compliance-common';
import {
  complianceProfileDeleteOperation,
  complianceProfileSaveOperation,
  complianceRemediationLaunchOperation,
  complianceScanLaunchOperation,
} from '@ansible/compliance-common';
import type { ComplianceService } from './service/ComplianceService';
import type { ComplianceDatabase } from './database/ComplianceDatabase';

/**
 * Synthetic subject for every compliance operation. None of the four
 * actions below act on a catalog entity — they act on AAP-side resources
 * (inventories, job templates) that aren't modeled in the catalog — so
 * there is no real `entityRef` to pass as `OperationRequest.subject`.
 * `OperationRequest.subject.entityRef` is required and validated as a
 * well-formed entity reference regardless, so this plugin-self reference
 * is used consistently across all four operations.
 */
export const COMPLIANCE_OPERATION_SUBJECT =
  'component:default/compliance-plugin';

/** Shared dependencies every extracted handler needs. */
interface HandlerDeps {
  service: ComplianceService;
  database: ComplianceDatabase;
  logger: LoggerService;
}

/**
 * Raised by the `handle*` functions below for expected, non-5xx failure
 * paths (not found, conflict, unprocessable input) that need to reach the
 * caller with a specific HTTP status and response body. Distinct from the
 * `@backstage/errors` classes `PortalOperations.execute()` itself throws
 * for permission/schema/organization failures — both are handled by
 * `sendOperationError()`.
 */
export class ComplianceOperationError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(typeof body === 'string' ? body : JSON.stringify(body));
    this.name = 'ComplianceOperationError';
  }
}

/**
 * Translate an error raised by a `handle*` function (or by
 * `PortalOperations.execute()` itself) into the legacy REST response the
 * frontend already expects, so converting these routes to legacy transport
 * adapters is invisible to API consumers. Falls back to `fallback` for any
 * error type a given route doesn't specifically anticipate.
 */
export function sendOperationError(
  res: express.Response,
  error: unknown,
  fallback: { status: number; body: unknown },
): void {
  if (error instanceof ComplianceOperationError) {
    res.status(error.status).json(error.body);
    return;
  }
  if (error instanceof InputError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof NotAllowedError) {
    res.status(403).json({ error: error.message });
    return;
  }
  if (error instanceof NotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof ConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(fallback.status).json(fallback.body);
}

// ── Scan launch ────────────────────────────────────────────────────────────

export async function handleScanLaunch(
  input: LaunchScanRequest & { aapToken?: string },
  { service, database, logger }: HandlerDeps,
): Promise<LaunchScanResponse> {
  const scanRequest: LaunchScanRequest = {
    profileId: input.profileId,
    inventoryId: input.inventoryId,
    limit: input.limit,
    workflowTemplateId: input.workflowTemplateId ?? undefined,
    gatherFacts: input.gatherFacts ?? false,
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
      scanType: input.scanType || 'assessment',
      workflowJobId: null,
      status: 'pending',
      startedAt: new Date().toISOString(),
      completedAt: null,
      errorDetails: null,
    });
    scanRecordId = scanRecord.id;
    await database.storeIngestToken(scanRecord.id, ingestToken);

    const result = await service.launchScan(
      scanRequest,
      input.aapToken,
      scanRecord.id,
      ingestToken,
    );
    await database.updateScanWorkflowJobId(scanRecord.id, result.workflowJobId);

    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to launch scan: ${msg}`);
    if (scanRecordId) {
      await database
        .updateScanStatus(scanRecordId, 'failed', new Date().toISOString())
        .catch(() => {});
      await database.updateScanErrorDetails(scanRecordId, msg).catch(() => {});
    }
    throw new ComplianceOperationError(500, {
      error: 'Failed to launch compliance scan',
    });
  }
}

// ── Remediation launch ────────────────────────────────────────────────────

export async function handleRemediationLaunch(
  input: LaunchRemediationRequest & { aapToken?: string },
  { service, database, logger }: HandlerDeps,
  createdBy: string | undefined,
): Promise<LaunchRemediationResponse> {
  const userToken = input.aapToken;

  let resolvedScanId = input.scanId;
  if (!resolvedScanId) {
    const authScan = await database.getAuthoritativeScan(
      input.profileId,
      input.inventoryId,
    );
    if (!authScan) {
      throw new ComplianceOperationError(400, {
        error:
          'No completed assessment scan exists for this profile and inventory. Run a scan first.',
      });
    }
    resolvedScanId = authScan.id;
  }

  const remediateRequest: LaunchRemediationRequest = {
    profileId: input.profileId,
    inventoryId: input.inventoryId,
    selections: input.selections,
    limit: input.limit,
    scanId: resolvedScanId,
  };

  const enabledCount = input.selections.filter(s => s.enabled).length;
  logger.info(
    `Launching remediation for profile=${remediateRequest.profileId}` +
      ` with ${input.selections.length} selections (${enabledCount} enabled)` +
      ` (scan=${resolvedScanId}, inventory=${input.inventoryId})`,
  );

  const resolvedProfileId = input.remediationProfileId;
  let execution: Awaited<ReturnType<typeof database.createExecution>> | null =
    null;
  if (resolvedProfileId) {
    execution = await database.createExecution({
      remediationProfileId: resolvedProfileId,
      inventoryId: input.inventoryId,
      informingScanId: resolvedScanId,
      createdBy,
    });
  }

  if (resolvedProfileId && !execution) {
    const running = await database.getRunningExecutionForInventory(
      input.inventoryId,
    );
    logger.warn(
      `Concurrent execution guard: blocked remediation on inventory ${input.inventoryId}`,
    );
    throw new ComplianceOperationError(409, {
      error: {
        name: 'ConflictError',
        message: 'A remediation is already running on this inventory',
        detail: running
          ? {
              executionId: running.id,
              profileId: running.remediationProfileId,
              startedAt: running.startedAt,
              status: running.status,
            }
          : undefined,
      },
    });
  }

  const findings = await service.getFindings(
    undefined,
    remediateRequest.profileId,
    remediateRequest.inventoryId,
  );
  logger.info(
    `Findings for remediation (profile=${remediateRequest.profileId}, inventory=${remediateRequest.inventoryId}): ${findings.length} rules`,
  );

  const plan = service.buildRemediationPlan(
    remediateRequest.selections,
    findings,
  );
  logger.info(
    `Remediation plan: ${plan.groups.length} groups, ${plan.totalRules} rules, ${plan.totalHosts} hosts`,
  );

  if (plan.groups.length > 0) {
    try {
      const inventoryHosts = await service.getInventoryHostnames(
        remediateRequest.inventoryId,
        userToken,
      );
      const inventoryHostSet = new Set(inventoryHosts);
      const planHosts = new Set(
        plan.groups.flatMap(
          g =>
            g.limit
              ?.split(/[,\s]+/)
              .map(h => h.trim())
              .filter(Boolean) ?? [],
        ),
      );
      const missing = [...planHosts].filter(h => !inventoryHostSet.has(h));
      if (missing.length > 0) {
        logger.warn(
          `Host validation: ${missing.length} hosts from plan not found in inventory ${remediateRequest.inventoryId}: ${missing.join(', ')}`,
        );
        throw new ComplianceOperationError(422, {
          error: `${missing.length} host(s) from scan findings not found in target inventory: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` (+${missing.length - 5} more)` : ''}. The inventory may have changed since the last scan.`,
        });
      }
    } catch (hostErr) {
      if (hostErr instanceof ComplianceOperationError) throw hostErr;
      logger.debug(
        `Host validation skipped: ${hostErr instanceof Error ? hostErr.message : hostErr}`,
      );
    }
  }

  if (execution) {
    await database.updateExecutionStatus(execution.id, {
      status: 'pending',
      rulesApplied: plan.totalRules,
      hostsTargeted: plan.totalHosts,
      planSummary: plan,
    });
  }

  let result;
  try {
    result = await service.launchRemediation(
      remediateRequest,
      findings,
      userToken,
    );
  } catch (launchErr) {
    if (execution) {
      await database.updateExecutionStatus(execution.id, {
        status: 'failed',
        completedAt: new Date().toISOString(),
      });
    }
    const msg =
      launchErr instanceof Error ? launchErr.message : String(launchErr);
    const isUserError =
      msg.includes('No failing hosts') ||
      msg.includes('No compliance remediate job template');
    if (isUserError) {
      logger.warn(`Remediation blocked: ${msg}`);
      throw new ComplianceOperationError(422, { error: msg });
    }
    logger.error(`Failed to launch remediation: ${msg}`);
    throw new ComplianceOperationError(500, { error: msg });
  }

  if (execution) {
    await database.updateExecutionStatus(execution.id, {
      status: 'running',
      primaryJobId: result.workflowJobId,
      allJobIds: result.allJobIds || [result.workflowJobId],
    });
  }

  // Create a scan record so remediations appear in Recent Activity.
  // Phase 3a (ADR-014 §3) removed the old dual-write but the dashboard's
  // getRecentScans reads from compliance_scans — without this record,
  // remediations are invisible on the Overview tab.
  await database.createScan({
    profileId: remediateRequest.profileId,
    inventoryId: remediateRequest.inventoryId,
    scanner: 'remediation',
    scanType: 'remediation',
    workflowJobId: result.workflowJobId,
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    errorDetails: null,
  });

  return {
    ...result,
    executionId: execution?.id ?? null,
  } as LaunchRemediationResponse;
}

// ── Profile lifecycle ─────────────────────────────────────────────────────

export async function handleProfileSave(
  input: SaveProfileRequest,
  { database, logger }: Pick<HandlerDeps, 'database' | 'logger'>,
): Promise<ComplianceProfile> {
  try {
    return await database.saveProfile(input);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to save compliance profile: ${msg}`);
    throw new ComplianceOperationError(500, {
      error: 'Failed to save compliance profile',
    });
  }
}

export async function handleProfileDelete(
  input: { id: string },
  { database, logger }: Pick<HandlerDeps, 'database' | 'logger'>,
): Promise<{ id: string }> {
  try {
    const deleted = await database.deleteProfile(input.id);
    if (!deleted) {
      throw new ComplianceOperationError(404, {
        error: 'Compliance profile not found',
      });
    }
    return { id: input.id };
  } catch (error) {
    if (error instanceof ComplianceOperationError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to delete compliance profile: ${msg}`);
    throw new ComplianceOperationError(500, {
      error: 'Failed to delete compliance profile',
    });
  }
}

// ── Registration ───────────────────────────────────────────────────────────

/**
 * Register compliance's four write operations with the host's
 * `PortalOperations` registry. Called unconditionally from `plugin.ts`
 * (independent of `ansible.compliance.authMode`) — registration has no
 * security implication on its own; it is `operations.execute()`, reached
 * only from the production-mode branch of each legacy transport adapter,
 * that actually enforces permissions and emits audit events.
 */
export function registerComplianceOperations(options: {
  operations: PortalOperations;
  service: ComplianceService;
  database: ComplianceDatabase;
  logger: LoggerService;
}): void {
  const { operations, service, database, logger } = options;
  const deps: HandlerDeps = { service, database, logger };

  operations.register({
    pluginId: 'compliance',
    descriptor: complianceScanLaunchOperation,
    handler: request =>
      handleScanLaunch(
        request.input as unknown as LaunchScanRequest & { aapToken?: string },
        deps,
      ),
  });

  operations.register({
    pluginId: 'compliance',
    descriptor: complianceRemediationLaunchOperation,
    handler: (request, context) =>
      handleRemediationLaunch(
        request.input as unknown as LaunchRemediationRequest & {
          aapToken?: string;
        },
        deps,
        context.userEntityRef,
      ),
  });

  operations.register({
    pluginId: 'compliance',
    descriptor: complianceProfileSaveOperation,
    handler: request =>
      handleProfileSave(request.input as unknown as SaveProfileRequest, deps),
  });

  operations.register({
    pluginId: 'compliance',
    descriptor: complianceProfileDeleteOperation,
    handler: request =>
      handleProfileDelete(request.input as { id: string }, deps),
  });
}
