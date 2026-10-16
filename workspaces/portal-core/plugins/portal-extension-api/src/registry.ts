import type { Entity } from '@backstage/catalog-model';
import type {
  TabContribution,
  CardContribution,
  ActionContribution,
} from './types';
import type { PluginManifest } from './manifest';
import type { ScaffolderFieldContribution } from './scaffolderFields';

type RegistryListener = () => void;
type ManifestListener = (manifest: PluginManifest) => void;

type ContributionMap<T> = Map<string, Map<string, T>>;

/**
 * Returns true when the contribution's `appliesToContentTypes` allows the
 * given content type. Contributions with no `appliesToContentTypes` field (or
 * `'*'`) are always shown. If no `contentType` is passed by the caller, the
 * check is skipped and all contributions are returned.
 */
function matchesContentType<
  T extends { appliesToContentTypes?: string[] | '*' },
>(contribution: T, contentType: string | undefined): boolean {
  if (!contentType) return true;
  const allowed = contribution.appliesToContentTypes;
  if (!allowed || allowed === '*') return true;
  return (allowed as string[]).includes(contentType);
}

function safeFilter<
  T extends {
    filter?: (e: Entity) => boolean;
    appliesToContentTypes?: string[] | '*';
  },
>(
  contribution: T,
  entity: Entity | undefined,
  contentType: string | undefined,
): boolean {
  // Disabled contributions are always hidden.
  if ((contribution as any)._disabled) return false;
  // Primary static gate: content type.
  if (!matchesContentType(contribution, contentType)) return false;
  // Additional UI predicate: entity filter.
  if (!contribution.filter || !entity) return true;
  try {
    return contribution.filter(entity);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ContributionRegistry] filter() threw for contribution "${
        (contribution as any).id
      }":`,
      err,
    );
    return false;
  }
}

function sortByPriority<T extends { id: string; priority?: number }>(
  items: T[],
): T[] {
  // Array.prototype.sort is stable in modern JS engines — equal priorities
  // preserve insertion order.
  return [...items].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}

class ContributionRegistry {
  private readonly tabs: ContributionMap<TabContribution> = new Map();
  private readonly cards: ContributionMap<CardContribution> = new Map();
  private readonly actions: ContributionMap<ActionContribution> = new Map();
  private readonly scaffolderFields: ContributionMap<ScaffolderFieldContribution> =
    new Map();
  private readonly listeners: Set<RegistryListener> = new Set();
  private readonly manifests: Map<string, PluginManifest> = new Map();
  private readonly manifestListeners: Set<ManifestListener> = new Set();

