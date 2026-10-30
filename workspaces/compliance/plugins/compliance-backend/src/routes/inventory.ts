import type express from 'express';
import type { RouterDependencies } from './types';
import { isNonEmptyString } from './validation';

export function registerInventoryRoutes(
  router: express.Router,
  deps: RouterDependencies,
): void {
  const { logger, service, database } = deps;

  const resolveProfile = async (query: Record<string, any>): Promise<string | null> => {
    const raw = (query.profile || query.profileId) as string | undefined;
    if (!raw || !isNonEmptyString(raw)) return null;
    return database.resolveProfileId(raw);
  };

  router.get('/inventory/:inventoryId/host-posture', async (req, res) => {
    const inventoryId = Number(req.params.inventoryId);
    if (isNaN(inventoryId) || !Number.isInteger(inventoryId) || inventoryId < 1) {
      res.status(400).json({ error: 'inventoryId must be a positive integer' });
      return;
    }

    const profileId = await resolveProfile(req.query);
    if (!profileId) {
      res.status(400).json({ error: 'profile or profileId query parameter is required' });
      return;
    }

    try {
      const baselineView = req.query.baselineView === 'true';
      const result = await service.getHostPosture(inventoryId, profileId, req, { baselineView });
      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get host posture for inventory ${inventoryId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  router.get('/inventory/:inventoryId/host/:hostname/findings', async (req, res) => {
    const inventoryId = Number(req.params.inventoryId);
    if (isNaN(inventoryId) || !Number.isInteger(inventoryId) || inventoryId < 1) {
      res.status(400).json({ error: 'inventoryId must be a positive integer' });
      return;
    }

    const { hostname } = req.params;
    if (!hostname || !isNonEmptyString(hostname)) {
      res.status(400).json({ error: 'hostname path parameter is required' });
      return;
    }

    const profileId = await resolveProfile(req.query);
    if (!profileId) {
      res.status(400).json({ error: 'profile or profileId query parameter is required' });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);

    try {
      const result = await service.getHostFindings(inventoryId, hostname, profileId, limit);
      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get host findings for ${hostname} in inventory ${inventoryId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

}
