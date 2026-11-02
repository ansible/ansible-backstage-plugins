import type express from 'express';
import type { RouterDependencies } from './types';
import type {
  LaunchRemediationRequest,
  SaveRemediationProfileRequest,
} from '@ansible/compliance-common';
import {
  remediateLaunchPermission,
  complianceRemediationLaunchOperation,
} from '@ansible/compliance-common';
import { resolvePortalContext } from '@ansible/portal-plugin-node';
import {
  requirePermission,
  getUserAapToken,
  extractUserIdentity,
} from './permissions';
import {
  isNonEmptyString,
  isPositiveInteger,
  isBoolean,
  isArray,
} from './validation';
import {
  COMPLIANCE_OPERATION_SUBJECT,
  handleRemediationLaunch,
  sendOperationError,
} from '../operations';

export function registerRemediationRoutes(
  router: express.Router,
  deps: RouterDependencies,
): void {
  const {
    logger,
    service,
    database,
    httpAuth,
    permissions,
    operations,
    userInfo,
    organizations,
    state,
  } = deps;

  // Legacy transport adapter (Content Experience Architecture §9.2): the
  // actual remediation-launch business logic lives in
  // `handleRemediationLaunch()` (`compliance-backend/src/operations.ts`),
  // registered with the host's `PortalOperations` as
  // `compliance.remediation.launch`. This route only translates between
  // Express and that operation — see `routes/scans.ts`'s `POST /scan` for
  // the identical production/development branching this mirrors.
  router.post('/remediate', async (req, res) => {
    const body = req.body;
    const input: LaunchRemediationRequest & { aapToken?: string } = {
      profileId: body.profileId,
      inventoryId: body.inventoryId,
      selections: body.selections,
      limit: body.limit,
      scanId: body.scanId,
      remediationProfileId: body.remediationProfileId,
      aapToken: getUserAapToken(req),
    };

    if (operations && httpAuth && permissions && userInfo && organizations) {
      try {
        // Express Request (express-promise-router) vs Backstage's `credentials` param use incompatible Express generics; runtime value is valid.
        // @ts-expect-error Avoid double assertion flagged by Sonar; types do not overlap per TS.
        const credentials = await httpAuth.credentials(req, {
          allow: ['user'],
        });
        const context = await resolvePortalContext({
          credentials,
          userInfo,
          organizations,
        });
        const result = await operations.execute(
          complianceRemediationLaunchOperation.id,
          {
            subject: { entityRef: COMPLIANCE_OPERATION_SUBJECT },
            input: input as unknown as Record<string, unknown>,
          },
          { ...context, credentials },
          permissions,
        );
        res.json(result);
      } catch (error) {
        sendOperationError(res, error, {
          status: 500,
          body: { error: 'Failed to launch remediation' },
        });
      }
      return;
    }

    if (!isNonEmptyString(input.profileId)) {
      res.status(400).json({
        error: 'profileId is required and must be a non-empty string',
      });
      return;
    }
    if (!isPositiveInteger(input.inventoryId)) {
      res.status(400).json({
        error: 'inventoryId is required and must be a positive integer',
      });
      return;
    }
    if (!isArray(input.selections)) {
      res
        .status(400)
        .json({ error: 'selections is required and must be an array' });
      return;
    }
    for (let i = 0; i < input.selections.length; i++) {
      const sel = input.selections[i];
      if (!isNonEmptyString(sel?.ruleId)) {
        res.status(400).json({
          error: `selections[${i}].ruleId is required and must be a non-empty string`,
        });
        return;
      }
      if (!isBoolean(sel?.enabled)) {
        res.status(400).json({
          error: `selections[${i}].enabled is required and must be a boolean`,
        });
        return;
      }
    }

    const enabledCount = input.selections.filter(s => s.enabled).length;
    logger.info(
      `Launching remediation for profile=${input.profileId}` +
        ` with ${input.selections.length} selections (${enabledCount} enabled)` +
        ` (inventory=${input.inventoryId})`,
    );

    try {
      const userIdentity = await extractUserIdentity(req, httpAuth);
      const result = await handleRemediationLaunch(
        input,
        { service, database, logger },
        userIdentity,
      );
      res.json(result);
    } catch (error) {
      sendOperationError(res, error, {
        status: 500,
        body: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  });

  router.get('/remediation-executions', async (req, res) => {
    const profileId = req.query.profileId as string | undefined;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    if (profileId) {
      const executions = await database.getExecutionsByProfileId(
        profileId,
        limit,
      );
      res.json(executions);
    } else {
      const executions = await database.getRecentExecutions(limit);
      res.json(executions);
    }
  });

  router.get('/remediation-executions/:id', async (req, res) => {
    const execution = await database.getExecutionById(req.params.id);
    if (!execution) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }
    res.json(execution);
  });

  router.get('/chain/:executionId', async (req, res) => {
    const execution = await database.getExecutionById(req.params.executionId);
    if (!execution) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }

    const scanIds: string[] = [];
    if (execution.informingScanId) scanIds.push(execution.informingScanId);
    if (execution.verificationScanId)
      scanIds.push(execution.verificationScanId);

    const [assessmentScan, verificationScan, batchStats] = await Promise.all([
      execution.informingScanId
        ? database.getScanById(execution.informingScanId)
        : null,
      execution.verificationScanId
        ? database.getScanById(execution.verificationScanId)
        : null,
      scanIds.length > 0 ? database.getBatchScanStatsAggregated(scanIds) : {},
    ]);

    const toStats = (scanId: string | null) => {
      if (!scanId) return null;
      const s = (
        batchStats as Record<
          string,
          { pass: number; fail: number; rules: number; hosts: number }
        >
      )[scanId];
      if (!s) return null;
      return { pass: s.pass, fail: s.fail, rules: s.rules, hosts: s.hosts };
    };

    let delta: { fixed: number; regressed: number; unchanged: number } | null =
      null;
    if (execution.informingScanId && execution.verificationScanId) {
      delta = await database.getDeltaBetweenScans(
        execution.informingScanId,
        execution.verificationScanId,
      );
    }

    res.json({
      execution,
      assessmentScan,
      assessmentStats: toStats(execution.informingScanId),
      verificationScan,
      verificationStats: toStats(execution.verificationScanId),
      delta,
    });
  });

  router.patch('/remediation-executions/:id', async (req, res) => {
    if (
      !(await requirePermission(
        req,
        res,
        httpAuth,
        permissions,
        remediateLaunchPermission,
      ))
    )
      return;

    const execution = await database.getExecutionById(req.params.id);
    if (!execution) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }
    const validStatuses = [
      'pending',
      'running',
      'succeeded',
      'failed',
      'cancelled',
    ];
    const {
      status,
      completedAt,
      elapsedSeconds,
      rulesApplied,
      rulesFailed,
      hostsTargeted,
      hostsSucceeded,
      hostsFailed,
      primaryJobId,
      allJobIds,
    } = req.body;
    if (status && !validStatuses.includes(status)) {
      res
        .status(400)
        .json({ error: `status must be one of: ${validStatuses.join(', ')}` });
      return;
    }
    await database.updateExecutionStatus(req.params.id, {
      status: status ?? execution.status,
      completedAt,
      elapsedSeconds,
      rulesApplied,
      rulesFailed,
      hostsTargeted,
      hostsSucceeded,
      hostsFailed,
      primaryJobId,
      allJobIds,
    });

    // When execution reaches a terminal state, update the corresponding
    // remediation scan record so Recent Activity shows the final status.
    const terminalStatuses = ['succeeded', 'failed', 'cancelled'];
    if (status && terminalStatuses.includes(status) && execution.primaryJobId) {
      const scanRecord = await database.getScanByWorkflowJobId(
        execution.primaryJobId,
      );
      if (scanRecord && scanRecord.scanner === 'remediation') {
        const scanStatus = status === 'succeeded' ? 'completed' : 'failed';
        await database.updateScanStatus(
          scanRecord.id,
          scanStatus,
          completedAt || new Date().toISOString(),
        );
      }
    }

    const updated = await database.getExecutionById(req.params.id);
    res.json(updated);
  });

  router.get('/remediation-error-details', async (req, res) => {
    const jobIdsParam = req.query.jobIds as string;
    if (!jobIdsParam) {
      res.status(400).json({ error: 'jobIds query parameter required' });
      return;
    }
    const jobIds = jobIdsParam
      .split(',')
      .map(Number)
      .filter(n => !Number.isNaN(n))
      .slice(0, 20);
    if (jobIds.length === 0) {
      res.json({ errorDetails: null });
      return;
    }
    const userToken = getUserAapToken(req);
    try {
      const details = await service.fetchRemediationErrorDetails(
        jobIds,
        userToken,
      );
      res.json({ errorDetails: details });
    } catch (err) {
      logger.warn(
        `Failed to fetch remediation error details: ${err instanceof Error ? err.message : err}`,
      );
      res.json({ errorDetails: null });
    }
  });

  router.patch('/remediation-profiles/:id', async (req, res) => {
    if (
      !(await requirePermission(
        req,
        res,
        httpAuth,
        permissions,
        remediateLaunchPermission,
      ))
    )
      return;

    const { status } = req.body;
    if (!status || !['draft', 'saved', 'archived'].includes(status)) {
      res
        .status(400)
        .json({ error: 'status must be one of: draft, saved, archived' });
      return;
    }
    if (status === 'archived') {
      const isPinned = await database.isProfilePinnedAsBaseline(req.params.id);
      if (isPinned) {
        res.status(409).json({
          error:
            'Cannot archive a profile pinned as a golden standard. Unpin it first.',
        });
        return;
      }
    }
    const updated = await database.updateRemediationProfileStatus(
      req.params.id,
      status,
    );
    if (!updated) {
      res.status(404).json({ error: 'Remediation profile not found' });
      return;
    }
    const profile = await database.getRemediationProfile(req.params.id);
    res.json(profile);
  });

  router.get('/remediation-profiles', async (req, res) => {
    // Throttled execution reconciliation
    try {
      const userToken = getUserAapToken(req);
      const now = Date.now();
      const running = await database.getStaleRunningExecutions(0);
      for (const exec of running) {
        if (!exec.primaryJobId) continue;
        if (
          now - (state.executionReconcileThrottle.get(exec.id) ?? 0) <
          state.STALE_CHECK_INTERVAL_MS
        )
          continue;
        state.executionReconcileThrottle.set(exec.id, now);
        try {
          const job = await service.getJobStatus(exec.primaryJobId, userToken);
          if (['running', 'pending', 'waiting', 'new'].includes(job.status)) {
            continue;
          }
          const resolvedStatus =
            job.status === 'successful' ? 'succeeded' : 'failed';
          logger.info(
            `Reconciled execution ${exec.id} (job ${exec.primaryJobId}) → ${resolvedStatus}`,
          );
          await database.updateExecutionStatus(exec.id, {
            status: resolvedStatus as 'succeeded' | 'failed',
            completedAt: job.finished ?? new Date().toISOString(),
            elapsedSeconds: job.elapsed ? Math.round(job.elapsed) : undefined,
          });
          state.executionReconcileThrottle.delete(exec.id);
        } catch (controllerErr) {
          logger.debug(
            `Reconciliation: Controller unreachable for execution ${exec.id}, skipping: ${controllerErr instanceof Error ? controllerErr.message : controllerErr}`,
          );
        }
      }
    } catch (err) {
      logger.warn(
        `Execution reconciliation failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    const statusFilter = req.query.status as string | undefined;
    const validStatuses = ['draft', 'saved', 'archived', 'all'];
    const filter =
      statusFilter && validStatuses.includes(statusFilter)
        ? (statusFilter as 'draft' | 'saved' | 'archived' | 'all')
        : undefined;
    const profiles = await service.getRemediationProfiles(filter);
    res.json(profiles);
  });

  router.get('/remediation-profiles/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const profile = await service.getRemediationProfile(id);
      if (!profile) {
        res.status(404).json({ error: 'Remediation profile not found' });
        return;
      }
      res.json(profile);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get remediation profile: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve remediation profile' });
    }
  });

  router.post('/remediation-profiles', async (req, res) => {
    if (
      !(await requirePermission(
        req,
        res,
        httpAuth,
        permissions,
        remediateLaunchPermission,
      ))
    )
      return;

    const body = req.body;

    if (!isNonEmptyString(body.name)) {
      res
        .status(400)
        .json({ error: 'name is required and must be a non-empty string' });
      return;
    }
    if (!isArray(body.selections)) {
      res
        .status(400)
        .json({ error: 'selections is required and must be an array' });
      return;
    }
    const validStatuses = ['draft', 'saved', 'archived'];
    if (body.status && !validStatuses.includes(body.status)) {
      res
        .status(400)
        .json({ error: `status must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    const saveRequest: SaveRemediationProfileRequest = {
      id: body.id,
      name: body.name,
      description: body.description ?? '',
      complianceProfileId: body.complianceProfileId ?? '',
      scanId: body.scanId,
      selections: body.selections,
      status: body.status,
    };

    try {
      const profile = await service.saveRemediationProfile(saveRequest);
      res.status(201).json(profile);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to save remediation: ${msg}`);
      res.status(500).json({ error: 'Failed to save remediation profile' });
    }
  });

  router.delete('/remediation-profiles/:id', async (req, res) => {
    if (
      !(await requirePermission(
        req,
        res,
        httpAuth,
        permissions,
        remediateLaunchPermission,
      ))
    )
      return;

    const { id } = req.params;
    try {
      const deleted = await service.deleteRemediationProfile(id);
      if (!deleted) {
        res.status(404).json({ error: 'Remediation profile not found' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Cannot delete') || msg.includes('RESTRICT')) {
        res.status(409).json({ error: msg });
        return;
      }
      logger.error(`Failed to delete remediation profile: ${msg}`);
      res.status(500).json({ error: 'Failed to delete remediation profile' });
    }
  });
}
