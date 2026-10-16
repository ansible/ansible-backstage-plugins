/**
 * @ansible/portal-health-backend
 *
 * Backstage backend plugin that aggregates portal plugin health statuses.
 *
 * Exposes `GET /api/portal-health/status` → JSON map of pluginId → HealthStatus.
 * Health is populated by backend plugins via `portal-plugin-node`'s
 * `pushHealthStatus()` — this plugin only reads and exposes the registry.
 *
 * @example
 * ```ts
 * // In your backend/src/index.ts:
 * backend.add(import('@ansible/portal-health-backend'));
 * ```
 */
export { portalHealthPlugin as default } from './plugin';
export { portalHealthPlugin } from './plugin';
export { createRouter } from './router';
