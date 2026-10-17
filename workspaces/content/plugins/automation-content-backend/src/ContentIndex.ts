import {
  AnsibleContentManifest,
  ManifestCollectionEntry,
  summariseManifest,
} from '@ansible/content-model';
import {
  BackendCapabilities,
  CapabilityProbe,
  DigestCacheStats,
  ImageManifest,
  MemoryDigestCache,
  OCIClient,
  RegistryConnection,
  UNKNOWN_IMAGE_TYPE,
  readContentManifest,
} from '@ansible/automation-content-common';
import type {
  ContentTypeRegistry,
  Descriptor,
  MetadataBundle,
  ResolvedArtifact,
} from '@ansible/automation-content-common';

/** What the index concluded about an artifact, and why. */
export interface IdentifiedType {
  type: string;
  signals: string[];
  /** Whether the owning content type publishes a build-time content manifest. */
  readsContentManifest: boolean;
}
import { CONTENT_MANIFEST_ARTIFACT_TYPE } from '@ansible/content-model';

/**
 * A discovered artifact.
 *
 * `type` is the outcome of classification, not an assumption: a registry holds all
 * sorts of images, and only some are execution environments.
 */
export interface IndexedArtifact {
  ref: string;
  type: string;
  registry: string;
  repository: string;
  digest: string;
  tags: string[];
  pullReference: string;
  contentsKnown: boolean;
  classification: IdentifiedType;
  manifest?: AnsibleContentManifest;
}

export interface IndexedItem {
  /** Unique within one artifact. The same FQCN in another artifact is a distinct item. */
  key: string;
  fqcn: string;
  name: string;
  type: string;
  collection: string;
  collectionVersion: string;
  shortDescription?: string;
  versionAdded?: string;
  deprecated?: boolean;
  /** The artifact this item was found in. Exactly one — see the note on keying. */
  artifactRef: string;
  detail?: Record<string, unknown>;
}

export interface RegistryState {
  connection: RegistryConnection;
  capabilities?: BackendCapabilities;
}

/** Outcome of the last cheap check for changes in a registry. */
export interface DriftState {
  at: string;
  /** Whether the registry's tag-to-digest map differed from what the index holds. */
  changed: boolean;
  /** Human-readable differences, capped for logging. */
  details: string[];
  /** HEAD/list requests the check cost. */
  requests: number;
}

/** Outcome of the last attempt to read a registry. */
export interface ReconcileState {
  /** When the attempt finished, successful or not. */
  at: string;
  ok: boolean;
  error?: string;
  artifacts: number;
}

/** Referrer fallback tags address artifacts about an image, not images. */
const REFERRER_TAG = /^sha256-[0-9a-f]{64}$/;

/** Composite key for a content item. */
export function itemKey(artifactRef: string, fqcn: string): string {
  return `${artifactRef}::${fqcn}`;
}

/**
 * An in-memory index of discovered content.
 *
 * Two levels: artifacts (execution environments and, in future, collections or skills
 * published in their own right) and the content items inside them.
 *
 * Items are keyed on **(artifact, FQCN)**, not FQCN alone. Two execution environments
 * may ship different versions of the same collection, in which case
 * `cisco.ios.ios_vlans` genuinely has different documentation in each. Collapsing them
 * on FQCN would serve one environment's argument specification while claiming the
 * module is available in both — the precise failure the provenance fields exist to
 * prevent.
 *
 * In-memory is deliberate for the PoC: manifests are immutable by digest, so the index
 * is a pure function of what the registries hold and can always be rebuilt.
 */
export class ContentIndex {
  private readonly registries = new Map<string, RegistryState>();
  private readonly clients = new Map<string, OCIClient>();
  private artifacts: IndexedArtifact[] = [];
  private items = new Map<string, IndexedItem>();
  private lastRefreshed?: string;
  private readonly reconcile = new Map<string, ReconcileState>();
  private readonly drift = new Map<string, DriftState>();
  /**
   * Shared across every registry client. Digest-addressed content is immutable, so a
   * hit is permanently valid — this is what makes frequent drift polling affordable.
   */
  private readonly cache = new MemoryDigestCache();

  constructor(
    connections: RegistryConnection[],
    private readonly logger: {
      info(m: string): void;
      warn(m: string): void;
      debug(m: string): void;
    },
    private readonly contentTypes?: ContentTypeRegistry,
  ) {
    for (const connection of connections) {
      this.registries.set(connection.name, { connection });
      this.clients.set(
        connection.name,
        new OCIClient(connection, {
          logger: { debug: m => logger.debug(m), warn: m => logger.warn(m) },
          cache: this.cache,
        }),
      );
    }
  }

