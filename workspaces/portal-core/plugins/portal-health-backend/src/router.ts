import express from 'express';
import Router from 'express-promise-router';
import {
  getAllHealthStatuses,
  type PortalHealth,
} from '@ansible/portal-plugin-node';

/**
 * Creates the Express router for the portal-health backend plugin.
 *
 * Routes:
 * - `GET /status` — returns the aggregated health of all registered portal
 *   plugins as a JSON object keyed by plugin ID.
 *
 * @example Response shape
 * ```json
 * {
 *   "apme": { "state": "READY", "message": "Scan workers healthy." },
 *   "content-quality": { "state": "UNKNOWN", "message": "Health not yet reported." }
 * }
 * ```
 *
 * The frontend `PortalHealthStatus` component polls this endpoint and renders
 * per-plugin status chips. The endpoint is unauthenticated by default — add
 * auth middleware in the plugin factory if needed.
 */
export function createRouter(health?: PortalHealth): express.Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json(health ? health.snapshot() : getAllHealthStatuses());
  });

  return router;
}
