import {
  AnsibleContentManifest,
  ManifestCollectionEntry,
  summariseManifest,
} from '@ansible/content-model';
import {
  BackendCapabilities,
  CapabilityProbe,
  CredentialRedactor,
  DigestCacheStats,
  ImageManifest,
  MemoryDigestCache,
  logSafeText,
  OCIClient,
  OCIBackendAdapter,
  MINIMAL_CAPABILITIES,
  RegistryConnection,
  UNKNOWN_IMAGE_TYPE,
  readContentManifest,
  redactorForConnections,
} from '@ansible/automation-content-common';
import type {
  ContentTypeRegistry,
  Descriptor,
  MetadataBundle,
  ResolvedArtifact,
  ArchiveEnumeration,
} from '@ansible/automation-content-common';

import { Knex } from 'knex';
import { createHash } from 'crypto';

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
  /** Non-EE inventory; stored separately from the EE manifest contract. */
  enumeration?: ArchiveEnumeration;
  metadata?: Record<string, string>;
}

export interface IndexedItem {
  /** SHA256 of the JSON tuple of artifact reference, FQCN and content type. */
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

/** Cosign's digest-derived signature tags describe images, not content artifacts. */
const SIGNATURE_TAG = /^sha256-[0-9a-f]{64}\.sig$/i;

/** Composite key for a content item. */
export function itemKey(
  artifactRef: string,
  fqcn: string,
  type: string,
): string {
  return createHash('sha256')
    .update(JSON.stringify([artifactRef, fqcn, type]))
    .digest('hex');
}

/** Flatten an artifact's manifest into content items. */
function flattenItems(artifact: IndexedArtifact): IndexedItem[] {
  if (artifact.enumeration) {
    return (artifact.enumeration.items ?? []).map(item => ({
      key: itemKey(artifact.ref, item.fqcn, item.type),
      artifactRef: artifact.ref,
      fqcn: item.fqcn,
      name: item.name,
      type: item.type,
      collection: item.type === 'collection' ? item.fqcn : '',
      collectionVersion: item.version ?? artifact.metadata?.version ?? '',
      shortDescription: item.description,
      detail: item.detail,
    }));
  }
  const items: IndexedItem[] = [];
  for (const collection of artifact.manifest?.collections ?? []) {
    const collectionFqcn = `${collection.namespace}.${collection.name}`;
    const base = {
      artifactRef: artifact.ref,
      collection: collectionFqcn,
      collectionVersion: collection.version,
    };

    for (const plugin of collection.plugins) {
      items.push({
        ...base,
        key: itemKey(artifact.ref, plugin.fqcn, plugin.type),
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
      items.push({
        ...base,
        key: itemKey(artifact.ref, role.fqcn, 'role'),
        fqcn: role.fqcn,
        name: role.name,
        type: 'role',
        shortDescription: role.description,
        detail: role as unknown as Record<string, unknown>,
      });
    }
    for (const playbook of collection.playbooks) {
      items.push({
        ...base,
        key: itemKey(artifact.ref, playbook.fqcn, 'playbook'),
        fqcn: playbook.fqcn,
        name: playbook.name,
        type: 'playbook',
        detail: playbook as unknown as Record<string, unknown>,
      });
    }
    for (const eda of collection.edaPlugins) {
      items.push({
        ...base,
        key: itemKey(artifact.ref, eda.fqcn, eda.type),
        fqcn: eda.fqcn,
        name: eda.name,
        type: eda.type,
        shortDescription: eda.shortDescription,
        detail: eda as unknown as Record<string, unknown>,
      });
    }
  }
  return items;
}

/**
 * An in-memory index of discovered content.
 *
 * Two levels: artifacts (execution environments and, in future, collections or skills
 * published in their own right) and the content items inside them.
 *
 * Items are keyed on **(artifact, FQCN, type)**, not FQCN alone. Two execution environments
 * may ship different versions of the same collection, in which case
 * `cisco.ios.ios_vlans` genuinely has different documentation in each. Collapsing them
 * on FQCN would serve one environment's argument specification while claiming the
 * module is available in both — the precise failure the provenance fields exist to
 * prevent.
 * Plugin categories are distinct too: a callback and filter may share an FQCN.
 *
 * Database-backed content store.
 *
 * Artifacts and items are persisted in SQLite (dev) or PostgreSQL (production)
 * so the index survives backend restarts.
 */
export class ContentStore {
  private readonly registries = new Map<string, RegistryState>();
  private readonly clients = new Map<string, OCIClient>();
  private readonly reconcile = new Map<string, ReconcileState>();
  private readonly drift = new Map<string, DriftState>();
  private readonly cache = new MemoryDigestCache();
  private lastRefreshed?: string;
  private db: Knex;
  readonly redactor: CredentialRedactor;
  private readonly logger: {
    info(m: string): void;
    warn(m: string): void;
    debug(m: string): void;
  };

  constructor(
    connections: RegistryConnection[],
    db: Knex,
    logger: {
      info(m: string): void;
      warn(m: string): void;
      debug(m: string): void;
    },
    private readonly contentTypes?: ContentTypeRegistry,
  ) {
    this.db = db;
    this.redactor = redactorForConnections(connections);
    this.logger = {
      info: message => logger.info(this.redactor.redact(message)),
      warn: message => logger.warn(this.redactor.redact(message)),
      debug: message => logger.debug(this.redactor.redact(message)),
    };

    for (const connection of connections) {
      this.registries.set(connection.name, { connection });
      this.clients.set(
        connection.name,
        new OCIClient(connection, {
          logger: {
            debug: message => this.logger.debug(message),
            warn: message => this.logger.warn(message),
          },
          cache: this.cache,
          redactor: this.redactor,
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

  reconcileStateFor(registry: string): ReconcileState | undefined {
    return this.reconcile.get(registry);
  }

  driftStateFor(registry: string): DriftState | undefined {
    return this.drift.get(registry);
  }

  get refreshedAt(): string | undefined {
    return this.lastRefreshed;
  }

  get cacheStats(): DigestCacheStats {
    return this.cache.stats;
  }

  async listArtifacts(type?: string): Promise<IndexedArtifact[]> {
    const query = this.db('artifacts');
    if (type) query.where('type', type);
    const rows = await query.select('*');
    return rows.map((row: Record<string, unknown>) => this.rowToArtifact(row));
  }

  async getArtifact(ref: string): Promise<IndexedArtifact | undefined> {
    const row = await this.db('artifacts').where('ref', ref).first();
    return row ? this.rowToArtifact(row) : undefined;
  }

  async listItems(): Promise<IndexedItem[]> {
    const rows = await this.db('items').select('*');
    return rows.map((row: Record<string, unknown>) => this.rowToItem(row));
  }

  async itemsIn(artifactRef: string): Promise<IndexedItem[]> {
    const rows = await this.db('items')
      .where('artifact_ref', artifactRef)
      .select('*');
    return rows.map((row: Record<string, unknown>) => this.rowToItem(row));
  }

  async findItems(
    fqcn: string,
    artifactRef?: string,
    type?: string,
  ): Promise<IndexedItem[]> {
    const query = this.db('items').where('fqcn', fqcn);
    if (artifactRef) query.where('artifact_ref', artifactRef);
    if (type) query.where('type', type);
    const rows = await query.select('*');
    return rows.map((row: Record<string, unknown>) => this.rowToItem(row));
  }

  async listCollections(): Promise<
    Array<ManifestCollectionEntry & { fqcn: string; providedBy: string[] }>
  > {
    const artifacts = await this.listArtifacts();
    const byKey = new Map<
      string,
      ManifestCollectionEntry & { fqcn: string; providedBy: string[] }
    >();
    for (const artifact of artifacts) {
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

  countsFor(artifact: IndexedArtifact) {
    if (artifact.enumeration) {
      if (!artifact.contentsKnown) return undefined;
      const items = artifact.enumeration.items ?? [];
      return {
        items: items.length,
        collections: items.filter(item => item.type === 'collection').length,
        skills: items.filter(item => item.type === 'skill').length,
      };
    }
    return artifact.manifest ? summariseManifest(artifact.manifest) : undefined;
  }

  async pruneRemovedRegistries(): Promise<string[]> {
    const configuredNames = [...this.registries.keys()];
    const dbRegistries = await this.db('artifacts')
      .distinct('registry')
      .pluck('registry');
    const removed = dbRegistries.filter(
      (r: string) => !configuredNames.includes(r),
    );
    if (removed.length > 0) {
      await this.db('artifacts').whereIn('registry', removed).del();
      this.logger.info(
        `pruned records for removed registr(ies): ${removed.join(', ')}`,
      );
    }
    return removed;
  }

  async refreshAll(): Promise<{ artifacts: number; items: number }> {
    for (const name of this.registries.keys()) {
      await this.refreshRegistry(name);
    }

    await this.pruneRemovedRegistries();

    const artifactCount = await this.db('artifacts')
      .count('* as count')
      .first();
    const itemCount = await this.db('items').count('* as count').first();
    return {
      artifacts: Number(artifactCount?.count ?? 0),
      items: Number(itemCount?.count ?? 0),
    };
  }

  async refreshRegistry(
    name: string,
  ): Promise<{ discovered: number; ok: boolean; error?: string }> {
    const outcome = await this.discoverRegistry(name);
    const at = new Date().toISOString();

    if (!outcome.ok) {
      const retained = await this.db('artifacts')
        .where('registry', name)
        .count('* as count')
        .first();
      const retainedCount = Number(retained?.count ?? 0);
      this.reconcile.set(name, {
        at,
        ok: false,
        error: outcome.error,
        artifacts: retainedCount,
      });
      this.logger.warn(
        `[${name}] discovery failed (${outcome.error}); keeping ${retainedCount} previously known artifact(s)`,
      );
      return { discovered: retainedCount, ok: false, error: outcome.error };
    }

    await this.db.transaction(async trx => {
      await trx('artifacts').where('registry', name).del();
      let totalItems = 0;
      for (const a of outcome.artifacts) {
        const storedManifest = a.enumeration
          ? {
              kind: 'artifact-inventory',
              enumeration: a.enumeration,
              metadata: a.metadata,
            }
          : a.manifest;
        await trx('artifacts').insert({
          ref: a.ref,
          type: a.type,
          registry: a.registry,
          repository: a.repository,
          digest: a.digest,
          tags: JSON.stringify(a.tags),
          pull_reference: a.pullReference,
          contents_known: a.contentsKnown,
          classification: JSON.stringify(a.classification),
          manifest: storedManifest ? JSON.stringify(storedManifest) : null,
        });
        // Only identical artifact/FQCN/type tuples collide. Keep the first exact
        // duplicate while preserving distinct plugin categories with the same FQCN.
        const itemsByKey = new Map<string, IndexedItem>();
        for (const item of flattenItems(a)) {
          if (!itemsByKey.has(item.key)) itemsByKey.set(item.key, item);
        }
        const items = [...itemsByKey.values()];
        totalItems += items.length;
        for (const item of items) {
          await trx('items').insert({
            key: item.key,
            fqcn: item.fqcn,
            name: item.name,
            type: item.type,
            collection: item.collection,
            collection_version: item.collectionVersion,
            short_description: item.shortDescription ?? null,
            version_added: item.versionAdded ?? null,
            deprecated: item.deprecated ?? false,
            artifact_ref: item.artifactRef,
            detail: item.detail ? JSON.stringify(item.detail) : null,
          });
        }
      }
      this.logger.info(
        `[${name}] persisted ${outcome.artifacts.length} artifact(s), ${totalItems} item(s)` +
          ` (contentsKnown: ${
            outcome.artifacts.filter(a => a.contentsKnown).length
          })`,
      );
    });

    this.lastRefreshed = at;
    this.reconcile.set(name, {
      at,
      ok: true,
      artifacts: outcome.artifacts.length,
    });
    return { discovered: outcome.artifacts.length, ok: true };
  }

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
          if (REFERRER_TAG.test(tag) || SIGNATURE_TAG.test(tag)) continue;
          const head = await client.headManifest(repository, tag);
          requests += 1;
          if (head.digest) observed.set(tag, head.digest);
        }

        const rows = await this.db('artifacts')
          .where({ registry: name, repository })
          .select('digest', 'tags');
        const known = new Map<string, string>();
        for (const row of rows) {
          for (const tag of JSON.parse(row.tags)) known.set(tag, row.digest);
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
      const failure: DriftState = {
        at,
        changed: false,
        details: [`check failed: ${this.redactor.redactErrorText(error)}`],
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
          error: `capability probe failed: ${this.redactor.redactErrorText(
            error,
          )}`,
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
        error: `repository listing failed: ${this.redactor.redactErrorText(
          error,
        )}`,
        artifacts: [],
      };
    }

    const found: IndexedArtifact[] = [];
    const failures: string[] = [];

    for (const repository of repositories) {
      // The repository name is registry-controlled; control characters are
      // stripped so a hostile name cannot forge additional log lines.
      const repo = logSafeText(repository);
      try {
        this.logger.info(`[${name}] scanning ${repo}`);
        found.push(...(await this.scanRepository(name, repository, client)));
        this.logger.info(
          `[${name}] scanned ${repo}: ${found.length} artifact(s)`,
        );
      } catch (error) {
        failures.push(
          `${this.redactor.redact(repo)}: ${this.redactor.redactErrorText(
            error,
          )}`,
        );
        const retained = await this.db('artifacts')
          .where({ registry: name, repository })
          .select('*');
        const retainedArtifacts = retained.map(row => this.rowToArtifact(row));
        found.push(...retainedArtifacts);
        this.logger.warn(
          `[${name}] ${this.redactor.redact(
            repo,
          )}: ${this.redactor.redactErrorText(error)}${
            retainedArtifacts.length
              ? `; keeping ${retainedArtifacts.length} previously known artifact(s)`
              : ''
          }`,
        );
      }
    }

    if (repositories.length > 0 && failures.length === repositories.length) {
      return {
        ok: false,
        error: `all ${repositories.length} repositor(ies) failed: ${failures[0]}`,
        artifacts: [],
      };
    }
    return { ok: true, artifacts: found };
  }

  private rowToArtifact(row: Record<string, unknown>): IndexedArtifact {
    const stored = row.manifest
      ? JSON.parse(row.manifest as string)
      : undefined;
    const inventory = stored?.kind === 'artifact-inventory';
    return {
      ref: row.ref as string,
      type: row.type as string,
      registry: row.registry as string,
      repository: row.repository as string,
      digest: row.digest as string,
      tags: JSON.parse(row.tags as string),
      pullReference: row.pull_reference as string,
      contentsKnown: Boolean(row.contents_known),
      classification: JSON.parse(row.classification as string),
      manifest: inventory ? undefined : stored,
      ...(inventory
        ? { enumeration: stored.enumeration, metadata: stored.metadata }
        : {}),
    };
  }

  private rowToItem(row: Record<string, unknown>): IndexedItem {
    return {
      key: row.key as string,
      fqcn: row.fqcn as string,
      name: row.name as string,
      type: row.type as string,
      collection: row.collection as string,
      collectionVersion: row.collection_version as string,
      shortDescription: (row.short_description as string) ?? undefined,
      versionAdded: (row.version_added as string) ?? undefined,
      deprecated: Boolean(row.deprecated),
      artifactRef: row.artifact_ref as string,
      detail: row.detail ? JSON.parse(row.detail as string) : undefined,
    };
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
      if (REFERRER_TAG.test(tag) || SIGNATURE_TAG.test(tag)) continue;
      const head = await client.headManifest(repository, tag);
      if (head.status === 429) {
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
        `[${registry}] ${this.redactor.redact(
          logSafeText(repository),
        )}@${digest}: ${this.redactor.redactErrorText(error)}`,
      );
    }

    const classification = this.identify(resolved, { labels, referrers });

    if (!classification.readsContentManifest) {
      this.logger.debug(
        `[${registry}] ${repository}:${tags.join(',')} classified as ` +
          `${classification.type} — ${classification.signals.join('; ')}`,
      );
      const adapter = this.contentTypes?.get(classification.type);
      if (adapter && resolved) {
        const connection = this.registries.get(registry)!.connection;
        const enumeration = await adapter
          .enumerate(resolved, {
            backend: new OCIBackendAdapter(client, connection),
            capabilities:
              this.registries.get(registry)?.capabilities ??
              MINIMAL_CAPABILITIES,
          })
          .catch(() => ({
            status: 'unknown' as const,
            source: 'blob-fetch' as const,
            schemaVersion: adapter.schema.version,
            diagnostics: ['content adapter enumeration failed'],
          }));
        const annotations = resolved.manifest.annotations ?? {};
        const metadata: Record<string, string> = {};
        for (const field of ['title', 'description', 'version', 'source']) {
          const value = annotations[`org.opencontainers.image.${field}`];
          if (value !== undefined) metadata[field] = value;
        }
        const safe = this.redactor.redactValue(
          { enumeration, metadata },
          { maxDepth: 64 },
        ) as {
          enumeration: ArchiveEnumeration;
          metadata: Record<string, string>;
        };
        // Failed archive reads must not erase last-good immutable contents. A
        // complete empty inventory is authoritative and deliberately clears them.
        if (
          safe.enumeration.source === 'blob-fetch' &&
          safe.enumeration.status !== 'complete' &&
          !safe.enumeration.items?.length
        ) {
          const previous = await this.getArtifact(base.ref);
          if (
            previous?.type === classification.type &&
            previous.contentsKnown &&
            previous.enumeration?.source === 'blob-fetch' &&
            previous.enumeration.items?.length
          ) {
            safe.enumeration = {
              ...safe.enumeration,
              status: 'partial',
              items: previous.enumeration.items,
              extractedAt: previous.enumeration.extractedAt,
              diagnostics: [
                'using cached/stale last-good inventory for the same immutable artifact; current enumeration failed',
                ...(safe.enumeration.diagnostics ?? [
                  'current enumeration returned no usable items',
                ]),
              ],
            };
          }
        }
        return {
          ...base,
          type: classification.type,
          classification,
          ...safe,
          contentsKnown:
            safe.enumeration.status === 'complete' ||
            (safe.enumeration.status === 'partial' &&
              Boolean(safe.enumeration.items?.length)),
        };
      }
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
    // Registry-controlled documentation must be clean before it reaches the
    // database, because persisted rows and backups are outside the API boundary.
    const manifest = located?.manifest
      ? (this.redactor.redactValue(located.manifest, {
          maxDepth: 64,
        }) as AnsibleContentManifest)
      : undefined;

    return {
      ...base,
      type: classification.type,
      contentsKnown: Boolean(manifest),
      classification,
      manifest,
    };
  }

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
}

export { UNKNOWN_IMAGE_TYPE };