  listRegistries(): RegistryState[] {
    return [...this.registries.values()];
  }

  getRegistry(name: string): RegistryState | undefined {
    return this.registries.get(name);
  }

  /** All artifacts, optionally filtered by content type. */
  listArtifacts(type?: string): IndexedArtifact[] {
    return type ? this.artifacts.filter(a => a.type === type) : this.artifacts;
  }

  getArtifact(ref: string): IndexedArtifact | undefined {
    return this.artifacts.find(a => a.ref === ref);
  }

  listItems(): IndexedItem[] {
    return [...this.items.values()];
  }

  /** Items within one artifact. */
  itemsIn(artifactRef: string): IndexedItem[] {
    return this.listItems().filter(i => i.artifactRef === artifactRef);
  }

  /** Every variant of an FQCN across artifacts. More than one is normal and meaningful. */
  findItems(fqcn: string, artifactRef?: string): IndexedItem[] {
    if (artifactRef) {
      const found = this.items.get(itemKey(artifactRef, fqcn));
      return found ? [found] : [];
    }
    return this.listItems().filter(i => i.fqcn === fqcn);
  }

  get refreshedAt(): string | undefined {
    return this.lastRefreshed;
  }

  reconcileStateFor(registry: string): ReconcileState | undefined {
    return this.reconcile.get(registry);
  }

  driftStateFor(registry: string): DriftState | undefined {
    return this.drift.get(registry);
  }

  get cacheStats(): DigestCacheStats {
    return this.cache.stats;
  }

  /**
   * Cheaply check whether a registry still matches what the index holds.
   *
   * Lists tags and HEADs each one — no manifest bodies, no blobs. The comparison is on
   * the tag-to-digest map, which catches every observable change: a tag moved to new
   * content, a tag added, a tag removed.
   *
   * A full refresh is only triggered when this reports a difference, and because
   * unchanged digests hit the cache, that refresh re-downloads almost nothing.
   */
  async detectDrift(name: string): Promise<DriftState> {
    const state = this.registries.get(name);
    const client = this.clients.get(name);
    const at = new Date().toISOString();

    if (!state || !client) {
      return { at, changed: false, details: ['unknown registry'], requests: 0 };
    }

    const details: string[] = [];
    let requests = 0;

    try {
      const repositories = await this.resolveRepositories(name, state, client);
      requests += 1;

      for (const repository of repositories) {
        const observed = new Map<string, string>();
        for await (const tag of client.listTags(repository)) {
          requests += 1;
          if (REFERRER_TAG.test(tag)) continue;
          const head = await client.headManifest(repository, tag);
          requests += 1;
          if (head.digest) observed.set(tag, head.digest);
        }

        const known = new Map<string, string>();
        for (const artifact of this.artifacts) {
          if (artifact.registry !== name || artifact.repository !== repository)
            continue;
          for (const tag of artifact.tags) known.set(tag, artifact.digest);
        }

        for (const [tag, digest] of observed) {
          const previous = known.get(tag);
          if (previous === undefined) {
            details.push(`${repository}:${tag} added`);
          } else if (previous !== digest) {
            details.push(
              `${repository}:${tag} moved ${previous.slice(
                7,
                19,
              )} -> ${digest.slice(7, 19)}`,
            );
          }
        }
        for (const tag of known.keys()) {
          if (!observed.has(tag)) details.push(`${repository}:${tag} removed`);
        }
      }
    } catch (error) {
      // A failed check is not a change. Reporting drift here would trigger a pointless
      // full refresh that is also going to fail.
      const failure: DriftState = {
        at,
        changed: false,
        details: [`check failed: ${(error as Error).message}`],
        requests,
      };
      this.drift.set(name, failure);
      return failure;
    }

    const result: DriftState = {
      at,
      changed: details.length > 0,
      details,
      requests,
    };
    this.drift.set(name, result);
    return result;
  }

  /** Check for drift, and refresh only if something actually changed. */
  async pollRegistry(name: string): Promise<{
    changed: boolean;
    refreshed: boolean;
    details: string[];
    requests: number;
  }> {
    const drift = await this.detectDrift(name);
    if (!drift.changed) {
      return {
        changed: false,
        refreshed: false,
        details: drift.details,
        requests: drift.requests,
      };
    }
    this.logger.info(`[${name}] drift detected: ${drift.details.join('; ')}`);
    await this.refreshRegistry(name);
    return {
      changed: true,
      refreshed: true,
      details: drift.details,
      requests: drift.requests,
    };
  }

