import type express from 'express';
import type { RouterDependencies } from './types';
import { requirePermission } from './permissions';

export function registerHealthRoutes(
  router: express.Router,
  deps: RouterDependencies,
): void {
  const { logger, service, database, httpAuth, permissions, state } = deps;

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      dataSource: service.getDataSource(),
      retentionDays: state.retentionDays,
    });
  });

  router.post('/settings', async (req, res) => {
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

    if (req.body.retentionDays && typeof req.body.retentionDays === 'number') {
      state.retentionDays = Math.max(7, Math.min(365, req.body.retentionDays));
      logger.info(`Data retention updated to ${state.retentionDays} days`);
    }
    res.json({ retentionDays: state.retentionDays });
  });

  router.post('/cleanup', async (req, res) => {
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

    try {
      const deleted = await database.cleanupOldFindings(state.retentionDays);
      logger.info(
        `Manual cleanup: removed ${deleted} findings older than ${state.retentionDays} days`,
      );
      res.json({ deleted, retentionDays: state.retentionDays });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Cleanup failed: ${msg}`);
      res.status(500).json({ error: 'Data cleanup failed' });
    }
  });
}
