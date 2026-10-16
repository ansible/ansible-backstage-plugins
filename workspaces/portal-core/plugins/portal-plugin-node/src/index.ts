/**
 * @ansible/portal-plugin-node
 *
 * Server-side SDK for Ansible portal backend plugins.
 *
 * Provides:
 * - `createPortalPlugin()` — factory for the plugin SDK object
 * - `createIdentityMiddleware()` — Express middleware that attaches req.portalContext
 * - `withOrganization()` — org-keyed DB helper (enforces every query carries the key)
 * - `HealthRegistry`, `getAllHealthStatuses()` — push-based health reporting
 * - Types: `PortalContext`, `HealthStatus`, `AuditEvent`, `HealthState`
 *
 * All exports and API surface are stable.
 */

// ── Factory ───────────────────────────────────────────────────────────────────
export { createPortalPlugin } from './createPortalPlugin';
export type {
  CreatePortalPluginOptions,
  PortalPlugin,
} from './createPortalPlugin';

// ── Identity middleware ────────────────────────────────────────────────────────
export { createIdentityMiddleware, parseEntityRef } from './middleware';
export { resolveOrganizationMemberships } from './entitlements';
export type { IdentityMiddlewareOptions } from './middleware';
export { resolvePortalContext } from './organizationContext';

// ── Health registry ────────────────────────────────────────────────────────────
export {
  HealthRegistry,
  PortalHealth,
  portalHealthServiceRef,
  getOrCreateHealthRegistry,
  getAllHealthStatuses,
} from './healthRegistry';

// ── Audit emitter ─────────────────────────────────────────────────────────────
export { AuditEmitter } from './auditEmitter';

// ── Org-keyed DB helper ────────────────────────────────────────────────────────
export { withOrganization } from './withOrganization';
export { PortalOperations, portalOperationsServiceRef } from './operations';
export type { OperationContext, OperationRegistration } from './operations';
export {
  PortalEntitlements,
  ConfiguredOrganizationResolver,
  portalActiveOrganizationServiceRef,
  portalEntitlementsServiceRef,
} from './entitlements';
export type {
  ActiveOrganizationResolver,
  EntitlementDecision,
} from './entitlements';

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  PortalContext,
  HealthState,
  HealthStatus,
  AuditEvent,
  AuditOutcome,
} from './types';
