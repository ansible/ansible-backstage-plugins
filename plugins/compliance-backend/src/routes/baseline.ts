import type express from 'express';
import type { RouterDependencies } from './types';
import { requirePermission } from './permissions';

export function registerBaselineRoutes(
  router: express.Router,
  deps: RouterDependencies,
): void {
  const { logger, service, database, httpAuth, permissions } = deps;

  router.get('/baseline-targets', async (req, res) => {
    const complianceProfileId = req.query.complianceProfileId as
      | string
      | undefined;
    if (complianceProfileId) {
      const targets = await database.getBaselineTargetsForProfile(
        complianceProfileId,
      );
      res.json(targets);
    } else {
      const targets = await database.getAllBaselineTargets();
      res.json(targets);
    }
  });

  router.get('/baseline-scores', async (req, res) => {
    const remediationProfileId = req.query.remediationProfileId as string;
    if (!remediationProfileId) {
      res
        .status(400)
        .json({ error: 'remediationProfileId query parameter required' });
      return;
    }
    try {
      const scores = await service.getBaselineScoresForProfile(
        remediationProfileId,
      );
      res.json(scores);
    } catch (err) {
      logger.warn(
        `Failed to fetch baseline scores: ${
          err instanceof Error ? err.message : err
        }`,
      );
      res.json([]);
    }
  });

  router.post('/baseline-targets', async (req, res) => {
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

    const { remediationProfileId, complianceProfileId, inventoryId } = req.body;
    if (!remediationProfileId || !complianceProfileId) {
      res.status(400).json({
        error: 'remediationProfileId and complianceProfileId are required',
      });
      return;
    }
    const invId = Number(inventoryId);
    if (Number.isNaN(invId) || invId <= 0) {
      res.status(400).json({ error: 'inventoryId must be a positive integer' });
      return;
    }

    const remProfile = await database.getRemediationProfile(
      remediationProfileId,
    );
    if (!remProfile) {
      res.status(404).json({ error: 'Remediation profile not found' });
      return;
    }
    if (remProfile.status !== 'saved') {
      res.status(400).json({
        error: 'Only saved remediation profiles can be pinned as baselines',
      });
      return;
    }

    try {
      const target = await database.pinBaselineTarget({
        remediationProfileId,
        complianceProfileId,
        inventoryId: invId,
      });
      res.status(201).json(target);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE constraint') || msg.includes('duplicate key')) {
        res.status(409).json({
          error:
            'A baseline is already pinned for this compliance profile and inventory. Unpin it first.',
        });
        return;
      }
      throw err;
    }
  });

  router.delete('/baseline-targets/:id', async (req, res) => {
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

    const deleted = await database.unpinBaselineTarget(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Baseline target not found' });
      return;
    }
    res.status(204).send();
  });
}
