/**
 * Types for `@ansible/portal-plugin-node`.
 *
 * All types here are serialisable and have no runtime dependencies on Express
 * or Backstage services — they can be imported by tests and common libraries
 * without pulling in the full backend stack.
 */

// ── Portal context ─────────────────────────────────────────────────────────────

/**
 * Authenticated request context attached to `req.portalContext` by
 * `createIdentityMiddleware`. Every route handler that needs the caller's
 * identity reads from here — it does **not** accept caller-supplied IDs.
 *
 * `organizationId` comes from the injected host organization resolver, not
 * the user namespace or request input. Catalog placement is a separate,
 * explicit host policy; it is not proof of organization membership.
 */
export interface PortalContext {
  /** Full Backstage entity reference (e.g. `user:default/johndoe`). */
  userEntityRef: string;
  /** Catalog user name; may be ID-based and is not necessarily the AAP login. */
  userId: string;
  /**
   * Trusted active organization resolved by the host.
   * Use this as the partition key on every database query.
   */
  organizationId?: string;
  /** Trusted memberships when there is no single active organization. */
  organizationIds?: readonly string[];
}

// ── Health ────────────────────────────────────────────────────────────────────

/**
 * Health states for a portal plugin.
 *
 * - `READY` — plugin is operating normally.
 * - `DEGRADED` — plugin is running but some capabilities may be impaired.
 * - `UNAVAILABLE` — plugin cannot serve requests (workers stopped, etc.).
 * - `UNKNOWN` — no health report has been received yet.
 */
export type HealthState = 'READY' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN';

/** Health status pushed by a portal plugin to the host registry. */
export interface HealthStatus {
  state: HealthState;
  /** Human-readable message describing the current state. */
  message: string;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

/** Outcome of an audited operation. */
export type AuditOutcome = 'SUCCESS' | 'FAILURE';

/**
 * An auditable operation invocation.
 *
 * Every server-side effect that goes through a registered operation emits one
 * of these. In Phase 5 they are structured log entries. In a later phase they
 * will be persisted to a durable audit store via the operation pipeline.
 */
export interface AuditEvent {
  /** Stable operation ID. Convention: `'<pluginId>.<domain>.<verb>'`. */
  operationId: string;
  /** User who invoked the operation (from `req.portalContext.userId`). */
  userId: string;
  /** Organization for this invocation (from `req.portalContext.organizationId`). */
  organizationId?: string;
  /** Membership context; not ownership of the operation's resource. */
  organizationIds?: readonly string[];
  /** Sanitised input payload (no secrets). */
  input?: Record<string, unknown>;
  /** Whether the operation succeeded or failed. */
  outcome: AuditOutcome;
  /** Error message when `outcome === 'FAILURE'`. */
  error?: string;
}

// ── Express augmentation ──────────────────────────────────────────────────────

/**
 * Augments the Express `Request` type so that `req.portalContext` is
 * statically typed wherever this package is imported.
 *
 * `portalContext` is `undefined` when the identity middleware is not present
 * on the route or when the request is unauthenticated (the middleware calls
 * `next()` rather than blocking unauthenticated requests).
 */
declare module 'express' {
  interface Request {
    portalContext?: PortalContext;
  }
}
