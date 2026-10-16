import type { HealthStatus } from './types';
import {
  createServiceFactory,
  createServiceRef,
} from '@backstage/backend-plugin-api';

/**
 * In-memory health status registry for a single portal plugin.
 *
 * Health is **pushed** by plugins (not polled from a plugin-owned URL).
 * The portal host can subscribe to status changes and aggregate statuses
 * from all registered plugins for display in the platform admin UI.
 *
 * The initial state is `UNKNOWN` — plugins should push `READY` once their
 * workers and dependencies are confirmed healthy (e.g. after backend init).
 */
export class HealthRegistry {
  private status: HealthStatus = {
    state: 'UNKNOWN',
    message: 'Health not yet reported.',
  };

  private readonly listeners: Set<(status: HealthStatus) => void> = new Set();

  /**
   * Push a new health status. All current subscribers are notified synchronously.
   */
  push(status: HealthStatus): void {
    this.status = { ...status };
    this.listeners.forEach(listener => {
      try {
        listener(this.status);
      } catch {
        // Listener errors must not interrupt the push or affect other listeners.
      }
    });
  }

  /** Returns a copy of the current health status. */
  current(): HealthStatus {
    return { ...this.status };
  }

  /**
   * Subscribe to health status changes.
   *
   * @returns An unsubscribe function. Call it to stop receiving updates.
   */
  subscribe(listener: (status: HealthStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Number of active subscribers. Useful for testing. */
  get listenerCount(): number {
    return this.listeners.size;
  }
}

/**
 * Process-level map of pluginId → HealthRegistry.
 *
 * One registry per plugin ID. Multiple calls to `getOrCreateHealthRegistry`
 * with the same ID return the same instance, so the host's subscriber sees
 * all pushes regardless of when `createPortalPlugin()` is called.
 */
/** Root-scoped storage survives separately bundled dynamic plugin copies. */
export class PortalHealth {
  private readonly registries = new Map<string, HealthRegistry>();
  forPlugin(pluginId: string): HealthRegistry {
    if (!this.registries.has(pluginId))
      this.registries.set(pluginId, new HealthRegistry());
    return this.registries.get(pluginId)!;
  }
  snapshot(): Record<string, HealthStatus> {
    return Object.fromEntries(
      [...this.registries].map(([id, registry]) => [id, registry.current()]),
    );
  }
}

export const portalHealthServiceRef = createServiceRef<PortalHealth>({
  id: 'portal.health',
  scope: 'root',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {},
      factory: async () => new PortalHealth(),
    }),
});

const globalHealthRegistries = new Map<string, HealthRegistry>();

/**
 * Returns the `HealthRegistry` for the given plugin, creating it on first call.
 */
export function getOrCreateHealthRegistry(pluginId: string): HealthRegistry {
  if (!globalHealthRegistries.has(pluginId)) {
    globalHealthRegistries.set(pluginId, new HealthRegistry());
  }
  return globalHealthRegistries.get(pluginId)!;
}

/**
 * Returns all registered plugin IDs and their current health statuses.
 * Used by the host's health aggregation endpoint.
 */
export function getAllHealthStatuses(): Record<string, HealthStatus> {
  const result: Record<string, HealthStatus> = {};
  for (const [pluginId, registry] of globalHealthRegistries) {
    result[pluginId] = registry.current();
  }
  return result;
}

/**
 * Clears the global registry. Call in test `afterEach` to prevent leakage.
 * @internal
 */
export function _resetHealthRegistriesForTests(): void {
  globalHealthRegistries.clear();
}