  // ── Subscription ──────────────────────────────────────────────────────────

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private register<T extends { id: string }>(
    store: ContributionMap<T>,
    extensionPoint: string,
    contribution: T,
  ): () => void {
    if (!store.has(extensionPoint)) {
      store.set(extensionPoint, new Map());
    }
    const ep = store.get(extensionPoint)!;
    if (ep.has(contribution.id)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ContributionRegistry] Duplicate id "${contribution.id}" at extension point "${extensionPoint}" — replacing previous registration.`,
      );
    }
    ep.set(contribution.id, contribution);
    this.notify();
    return () => {
      ep.delete(contribution.id);
      this.notify();
    };
  }

  private get<
    T extends {
      id: string;
      filter?: (e: Entity) => boolean;
      appliesToContentTypes?: string[] | '*';
    },
  >(
    store: ContributionMap<T>,
    extensionPoint: string,
    entity?: Entity,
    contentType?: string,
  ): T[] {
    const ep = store.get(extensionPoint);
    if (!ep) return [];
    const all = Array.from(ep.values());
    const filtered = all.filter(c => safeFilter(c, entity, contentType));
    return sortByPriority(filtered);
  }

  // ── Tab registration ──────────────────────────────────────────────────────

  registerTab(
    extensionPoint: string,
    contribution: TabContribution,
  ): () => void {
    return this.register(this.tabs, extensionPoint, contribution);
  }

  getTabs(
    extensionPoint: string,
    entity?: Entity,
    contentType?: string,
  ): TabContribution[] {
    return this.get(this.tabs, extensionPoint, entity, contentType);
  }

  // ── Card registration ─────────────────────────────────────────────────────

  registerCard(
    extensionPoint: string,
    contribution: CardContribution,
  ): () => void {
    return this.register(this.cards, extensionPoint, contribution);
  }

  getCards(
    extensionPoint: string,
    entity?: Entity,
    contentType?: string,
  ): CardContribution[] {
    return this.get(this.cards, extensionPoint, entity, contentType);
  }

  // ── Action registration ───────────────────────────────────────────────────

  registerAction(
    extensionPoint: string,
    contribution: ActionContribution,
  ): () => void {
    return this.register(this.actions, extensionPoint, contribution);
  }

  getActions(
    extensionPoint: string,
    entity?: Entity,
    contentType?: string,
  ): ActionContribution[] {
    return this.get(this.actions, extensionPoint, entity, contentType);
  }

  // ── Manifest registration ─────────────────────────────────────────────────

  registerScaffolderField(
    contribution: ScaffolderFieldContribution,
  ): () => void {
    if (!contribution.id.startsWith(`${contribution.pluginId}.`)) {
      throw new Error('Scaffolder field IDs must be prefixed by their owner');
    }
    return this.register(
      this.scaffolderFields,
      'scaffolder.fields',
      contribution,
    );
  }

  getScaffolderFields(): ScaffolderFieldContribution[] {
    return this.get(this.scaffolderFields, 'scaffolder.fields');
  }

  /**
   * Registers a plugin manifest with the host.
   *
   * Call this from your plugin's `dynamic/index.ts` (or module entry point)
   * alongside your `register*` calls. The host's `DynamicExtensionDiscovery`
   * subscribes to this and validates each arriving manifest.
   *
   * Registering the same `manifest.id` twice replaces the previous entry and
   * notifies all subscribers again.
   *
   * @example
   * // In your plugin's dynamic/index.ts
   * import { registerManifest } from '@ansible/portal-extension-api';
   * registerManifest(myPluginManifest);
   */
  registerManifest(manifest: PluginManifest): void {
    if (this.manifests.has(manifest.id)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ContributionRegistry] Manifest "${manifest.id}" already registered — replacing.`,
      );
    }
    this.manifests.set(manifest.id, manifest);
    this.manifestListeners.forEach(l => l(manifest));
  }

  /**
   * Returns all currently registered manifests.
   */
  getManifests(): PluginManifest[] {
    return Array.from(this.manifests.values());
  }

  /**
   * Subscribes to manifest registrations.
   *
   * The callback is invoked immediately for all already-registered manifests
   * (replay), and then again for every future `registerManifest()` call.
   * This ensures `DynamicExtensionDiscovery` never misses a manifest
   * regardless of load order.
   *
   * Returns an unsubscribe function — call it in `useEffect` cleanup.
   */
  subscribeToManifests(callback: ManifestListener): () => void {
    // Replay manifests that were registered before this subscription.
    for (const manifest of this.manifests.values()) {
      callback(manifest);
    }
    this.manifestListeners.add(callback);
    return () => {
      this.manifestListeners.delete(callback);
    };
  }

  // ── Enable / disable ─────────────────────────────────────────────────────

  disable(contributionId: string): void {
    this._setEnabled(contributionId, false);
  }

  enable(contributionId: string): void {
    this._setEnabled(contributionId, true);
  }

  private _setEnabled(contributionId: string, enabled: boolean): void {
    let changed = false;
    for (const store of [
      this.tabs,
      this.cards,
      this.actions,
      this.scaffolderFields,
    ]) {
      for (const ep of store.values()) {
        const contribution = ep.get(contributionId) as any;
        if (contribution) {
          // Enabled state stored as a non-enumerable shadow property; the
          // filter function in safeFilter checks it via the _disabled flag.
          contribution._disabled = !enabled;
          changed = true;
        }
      }
    }
    if (changed) this.notify();
  }

  // ── Test utilities ────────────────────────────────────────────────────────

  /** Clears all registrations. Call in `afterEach` to prevent test leakage. */
  reset(): void {
    this.tabs.clear();
    this.cards.clear();
    this.actions.clear();
    this.scaffolderFields.clear();
    this.listeners.clear();
    this.manifests.clear();
    this.manifestListeners.clear();
  }
}

/** Module-level singleton — the shared bus between community plugins and the
 *  self-service host. Must be a shared module (not embedded per-plugin) in
 *  RHDH deployments. See §4.3 of the architecture doc. */
export const contributionRegistry = new ContributionRegistry();

export type { ContributionRegistry };
