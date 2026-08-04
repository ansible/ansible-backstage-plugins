import type express from 'express';
import type { RouterDependencies } from './types';
import type {
  LaunchRemediationRequest,
  SaveRemediationProfileRequest,
} from '@ansible/backstage-compliance-common';
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

export function registerRemediationRoutes(
  router: express.Router,
  deps: RouterDependencies,
): void {
  const { logger, service, database, httpAuth, permissions, state } = deps;

  router.post('/remediate', async (req, res) => {
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

    const body = req.body;
    const userToken = getUserAapToken(req);

    if (!isNonEmptyString(body.profileId)) {
      res.status(400).json({
        error: 'profileId is required and must be a non-empty string',
      });
      return;
    }
    if (!isPositiveInteger(body.inventoryId)) {
      res.status(400).json({
        error: 'inventoryId is required and must be a positive integer',
      });
      return;
    }
    if (!isArray(body.selections)) {
      res
        .status(400)
        .json({ error: 'selections is required and must be an array' });
      return;
    }

    for (let i = 0; i < body.selections.length; i++) {
      const sel = body.selections[i];
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

    let resolvedScanId = body.scanId as string | undefined;
    if (!resolvedScanId) {
      const authScan = await database.getAuthoritativeScan(
        body.profileId,
        body.inventoryId,
      );
      if (!authScan) {
        res.status(400).json({
          error: `No completed assessment scan exists for this profile and inventory. Run a scan first.`,
        });
        return;
      }
      resolvedScanId = authScan.id;
    }

    const remediateRequest: LaunchRemediationRequest = {
      profileId: body.profileId,
      inventoryId: body.inventoryId,
      selections: body.selections,
      limit: body.limit,
      scanId: resolvedScanId,
    };

    const enabledCount = body.selections.filter(
      (s: { enabled: boolean }) => s.enabled,
    ).length;
    logger.info(
      `Launching remediation for profile=${remediateRequest.profileId}` +
        ` with ${body.selections.length} selections (${enabledCount} enabled)` +
        ` (scan=${resolvedScanId}, inventory=${body.inventoryId})`,
    );

    try {
      const resolvedProfileId = body.remediationProfileId;
      let execution: Awaited<
        ReturnType<typeof database.createExecution>
      > | null = null;
      const userIdentity = await extractUserIdentity(req, httpAuth);
      if (resolvedProfileId) {
        execution = await database.createExecution({
          remediationProfileId: resolvedProfileId,
          inventoryId: body.inventoryId,
          informingScanId: resolvedScanId,
          createdBy: userIdentity,
        });
      }

      if (resolvedProfileId && !execution) {
        const running = await database.getRunningExecutionForInventory(
          body.inventoryId,
        );
        logger.warn(
          `Concurrent execution guard: blocked remediation on inventory ${body.inventoryId}`,
        );
        res.status(409).json({
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
        return;
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

      if (plan.groups.length > 0 && service.getDataSource() === 'live') {
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
              `Host validation: ${
                missing.length
              } hosts from plan not found in inventory ${
                remediateRequest.inventoryId
              }: ${missing.join(', ')}`,
            );
            res.status(422).json({
              error: `${
                missing.length
              } host(s) from scan findings not found in target inventory: ${missing
                .slice(0, 5)
                .join(', ')}${
                missing.length > 5 ? ` (+${missing.length - 5} more)` : ''
              }. The inventory may have changed since the last scan.`,
            });
            return;
          }
        } catch (hostErr) {
          logger.debug(
            `Host validation skipped: ${
              hostErr instanceof Error ? hostErr.message : hostErr
            }`,
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
        throw launchErr;
      }

      if (execution) {
        await database.updateExecutionStatus(execution.id, {
          status: 'running',
          primaryJobId: result.workflowJobId,
          allJobIds: result.allJobIds || [result.workflowJobId],
        });
      }

      // Create a scan record so remediations appear in Recent Activity.
      // Phase 3a (ADR-014 §3) removed the old dual-write but the
      // dashboard's getRecentScans reads from compliance_scans — without
      // this record, remediations are invisible on the Overview tab.
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

      res.json({ ...result, executionId: execution?.id ?? null, plan });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isUserError =
        msg.includes('No failing hosts') ||
        msg.includes('No compliance remediate job template');
      if (isUserError) {
        logger.warn(`Remediation blocked: ${msg}`);
        res.status(422).json({ error: msg });
      } else {
        logger.error(`Failed to launch remediation: ${msg}`);
        res.status(500).json({ error: msg });
      }
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
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

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
        `Failed to fetch remediation error details: ${
          err instanceof Error ? err.message : err
        }`,
      );
      res.json({ errorDetails: null });
    }
  });

  router.patch('/remediation-profiles/:id', async (req, res) => {
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

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
            `Reconciliation: Controller unreachable for execution ${
              exec.id
            }, skipping: ${
              controllerErr instanceof Error
                ? controllerErr.message
                : controllerErr
            }`,
          );
        }
      }
    } catch (err) {
      logger.warn(
        `Execution reconciliation failed: ${
          err instanceof Error ? err.message : err
        }`,
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
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

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
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

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
