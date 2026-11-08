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
  ImageConfig,
  MemoryDigestCache,
  logSafeText,
  OCIClient,
  RegistryConnection,
  RegistryError,
  UNKNOWN_IMAGE_TYPE,
  readContentManifest,
  redactorForConnections,
} from '@ansible/automation-content-common';
import type {
  ContentTypeRegistry,
  Descriptor,
  MetadataBundle,
  ResolvedArtifact,
} from '@ansible/automation-content-common';

import { Knex } from 'knex';

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
  /** Registry Last-Modified timestamps keyed by tag, when available. */
  tagTimestamps?: Record<string, string>;
  pullReference: string;
  contentsKnown: boolean;
  classification: IdentifiedType;
  /**
   * Signature presence in three states. Cosign 3 writes signatures as OCI
   * referrers while older cosign and some registries use digest-derived
   * `.sig` tags, so a tool that walks only one scheme finds nothing and
   * calls the image unsigned — "not found" is not "not signed".
   */
  signing: SigningState;
  manifest?: AnsibleContentManifest;
}

/** What was checked and what was found; never a trust verdict. */
export interface SigningState {
  state: 'signed' | 'not-signed' | 'undetermined';
  evidence: string[];
}

export interface ArtifactListOptions {
  search?: string;
  registry?: string;
  collection?: string;
  contentsKnown?: boolean;
  sort?: 'repository' | 'registry' | 'sourceType' | 'lastReconciledAt';
  order?: 'asc' | 'desc';
}