  async pollAll(): Promise<{
    checked: number;
    refreshed: number;
    requests: number;
  }> {
    let refreshed = 0;
    let requests = 0;
    for (const name of this.registries.keys()) {
      const result = await this.pollRegistry(name);
      requests += result.requests;
      if (result.refreshed) refreshed += 1;
    }
    return { checked: this.registries.size, refreshed, requests };
  }

  /** Collections across all artifacts, deduplicated by namespace.name@version. */
  listCollections(): Array<
    ManifestCollectionEntry & { fqcn: string; providedBy: string[] }
  > {
    const byKey = new Map<
      string,
      ManifestCollectionEntry & { fqcn: string; providedBy: string[] }
    >();

    for (const artifact of this.artifacts) {
      for (const collection of artifact.manifest?.collections ?? []) {
        const fqcn = `${collection.namespace}.${collection.name}`;
        const key = `${fqcn}@${collection.version}`;
        const existing = byKey.get(key);
        if (existing) {
          existing.providedBy.push(artifact.ref);
        } else {
          byKey.set(key, { ...collection, fqcn, providedBy: [artifact.ref] });
        }
      }
    }
    return [...byKey.values()];
  }

  async refreshAll(): Promise<{ artifacts: number; items: number }> {
    for (const name of this.registries.keys()) {
      await this.refreshRegistry(name);
    }
    return { artifacts: this.artifacts.length, items: this.items.size };
  }

  /**
   * Re-read one registry.
   *
   * A failed read leaves the previous view in place. Replacing it with nothing would
   * mean a transient registry outage silently empties the catalog — the content did not
   * disappear, only our ability to see it did, and those are different facts. The
   * failure is recorded so staleness stays visible instead of being presented as truth.
   */
  async refreshRegistry(
    name: string,
  ): Promise<{ discovered: number; ok: boolean; error?: string }> {
    const outcome = await this.discoverRegistry(name);
    const at = new Date().toISOString();

    if (!outcome.ok) {
      const retained = this.artifacts.filter(a => a.registry === name).length;
      this.reconcile.set(name, {
        at,
        ok: false,
        error: outcome.error,
        artifacts: retained,
      });
      this.logger.warn(
        `[${name}] discovery failed (${outcome.error}); keeping ${retained} previously ` +
          `known artifact(s)`,
      );
      return { discovered: retained, ok: false, error: outcome.error };
    }

    this.artifacts = [
      ...this.artifacts.filter(a => a.registry !== name),
      ...outcome.artifacts,
    ];
    this.rebuildItemIndex();
    this.lastRefreshed = at;
    this.reconcile.set(name, {
      at,
      ok: true,
      artifacts: outcome.artifacts.length,
    });
    return { discovered: outcome.artifacts.length, ok: true };
  }

  private async discoverRegistry(name: string): Promise<{
    ok: boolean;
    error?: string;
    artifacts: IndexedArtifact[];
  }> {
    const state = this.registries.get(name);
    const client = this.clients.get(name);
    if (!state || !client) {
      return { ok: false, error: `unknown registry: ${name}`, artifacts: [] };
    }

    if (!state.capabilities) {
      try {
        this.logger.info(`[${name}] starting capability probe`);
        state.capabilities = await new CapabilityProbe(client, {
          sampleRepository: state.connection.repositories?.[0],
          logger: {
            debug: m => this.logger.debug(m),
            warn: m => this.logger.warn(m),
          },
        }).probe();
        this.logger.info(`[${name}] capability probe complete`);
      } catch (error) {
        return {
          ok: false,
          error: `capability probe failed: ${error}`,
          artifacts: [],
        };
      }
    }

    let repositories: string[];
    try {
      repositories = await this.resolveRepositories(name, state, client);
      this.logger.info(
        `[${name}] resolved ${repositories.length} repositor(ies)`,
      );
    } catch (error) {
      return {
        ok: false,
        error: `repository listing failed: ${error}`,
        artifacts: [],
      };
    }

    const found: IndexedArtifact[] = [];
    const failures: string[] = [];

    for (const repository of repositories) {
      try {
        this.logger.info(`[${name}] scanning ${repository}`);
        found.push(...(await this.scanRepository(name, repository, client)));
        this.logger.info(
          `[${name}] scanned ${repository}: ${found.length} artifact(s)`,
        );
      } catch (error) {
        failures.push(`${repository}: ${(error as Error).message}`);
        // A failed read keeps the previous view for that repository: a
        // transient 5xx, timeout or 429 must not read as "its artifacts are
        // gone". Total failure is handled below and keeps the whole registry.
        const retained = this.artifacts.filter(
          a => a.registry === name && a.repository === repository,
        );
        found.push(...retained);
        this.logger.warn(
          `[${name}] ${repository}: ${(error as Error).message}${
            retained.length
              ? `; keeping ${retained.length} previously known artifact(s)`
              : ''
          }`,
        );
      }
    }

    // Partial failure still yields a usable result; total failure does not, and must
    // not be mistaken for an empty registry.
    if (repositories.length > 0 && failures.length === repositories.length) {
      return {
        ok: false,
        error: `all ${repositories.length} repositor(ies) failed: ${failures[0]}`,
        artifacts: [],
      };
    }
    return { ok: true, artifacts: found };
  }

