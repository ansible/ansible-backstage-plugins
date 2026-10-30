import type express from 'express';
import type { RouterDependencies } from './types';
import { parseInventoryId } from './validation';

export function registerDashboardRoutes(
  router: express.Router,
  deps: RouterDependencies,
): void {
  const { logger, service } = deps;

  router.get('/dashboard', async (_req, res) => {
    try {
      const stats = await service.getDashboardStats();
      res.json(stats);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get dashboard stats: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve dashboard statistics' });
    }
  });

  router.get('/dashboard/scans-for-profile/:profileId', async (req, res) => {
    const { profileId } = req.params;
    try {
      const stats = await service.getDashboardStats();
      const fw = stats.frameworkScores.find(f => f.profileId === profileId);
      res.json(fw?.contributingScans ?? []);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get contributing scans: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve contributing scans' });
    }
  });

  router.get('/posture', async (req, res) => {
    const profileId = req.query.profileId as string | undefined;
    const inventoryId = parseInventoryId(req.query.inventoryId as string | undefined);
    if (req.query.inventoryId && inventoryId === undefined) {
      res.status(400).json({ error: 'inventoryId must be a positive integer' });
      return;
    }
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    try {
      const history = await service.getPostureHistory(profileId, days, inventoryId);
      res.json(history);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get posture history: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve posture history' });
    }
  });

  router.get('/posture/events', async (req, res) => {
    const inventoryId = parseInventoryId(req.query.inventoryId as string | undefined);
    if (req.query.inventoryId && inventoryId === undefined) {
      res.status(400).json({ error: 'inventoryId must be a positive integer' });
      return;
    }
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 90));
    try {
      const events = await service.getRemediationEventsForTrend(days, inventoryId);
      res.json(events);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get remediation events: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve remediation events' });
    }
  });
}
