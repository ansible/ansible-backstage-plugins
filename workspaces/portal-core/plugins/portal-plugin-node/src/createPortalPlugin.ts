import type { RequestHandler } from 'express';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { HealthStatus, AuditEvent } from './types';
import type { IdentityMiddlewareOptions } from './middleware';
import { createIdentityMiddleware } from './middleware';
import {
  HealthRegistry,
  getOrCreateHealthRegistry,
  type PortalHealth,
} from './healthRegistry';
import { AuditEmitter } from './auditEmitter';

// ── Public interface ──────────────────────────────────────────────────────────

/** Options for `createPortalPlugin`. */
export interface CreatePortalPluginOptions {
  /**
   * Unique stable ID for this plugin.
   *
   * Convention: `'<team>-<domain>'` (e.g. `'content-quality'`, `'apme'`).
   * Used as the registry key for health status and as the `plugin` field on
   * all audit log entries emitted by this instance.
   */
  pluginId: string;
  /** Inject the root service when running as a separately bundled dynamic plugin. */
  health?: PortalHealth;
}

/** The object returned by `createPortalPlugin`. */
export interface PortalPlugin {
  /**
   * Creates an Express `RequestHandler` that attaches `req.portalContext`
   * (organizationId, userId, userEntityRef) to every authenticated request.
   *
   * Apply this middleware early in your router:
   * ```ts
   * const middleware = portalPlugin.createMiddleware({ httpAuth, userInfo, organizations, logger });
   * router.use(middleware);
   * ```
   *
   * If identity resolution fails (unauthenticated request, service error),
   * the middleware calls `next()` without setting `portalContext` and logs
   * a debug message. Route handlers must check for `portalContext` when they
   * need it.
   *
   * Calling this method also configures the plugin's audit emitter with the
   * provided `logger`. Equivalent to calling `withLogger(options.logger)`.
   */
  createMiddleware(options: IdentityMiddlewareOptions): RequestHandler;

  /**
   * Push a health status update for this plugin.
   *
   * Health is pushed by plugins — it is not polled from a plugin-owned URL.
   * Call this after your plugin's workers and dependencies are confirmed
   * healthy (e.g. at the end of backend module `init`).
   *
   * The status is stored in the process-level `HealthRegistry` and is
   * accessible via `getAllHealthStatuses()` for the host's aggregation endpoint.
   *
   * @example
   * ```ts
   * portalPlugin.pushHealthStatus({ state: 'READY', message: 'Workers healthy.' });
   * ```
   */
  pushHealthStatus(status: HealthStatus): void;

  /** Returns the current health status for this plugin. */
  getHealthStatus(): HealthStatus;

  /**
   * Emit a structured audit log entry for an operation invocation.
   *
   * Call this after every server-side operation that causes a state change.
   * The `userId` and `organizationId` should come from `req.portalContext`.
   *
   * Requires a logger — either call `withLogger(logger)` before the first
   * emit, or call `createMiddleware({ ..., logger })` which configures the
   * emitter automatically.
   *
   * @example
   * ```ts
   * portalPlugin.emitAuditEvent({
   *   operationId: 'content-quality.scans.trigger',
   *   userId: req.portalContext!.userId,
   *   organizationId: req.portalContext!.organizationId,
   *   input: { collectionId },
   *   outcome: 'SUCCESS',
   * });
   * ```
   */
  emitAuditEvent(event: AuditEvent): void;

  /**
   * Attaches a logger to this plugin instance.
   *
   * Call this in your backend module's `init` callback if you need to emit
   * audit events before calling `createMiddleware`.
   *
   * Returns the same `PortalPlugin` instance for chaining.
   *
   * @example
   * ```ts
   * const portalPlugin = createPortalPlugin({ pluginId: 'my-plugin' })
   *   .withLogger(logger);
   * ```
   */
  withLogger(logger: LoggerService): PortalPlugin;

  /**
   * The `HealthRegistry` backing this plugin.
   * Exposed for host-side aggregation and advanced testing scenarios.
   * @internal
   */
  readonly _healthRegistry: HealthRegistry;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates a `PortalPlugin` instance for a backend plugin.
 *
 * The returned object is the entry point to the portal backend SDK:
 * - `createMiddleware()` — Express middleware that attaches `req.portalContext`
 * - `pushHealthStatus()` — push-not-poll health reporting
 * - `emitAuditEvent()` — structured audit logging
 *
 * The `PortalPlugin` instance is **not** a singleton — each call returns a
 * fresh object sharing the same underlying `HealthRegistry` (keyed by
 * `pluginId`). Create one instance per backend plugin module.
 *
 * @example
 * ```ts
 * import { createPortalPlugin } from '@ansible/portal-plugin-node';
 *
 * const portalPlugin = createPortalPlugin({ pluginId: 'content-quality' });
 *
 * // In your Backstage backend module init:
 * const middleware = portalPlugin.createMiddleware({ httpAuth, userInfo, organizations, logger });
 * router.use(middleware);
 *
 * // Signal readiness after workers are running:
 * portalPlugin.pushHealthStatus({ state: 'READY', message: 'Scan workers healthy.' });
 *
 * // After an operation completes:
 * portalPlugin.emitAuditEvent({
 *   operationId: 'content-quality.scans.trigger',
 *   userId: req.portalContext!.userId,
 *   organizationId: req.portalContext!.organizationId,
 *   outcome: 'SUCCESS',
 * });
 * ```
 */
export function createPortalPlugin(
  options: CreatePortalPluginOptions,
): PortalPlugin {
  const { pluginId } = options;
  const healthRegistry =
    options.health?.forPlugin(pluginId) ?? getOrCreateHealthRegistry(pluginId);
  let auditEmitter: AuditEmitter | null = null;

  const plugin: PortalPlugin = {
    createMiddleware(opts: IdentityMiddlewareOptions): RequestHandler {
      // Configure the audit emitter with the provided logger so that
      // emitAuditEvent() works immediately after createMiddleware() is called.
      auditEmitter = new AuditEmitter(pluginId, opts.logger);
      return createIdentityMiddleware(opts);
    },

    pushHealthStatus(status: HealthStatus): void {
      healthRegistry.push(status);
    },

    getHealthStatus(): HealthStatus {
      return healthRegistry.current();
    },

    emitAuditEvent(event: AuditEvent): void {
      if (!auditEmitter) {
        // This is a programming error — log loudly so developers notice.
        // eslint-disable-next-line no-console
        console.warn(
          `[portal-plugin-node] emitAuditEvent called on plugin "${pluginId}" ` +
            `before a logger was configured. Call withLogger(logger) or ` +
            `createMiddleware({ ..., logger }) first.`,
        );
        return;
      }
      auditEmitter.emit(event);
    },

    withLogger(logger: LoggerService): PortalPlugin {
      auditEmitter = new AuditEmitter(pluginId, logger);
      return plugin;
    },

    _healthRegistry: healthRegistry,
  };

  return plugin;
}