  private async resolveRepositories(
    name: string,
    state: RegistryState,
    client: OCIClient,
  ): Promise<string[]> {
    const configured = state.connection.repositories ?? [];
    if (configured.length > 0) return configured;

    if (!state.capabilities?.catalogEnumeration) {
      this.logger.warn(
        `[${name}] no repositories configured and catalog enumeration is unavailable`,
      );
      return [];
    }

    const namespaces = state.connection.namespaces;
    const discovered: string[] = [];
    for await (const repository of client.listRepositories()) {
      if (
        !namespaces?.length ||
        namespaces.some(ns => repository.startsWith(`${ns}/`))
      ) {
        discovered.push(repository);
      }
    }
    return discovered;
  }

  private async scanRepository(
    registry: string,
    repository: string,
    client: OCIClient,
  ): Promise<IndexedArtifact[]> {
    const byDigest = new Map<string, string[]>();

    for await (const tag of client.listTags(repository)) {
      if (REFERRER_TAG.test(tag)) continue;
      const head = await client.headManifest(repository, tag);
      if (head.status === 429) {
        // Throwing makes this a failed repository rather than a successful
        // partial scan, so the previous view is kept instead of the remaining
        // tags being read as absent.
        throw new Error(
          `rate-limited by registry while scanning ${repository}:${tag}`,
        );
      }
      if (!head.digest) {
        this.logger.debug(
          `[${registry}] HEAD ${repository}:${tag} returned status ${head.status} with no digest; skipping`,
        );
        continue;
      }
      byDigest.set(head.digest, [...(byDigest.get(head.digest) ?? []), tag]);
    }

    const found: IndexedArtifact[] = [];
    for (const [digest, tags] of byDigest) {
      found.push(
        await this.inspect(registry, repository, digest, tags, client),
      );
    }
    return found;
  }

  /**
   * Identify one image and, if it is an execution environment, read its contents.
   *
   * Classification runs before enumeration so that an unrecognised image is never
   * reported as an environment with nothing in it.
   */
  private async inspect(
    registry: string,
    repository: string,
    digest: string,
    tags: string[],
    client: OCIClient,
  ): Promise<IndexedArtifact> {
    const base = {
      ref: `${registry}/${repository}@${digest}`,
      registry,
      repository,
      digest,
      tags,
      pullReference: client.pullReference({
        registry,
        repository,
        reference: digest,
      }),
    };

    const { referrers } = await client
      .getReferrers(repository, digest)
      .catch(() => ({ referrers: [], via: 'none' as const }));

    // Labels live in the config blob, which enumeration reads anyway — so classifying
    // by label costs nothing extra.
    let labels: Record<string, string> | undefined;
    let resolved: ResolvedArtifact | undefined;
    try {
      resolved = await client.getManifest(repository, digest);
      const config = (resolved.manifest as ImageManifest).config;
      if (config) {
        const blob = await client.getConfigBlob(repository, config);
        labels = blob?.config?.Labels;
      }
    } catch (error) {
      this.logger.debug(
        `[${registry}] ${repository}@${digest}: ${String(error)}`,
      );
    }

    const classification = this.identify(resolved, { labels, referrers });

    // Only a type that publishes a build-time content manifest is read further. Gated
    // on the declared media type rather than on a type name, so this stays a statement
    // about capability: a future content type publishing the same manifest is read the
    // same way, with no change here.
    if (!classification.readsContentManifest) {
      this.logger.debug(
        `[${registry}] ${repository}:${tags.join(',')} classified as ` +
          `${classification.type} — ${classification.signals.join('; ')}`,
      );
      return {
        ...base,
        type: classification.type,
        contentsKnown: false,
        classification,
      };
    }

    const located = await readContentManifest(client, repository, digest).catch(
      () => undefined,
    );

    return {
      ...base,
      type: classification.type,
      contentsKnown: Boolean(located?.manifest),
      classification,
      manifest: located?.manifest,
    };
  }