/** One tag of one repository, resolved to the digest the index last read. */
export interface RepositoryTag {
  tag: string;
  digest: string;
  ref: string;
  lastModified?: string;
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

export interface ArtifactListOptions {
  type?: string;
  registry?: string;
  contentsKnown?: boolean;
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
}

/** Outcome of reconciling only one indexed row's repository latest tag. */
export interface ArtifactSyncResult {
  status: 'completed' | 'failed';
  ref: string;
  tag: 'latest';
  retainedPrevious: boolean;
  lastReconciledAt?: string;
  error?: string;
}

export class ArtifactSyncNotFoundError extends Error {
  constructor(readonly code: 'ARTIFACT_NOT_FOUND' | 'LATEST_TAG_NOT_FOUND') {
    super(
      code === 'LATEST_TAG_NOT_FOUND'
        ? 'Latest tag not found.'
        : 'Indexed artifact not found.',
    );
  }
}

/** Referrer fallback tags address artifacts about an image, not images. */
const REFERRER_TAG = /^sha256-[0-9a-f]{64}$/;
/** Cosign tag-based signatures: the tag name carries the signed image digest. */
const SIGNATURE_TAG = /^sha256-([0-9a-f]{64})\.sig$/;
/** Cosign OCI-referrer signatures declare this artifact type. */
const COSIGN_SIGNATURE_ARTIFACT_TYPE =
  'application/vnd.dev.cosign.simplesigning.v1+json';
/**
 * Sigstore bundles — cosign 3's default — share their artifact type with
 * attestations, so a bundle referrer proves neither a signature nor its
 * absence. Versioned (`…bundle.v0.1`, `v0.2`, `v0.3`), hence the prefix.
 */
const SIGSTORE_BUNDLE_PREFIX = 'application/vnd.dev.sigstore.bundle.';

/** Composite key for a content item. */
export function itemKey(artifactRef: string, fqcn: string): string {
  return `${artifactRef}::${fqcn}`;
}

/** Flatten an artifact's manifest into content items. */
function flattenItems(artifact: IndexedArtifact): IndexedItem[] {
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
        key: itemKey(artifact.ref, plugin.fqcn),
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
        key: itemKey(artifact.ref, role.fqcn),
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
        key: itemKey(artifact.ref, playbook.fqcn),
        fqcn: playbook.fqcn,
        name: playbook.name,
        type: 'playbook',
        detail: playbook as unknown as Record<string, unknown>,
      });
    }
    for (const eda of collection.edaPlugins) {
      items.push({
        ...base,
        key: itemKey(artifact.ref, eda.fqcn),
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
 * Database-backed content store.
 *
 * Artifacts and items are persisted in SQLite (dev) or PostgreSQL (production)
 * so the index survives backend restarts.
 */
export class ContentStore {
  private readonly registries = new Map<string, RegistryState>();
  private readonly clients = new Map<string, OCIClient>();
  private readonly reconcile = new Map<string, ReconcileState>();
  private readonly artifactReconcile = new Map<string, ReconcileState>();
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

  /**
   * Freshness for an already-resolved row. Sorting and per-row views call
   * this directly: resolving an artifact by ref is a linear scan, and doing
   * it once per row turns a sort into a quadratic walk. A partial read
   * never advances sibling rows or registry freshness.
   */
  reconcileStateOf(
    artifact: IndexedArtifact | undefined,
  ): ReconcileState | undefined {
    if (!artifact) return undefined;
    const full = this.reconcile.get(artifact.registry);
    const partial = this.artifactReconcile.get(artifact.ref);
    return partial && (!full || partial.at >= full.at) ? partial : full;
  }

  /** Resolve only latest for an indexed row; never enumerate repositories or tags. */
  async syncArtifact(ref: string): Promise<ArtifactSyncResult> {
    const original = await this.getArtifact(ref);
    const state = original && this.registries.get(original.registry);
    const client = original && this.clients.get(original.registry);
    const repository = original?.repository;
    const connection = state?.connection;
    const inScope =
      connection &&
      repository &&
      (connection.repositories?.length
        ? connection.repositories.includes(repository)
        : !connection.namespaces?.length ||
          connection.namespaces.some(ns => repository.startsWith(`${ns}/`)));
    if (!original || !client || !inScope)
      throw new ArtifactSyncNotFoundError('ARTIFACT_NOT_FOUND');

    try {
      // Mutable tag lookups are never digest-cached by OCIClient.
      let latest: ResolvedArtifact;
      try {
        latest = await client.getManifest(original.repository, 'latest');
      } catch (error) {
        if (error instanceof RegistryError && error.status === 404)
          throw new ArtifactSyncNotFoundError('LATEST_TAG_NOT_FOUND');
        throw error;
      }
      const manifest = latest.manifest;
      if (
        !latest.digest ||
        !manifest ||
        manifest.schemaVersion !== 2 ||
        (!('manifests' in manifest && Array.isArray(manifest.manifests)) &&
          !(
            'config' in manifest &&
            manifest.config?.digest &&
            Array.isArray(manifest.layers)
          ))
      ) {
        throw new Error('Latest manifest is invalid');
      }
      let config: ImageConfig | undefined;
      if ('config' in manifest) {
        config = await client.getConfigBlob(
          original.repository,
          manifest.config,
        );
        if (
          !config ||
          typeof config !== 'object' ||
          Array.isArray(config) ||
          (config.config !== undefined &&
            (!config.config ||
              typeof config.config !== 'object' ||
              Array.isArray(config.config)))
        ) {
          throw new Error('Image config could not be read');
        }
      }
      const target = await this.inspect(
        original.registry,
        original.repository,
        latest.digest,
        ['latest'],
        client,
        { artifact: latest, config },
      );
      const existing = await this.getArtifact(target.ref);
      target.tags = [...new Set([...(existing?.tags ?? []), 'latest'])];
      target.tagTimestamps = {
        ...(existing?.tagTimestamps ?? {}),
        ...(target.tagTimestamps ?? {}),
        ...(latest.lastModified ? { latest: latest.lastModified } : {}),
      };
      if (!target.manifest && existing?.manifest) {
        target.manifest = existing.manifest;
        target.contentsKnown = existing.contentsKnown;
      }
      // A row sync never enumerates tags, so the .sig scheme stays unchecked;
      // an undetermined result must not erase what a full scan established.
      if (target.signing.state === 'undetermined' && existing?.signing) {
        target.signing = existing.signing;
      }
      // Commit after core reads succeed, using current rows rather than a
      // pre-await snapshot. Older digests keep their data and non-latest aliases.
      await this.db.transaction(async trx => {
        const rows = await trx('artifacts')
          .where({
            registry: original.registry,
            repository: original.repository,
          })
          .select('*');
        for (const row of rows) {
          const artifact = this.rowToArtifact(row);
          if (artifact.ref === target.ref) continue;
          if (!artifact.tags.includes('latest')) continue;
          const tags = artifact.tags.filter(tag => tag !== 'latest');
          const tagTimestamps = { ...(artifact.tagTimestamps ?? {}) };
          delete tagTimestamps.latest;
          if (tags.length) {
            await trx('artifacts')
              .where('ref', artifact.ref)
              .update({
                tags: JSON.stringify(tags),
                tag_timestamps: JSON.stringify(tagTimestamps),
              });
          } else {
            await trx('items').where('artifact_ref', artifact.ref).del();
            await trx('artifacts').where('ref', artifact.ref).del();
          }
        }
        await trx('items').where('artifact_ref', target.ref).del();
        // A same-ref row keeps its position: UPDATE in place rather than
        // delete-and-reinsert, so a row sync never reshuffles paginated rows.
        // A newly resolved digest is inserted.
        if (existing) {
          await trx('artifacts')
            .where('ref', target.ref)
            .update({
              type: target.type,
              registry: target.registry,
              repository: target.repository,
              digest: target.digest,
              tags: JSON.stringify(target.tags),
              tag_timestamps: JSON.stringify(target.tagTimestamps ?? {}),
              pull_reference: target.pullReference,
              contents_known: target.contentsKnown,
              classification: JSON.stringify(target.classification),
              signing: target.signing ? JSON.stringify(target.signing) : null,
              manifest: target.manifest
                ? JSON.stringify(target.manifest)
                : null,
            });
        } else {
          await trx('artifacts').insert({
            ref: target.ref,
            type: target.type,
            registry: target.registry,
            repository: target.repository,
            digest: target.digest,
            tags: JSON.stringify(target.tags),
            tag_timestamps: JSON.stringify(target.tagTimestamps ?? {}),
            pull_reference: target.pullReference,
            contents_known: target.contentsKnown,
            classification: JSON.stringify(target.classification),
            signing: target.signing ? JSON.stringify(target.signing) : null,
            manifest: target.manifest ? JSON.stringify(target.manifest) : null,
          });
        }
        for (const item of flattenItems(target)) {
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
      });
      for (const knownRef of this.artifactReconcile.keys()) {
        if (!(await this.getArtifact(knownRef)))
          this.artifactReconcile.delete(knownRef);
      }
      const at = new Date().toISOString();
      this.artifactReconcile.set(target.ref, { at, ok: true, artifacts: 1 });
      return {
        status: 'completed',
        ref: target.ref,
        tag: 'latest',
        retainedPrevious: false,
        lastReconciledAt: at,
      };
    } catch (error) {
      const at = new Date().toISOString();
      this.artifactReconcile.set(ref, { at, ok: false, artifacts: 1 });
      if (error instanceof ArtifactSyncNotFoundError) throw error;
      this.logger.warn(
        `[${original.registry}] artifact sync failed: ${logSafeText(
          this.redactor.redactErrorText(error),
        )}`,
      );
      return {
        status: 'failed',
        ref,
        tag: 'latest',
        retainedPrevious: true,
        lastReconciledAt: at,
        error: 'Artifact reconciliation failed.',
      };
    }
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

  async listArtifacts(
    type?: string,
    options: ArtifactListOptions = {},
  ): Promise<IndexedArtifact[]> {
    const query = this.artifactQuery({ ...options, type });
    const rows = await query.select('*');
    return rows.map((row: Record<string, unknown>) => this.rowToArtifact(row));
  }

  /** Flattened tag→digest map for one repository across all its digests. */
  async repositoryTags(
    registry: string,
    repository: string,
  ): Promise<RepositoryTag[]> {
    const rows = await this.db('artifacts')
      .where({ registry, repository })
      .select('ref', 'digest', 'tags', 'tag_timestamps');
    return rows.flatMap(
      (row: {
        ref: string;
        digest: string;
        tags: string;
        tag_timestamps?: string;
      }) => {
        const timestamps = JSON.parse(row.tag_timestamps ?? '{}') as Record<
          string,
          string
        >;
        return (JSON.parse(row.tags ?? '[]') as string[]).map(tag => ({
          tag,
          digest: row.digest,
          ref: row.ref,
          ...(timestamps[tag] ? { lastModified: timestamps[tag] } : {}),
        }));
      },
    );
  }

  async listArtifactsPaginated(
    options: ArtifactListOptions & { limit: number; offset: number },
  ): Promise<PaginatedResult<IndexedArtifact>> {
    const base = this.artifactQuery(options);
    const countRow = await base.clone().count('* as count').first();
    const totalCount = Number(countRow?.count ?? 0);
    const rows = await base
      .clone()
      .select('*')
      .orderBy('ref')
      .limit(options.limit)
      .offset(options.offset);
    return {
      items: rows.map((row: Record<string, unknown>) =>
        this.rowToArtifact(row),
      ),
      totalCount,
    };
  }

  private artifactQuery(opts: ArtifactListOptions) {
    const query = this.db('artifacts');
    if (opts.type) query.where('type', opts.type);
    if (opts.registry) query.where('registry', opts.registry);
    if (opts.contentsKnown !== undefined)
      query.where('contents_known', opts.contentsKnown);
    if (opts.search?.trim()) {
      const pattern = `%${opts.search
        .trim()
        .toLowerCase()
        .replace(/[\\%_]/g, '\\$&')}%`;
      const postgres = this.db.client.config.client === 'pg';
      query.where(function searchFields() {
        for (const field of [
          'repository',
          'registry',
          'digest',
          'tags',
          'type',
        ]) {
          this.orWhereRaw("LOWER(??) LIKE ? ESCAPE '\\'", [field, pattern]);
        }
        const collections = postgres
          ? "SELECT 1 FROM jsonb_array_elements(COALESCE(manifest::jsonb->'collections', '[]'::jsonb)) AS c WHERE LOWER((c->>'namespace') || '.' || (c->>'name')) LIKE ? ESCAPE '\\'"
          : "SELECT 1 FROM json_each(manifest, '$.collections') AS c WHERE LOWER(json_extract(c.value, '$.namespace') || '.' || json_extract(c.value, '$.name')) LIKE ? ESCAPE '\\'";
        this.orWhereRaw(`EXISTS (${collections})`, [pattern]);
      });
    }
    return query;
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

  async findItems(fqcn: string, artifactRef?: string): Promise<IndexedItem[]> {
    const query = this.db('items').where('fqcn', fqcn);
    if (artifactRef) query.where('artifact_ref', artifactRef);
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

    // A later full attempt supersedes row attempts, including same-millisecond
    // timestamps; partial attempts after this point may advance only their row.
    for (const knownRef of [...this.artifactReconcile.keys()]) {
      const artifact = await this.getArtifact(knownRef);
      if (!artifact || artifact.registry === name)
        this.artifactReconcile.delete(knownRef);
    }

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
        await trx('artifacts').insert({
          ref: a.ref,
          type: a.type,
          registry: a.registry,
          repository: a.repository,
          digest: a.digest,
          tags: JSON.stringify(a.tags),
          tag_timestamps: JSON.stringify(a.tagTimestamps ?? {}),
          pull_reference: a.pullReference,
          contents_known: a.contentsKnown,
          classification: JSON.stringify(a.classification),
          signing: a.signing ? JSON.stringify(a.signing) : null,
          manifest: a.manifest ? JSON.stringify(a.manifest) : null,
        });
        const items = flattenItems(a);
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
          if (SIGNATURE_TAG.test(tag) || REFERRER_TAG.test(tag)) continue;
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
    return {
      ref: row.ref as string,
      type: row.type as string,
      registry: row.registry as string,
      repository: row.repository as string,
      digest: row.digest as string,
      tags: JSON.parse(row.tags as string),
      tagTimestamps: JSON.parse(
        (row.tag_timestamps as string | undefined) ?? '{}',
      ),
      pullReference: row.pull_reference as string,
      contentsKnown: Boolean(row.contents_known),
      classification: JSON.parse(row.classification as string),
      signing: row.signing ? JSON.parse(row.signing as string) : undefined,
      manifest: row.manifest ? JSON.parse(row.manifest as string) : undefined,
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
      // An absent or pessimistic capability result is not evidence that the
      // registry is empty. Fail this attempt — the caller keeps previously
      // indexed artifacts — and drop the cached capabilities so the next
      // cycle re-probes: a probe that raced slow startup traffic must not pin
      // a false result for the lifetime of the process.
      state.capabilities = undefined;
      throw new Error(
        `no repositories configured for ${name} and catalog enumeration is unavailable`,
      );
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
    const byDigest = new Map<
      string,
      { tags: string[]; timestamps: Record<string, string> }
    >();
    // Image digests covered by a digest-derived `.sig` signature tag, keyed
    // by the hex in the tag name. The tags themselves address signature
    // artifacts, never images, so they are recorded and skipped.
    const signedByTag = new Set<string>();

    for await (const tag of client.listTags(repository)) {
      const signature = SIGNATURE_TAG.exec(tag);
      if (signature) {
        signedByTag.add(signature[1]);
        continue;
      }
      if (REFERRER_TAG.test(tag)) continue;
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
      const tagInfo = byDigest.get(head.digest) ?? {
        tags: [],
        timestamps: {},
      };
      tagInfo.tags.push(tag);
      if (head.lastModified) tagInfo.timestamps[tag] = head.lastModified;
      byDigest.set(head.digest, tagInfo);
    }

    const found: IndexedArtifact[] = [];
    for (const [digest, tagInfo] of byDigest) {
      found.push(
        await this.inspect(
          registry,
          repository,
          digest,
          tagInfo.tags,
          client,
          undefined,
          tagInfo.timestamps,
          signedByTag,
        ),
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
    verified?: { artifact: ResolvedArtifact; config?: ImageConfig },
    tagTimestamps: Record<string, string> = {},
    signedByTag?: Set<string>,
  ): Promise<IndexedArtifact> {
    const base = {
      ref: `${registry}/${repository}@${digest}`,
      registry,
      repository,
      digest,
      tags,
      tagTimestamps,
      pullReference: client.pullReference({
        registry,
        repository,
        reference: digest,
      }),
    };

    const { referrers, via } = await client
      .getReferrers(repository, digest)
      .catch(() => ({ referrers: [], via: 'none' as const }));
    const signing = this.determineSigning(digest, referrers, via, signedByTag);

    let labels: Record<string, string> | undefined;
    let resolved: ResolvedArtifact | undefined;
    try {
      resolved =
        verified?.artifact ?? (await client.getManifest(repository, digest));
      const config = (resolved.manifest as ImageManifest).config;
      if (config) {
        const blob = verified
          ? verified.config
          : await client.getConfigBlob(repository, config);
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
      return {
        ...base,
        type: classification.type,
        contentsKnown: false,
        classification,
        signing,
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
      signing,
      manifest,
    };
  }

  /**
   * Signature presence, checked across both schemes cosign has used.
   *
   * "Signed" reports that a signature artifact was found — it asserts nothing
   * about who signed or whether the signature still verifies. "Not signed" is
   * only reported when both schemes could be checked and neither had a
   * signature; when a scheme was unavailable the state is "undetermined",
   * because an unfindable signature is not proof of its absence.
   */
  private determineSigning(
    digest: string,
    referrers: Descriptor[],
    referrersVia: string,
    signedByTag?: Set<string>,
  ): SigningState {
    if (
      referrers.some(
        descriptor =>
          descriptor.artifactType === COSIGN_SIGNATURE_ARTIFACT_TYPE,
      )
    ) {
      return {
        state: 'signed',
        evidence: ['cosign signature referrer found'],
      };
    }
    const evidence = ['no cosign signature referrer'];
    const hex = digest.replace(/^sha256:/, '');
    if (signedByTag?.has(hex)) {
      return {
        state: 'signed',
        evidence: [...evidence, 'digest-derived .sig tag found'],
      };
    }
    evidence.push('no digest-derived .sig tag');
    if (
      referrers.some(descriptor =>
        descriptor.artifactType?.startsWith(SIGSTORE_BUNDLE_PREFIX),
      )
    ) {
      // A Sigstore bundle is cosign 3's signature format, but the same
      // artifact type also carries attestations. Without reading the
      // bundle's content neither a signature nor its absence can be
      // claimed, so the honest state is undetermined.
      return {
        state: 'undetermined',
        evidence: [
          ...evidence,
          'sigstore bundle referrer present; not identifiable as a signature',
        ],
      };
    }
    if (
      referrers.some(descriptor =>
        descriptor.artifactType?.startsWith(SIGSTORE_BUNDLE_PREFIX),
      )
    ) {
      // A Sigstore bundle is cosign 3's signature format, but the same
      // artifact type also carries attestations. Without reading the
      // bundle's content neither a signature nor its absence can be
      // claimed, so the honest state is undetermined.
      return {
        state: 'undetermined',
        evidence: [
          ...evidence,
          'sigstore bundle referrer present; not identifiable as a signature',
        ],
      };
    }
    if (referrersVia === 'none' || !signedByTag) {
      // One of the schemes could not be consulted; absence is not provable.
      return {
        state: 'undetermined',
        evidence: [...evidence, 'a signature scheme could not be checked'],
      };
    }
    return { state: 'not-signed', evidence };
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
}

export { UNKNOWN_IMAGE_TYPE };