  /**
   * Ask the registered content types which one owns this artifact.
   *
   * The index knows no content type of its own. With an empty registry every artifact
   * is reported as unidentified — honestly, with each adapter's reason — rather than
   * silently dropped.
   */
  private identify(
    artifact: ResolvedArtifact | undefined,
    signalsFrom: { labels?: Record<string, string>; referrers?: Descriptor[] },
  ): IdentifiedType {
    if (!artifact || !this.contentTypes) {
      return {
        type: UNKNOWN_IMAGE_TYPE,
        signals: ['no content types registered'],
        readsContentManifest: false,
      };
    }

    const meta: MetadataBundle = {
      manifest: artifact.manifest,
      config: signalsFrom.labels
        ? { config: { Labels: signalsFrom.labels } }
        : undefined,
      referrers: signalsFrom.referrers,
      obtained: ['manifest', 'config', 'referrers'],
    };

    const resolution = this.contentTypes.resolve(artifact, meta);
    if (!resolution) {
      return {
        type: UNKNOWN_IMAGE_TYPE,
        signals: this.contentTypes.explain(artifact, meta),
        readsContentManifest: false,
      };
    }

    return {
      type: resolution.adapter.type,
      signals: resolution.classification.signals,
      readsContentManifest: resolution.adapter.mediaTypes.includes(
        CONTENT_MANIFEST_ARTIFACT_TYPE,
      ),
    };
  }

  /**
   * Flatten content items, keyed per artifact.
   *
   * No cross-artifact deduplication: the same FQCN in two environments may carry
   * different documentation, and merging them would mean serving one environment's
   * answer for a question asked about another.
   */
  private rebuildItemIndex(): void {
    const items = new Map<string, IndexedItem>();

    const add = (
      artifact: IndexedArtifact,
      collection: ManifestCollectionEntry,
      partial: Pick<IndexedItem, 'fqcn' | 'name' | 'type'> &
        Partial<
          Pick<
            IndexedItem,
            'shortDescription' | 'versionAdded' | 'deprecated' | 'detail'
          >
        >,
    ) => {
      const key = itemKey(artifact.ref, partial.fqcn);
      items.set(key, {
        ...partial,
        key,
        artifactRef: artifact.ref,
        collection: `${collection.namespace}.${collection.name}`,
        collectionVersion: collection.version,
      });
    };

    for (const artifact of this.artifacts) {
      for (const collection of artifact.manifest?.collections ?? []) {
        for (const plugin of collection.plugins) {
          add(artifact, collection, {
            fqcn: plugin.fqcn,
            name: plugin.name,
            type: plugin.type,
            shortDescription: plugin.shortDescription,
            versionAdded: plugin.versionAdded,
            deprecated: plugin.deprecated,
            detail: plugin as unknown as Record<string, unknown>,
          });
        }
        for (const role of collection.roles) {
          add(artifact, collection, {
            fqcn: role.fqcn,
            name: role.name,
            type: 'role',
            shortDescription: role.description,
            detail: role as unknown as Record<string, unknown>,
          });
        }
        for (const playbook of collection.playbooks) {
          add(artifact, collection, {
            fqcn: playbook.fqcn,
            name: playbook.name,
            type: 'playbook',
            detail: playbook as unknown as Record<string, unknown>,
          });
        }
        for (const eda of collection.edaPlugins) {
          add(artifact, collection, {
            fqcn: eda.fqcn,
            name: eda.name,
            type: eda.type,
            shortDescription: eda.shortDescription,
            detail: eda as unknown as Record<string, unknown>,
          });
        }
      }
    }
    this.items = items;
  }

  countsFor(artifact: IndexedArtifact) {
    return artifact.manifest ? summariseManifest(artifact.manifest) : undefined;
  }
}

export { UNKNOWN_IMAGE_TYPE };
