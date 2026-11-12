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
  eeRepositoryEntityRef,
  isOciAttachmentTag,
  isOciImageConfig,
  isOciManifest,
  MediaTypes,
  ImageManifest,
  MemoryDigestCache,
  logSafeText,
  OCIClient,
  RegistryConnection,
  UNKNOWN_IMAGE_TYPE,
  readContentManifest,
  redactorForConnections,
} from '@ansible/automation-content-common';
import type {
  ContentTypeRegistry,
  Descriptor,
  EERepositoryDetails,
  EERepositoryDigest,
  EERepositoryQuery,
  EERepositoryQueryResult,
  EERepositorySummary,
  EERepositorySyncResult,
  EERepositoryTag,
  SigningObservation,
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
  tagTimestamps?: Record<string, string>;
  signing?: SigningObservation;
  pullReference: string;
  contentsKnown: boolean;
  classification: IdentifiedType;
  manifest?: AnsibleContentManifest;
}

export class RegistryWriterBusy extends Error {}
export class RegistryScanIncomplete extends Error {}

export interface TagChange {
  repository: string;
  tag: string;
  before?: string;
  after?: string;
}

interface RepositoryInventory {
  byDigest: Map<string, string[]>;
  tagTimestamps: Map<string, string>;
  completeTags: Set<string>;
}

interface RegistryRefresh {
  discovered: number;
  ok: boolean;
  error?: string;
  changes?: TagChange[];
}

interface RegistryPoll {
  changed: boolean;
  refreshed: boolean;
  details: string[];
  requests: number;
  changes?: TagChange[];
}

function tagChanges(
  previous: IndexedArtifact[],
  current: IndexedArtifact[],
): TagChange[] {
  const bindings = (artifacts: IndexedArtifact[]) =>
    new Map(
      artifacts.flatMap(({ repository, digest, tags }) =>
        tags
          .filter(tag => !isOciAttachmentTag(tag))
          .map(tag => [JSON.stringify([repository, tag]), digest] as const),
      ),
    );
  const before = bindings(previous);
  const after = bindings(current);
  return Array.from(new Set([...before.keys(), ...after.keys()])).flatMap(
    key => {
      const oldDigest = before.get(key);
      const newDigest = after.get(key);
      if (oldDigest === newDigest) return [];
      const [repository, tag] = JSON.parse(key) as [string, string];
      return [{ repository, tag, before: oldDigest, after: newDigest }];
    },
  );
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
  excludeType?: string;
  registry?: string;
  contentsKnown?: boolean;
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
}

type RepositoryArtifact = Pick<
  IndexedArtifact,
  | 'ref'
  | 'digest'
  | 'registry'
  | 'repository'
  | 'tags'
  | 'tagTimestamps'
  | 'signing'
>;

const repositoryTagCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function compareRepositoryTags(
  a: Omit<EERepositoryTag, 'taggedPullReference'>,
  b: Omit<EERepositoryTag, 'taggedPullReference'>,
): number {
  const aTime = Date.parse(a.lastModified ?? '') || -Infinity;
  const bTime = Date.parse(b.lastModified ?? '') || -Infinity;
  if (aTime !== bTime) return bTime - aTime;
  if (a.tag !== b.tag) {
    if (a.tag === 'latest') return 1;
    if (b.tag === 'latest') return -1;
  }
  return (
    repositoryTagCollator.compare(b.tag, a.tag) ||
    compareText(b.tag, a.tag) ||
    compareText(a.artifactRef, b.artifactRef)
  );
}

function repositoryVersions(artifacts: RepositoryArtifact[]) {
  const digests: EERepositoryDigest[] = artifacts
    .map(artifact => ({ digest: artifact.digest, artifactRef: artifact.ref }))
    .sort((a, b) => compareText(a.artifactRef, b.artifactRef));
  const sortedTags = artifacts
    .flatMap(artifact =>
      artifact.tags.map(tag => ({
        tag,
        digest: artifact.digest,
        artifactRef: artifact.ref,
        lastModified: artifact.tagTimestamps?.[tag],
      })),
    )
    .sort(compareRepositoryTags);
  const tags = new Map<string, (typeof sortedTags)[number]>();
  for (const tag of sortedTags) {
    if (!tags.has(tag.tag)) tags.set(tag.tag, tag);
  }
  const representative = sortedTags[0] ?? digests[0];
  return {
    representative,
    representativeTag: sortedTags[0]?.tag,
    digests,
    tags: [...tags.values()],
  };
}

/** Referrer fallback tags address artifacts about an image, not images. */
const REFERRER_TAG = /^sha256-[0-9a-f]{64}$/;

/** Composite key for a content item. */
export function itemKey(
  artifactRef: string,
  fqcn: string,
  type?: string,
): string {
  return type === undefined
    ? `${artifactRef}::${fqcn}`
    : JSON.stringify([artifactRef, type, fqcn]);
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
  // A manifest can repeat an entry. Preserve the first document for an
  // identical type and FQCN while indexing different plugin types separately.
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
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
  private readonly writers = new Map<string, Promise<unknown>>();
  private readonly registrySuccess = new Map<string, string>();
  private readonly repositorySuccess = new Map<string, string>();
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

  lastSuccessfulReconcileAt(
    registry: string,
    repository?: string,
  ): string | undefined {
    return repository === undefined
      ? this.registrySuccess.get(registry)
      : this.repositorySuccess.get(JSON.stringify([registry, repository]));
  }

  private async writeRegistry<T>(
    name: string,
    wait: boolean,
    run: () => Promise<T>,
  ): Promise<T> {
    for (;;) {
      const previous = this.writers.get(name);
      if (!previous) break;
      if (!wait) throw new RegistryWriterBusy();
      await previous.catch(() => {});
    }
    const operation = Promise.resolve().then(run);
    this.writers.set(name, operation);
    try {
      return await operation;
    } finally {
      if (this.writers.get(name) === operation) this.writers.delete(name);
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
    excludeType?: string,
  ): Promise<IndexedArtifact[]> {
    const query = this.artifactQuery({ type, excludeType });
    const rows = await query.select('*');
    return rows.map((row: Record<string, unknown>) => this.rowToArtifact(row));
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
    if (opts.excludeType) query.whereNot('type', opts.excludeType);
    if (opts.registry) query.where('registry', opts.registry);
    if (opts.contentsKnown !== undefined)
      query.where('contents_known', opts.contentsKnown);
    return query;
  }

  private async repositoryArtifacts(
    registry?: string,
    repository?: string,
  ): Promise<RepositoryArtifact[]> {
    const query = this.artifactQuery({
      type: 'execution-environment',
      registry,
    });
    if (repository !== undefined) query.where('repository', repository);
    const rows = await query.select(
      'ref',
      'digest',
      'registry',
      'repository',
      'tags',
      'signing',
      'tag_timestamps',
    );
    const artifacts: RepositoryArtifact[] = [];
    for (const row of rows) {
      const {
        ref,
        digest,
        registry: registryName,
        repository: repositoryName,
      } = row;
      if (
        !this.clients.has(registryName) ||
        this.redactor.redact(registryName) !== registryName ||
        this.redactor.redact(repositoryName) !== repositoryName
      ) {
        continue;
      }
      const indexedTags: string[] = JSON.parse(row.tags);
      const tags = indexedTags.filter(
        tag => !isOciAttachmentTag(tag) && this.redactor.redact(tag) === tag,
      );
      if (indexedTags.length && !tags.length) continue;
      artifacts.push({
        ref,
        digest,
        registry: registryName,
        repository: repositoryName,
        tags,
        signing: row.signing ? JSON.parse(row.signing) : undefined,
        tagTimestamps: row.tag_timestamps
          ? JSON.parse(row.tag_timestamps)
          : undefined,
      });
    }
    return artifacts;
  }

  async queryEERepositories(
    query: EERepositoryQuery,
  ): Promise<EERepositoryQueryResult> {
    const {
      page = 1,
      pageSize = 10,
      sort = 'repository',
      order = 'asc',
    } = query;
    const favorites =
      query.favoriteEntityRefs && new Set(query.favoriteEntityRefs);
    const needle = query.query?.trim().toLowerCase();
    const groups = new Map<string, RepositoryArtifact[]>();
    for (const artifact of await this.repositoryArtifacts(query.registry)) {
      const key = JSON.stringify([artifact.registry, artifact.repository]);
      const group = groups.get(key);
      if (group) group.push(artifact);
      else groups.set(key, [artifact]);
    }

    const summaries: EERepositorySummary[] = [];
    for (const artifacts of groups.values()) {
      const { registry, repository } = artifacts[0];
      const entityRef = eeRepositoryEntityRef(registry, repository);
      if (favorites && !favorites.has(entityRef)) continue;
      const { representative, representativeTag, tags } =
        repositoryVersions(artifacts);
      if (
        needle &&
        ![registry, repository, ...tags.map(({ tag }) => tag)].some(value =>
          value.toLowerCase().includes(needle),
        )
      ) {
        continue;
      }
      const signingState = artifacts.find(
        artifact => artifact.ref === representative.artifactRef,
      )?.signing?.state;
      summaries.push({
        registry,
        repository,
        entityRef,
        representativeDigest: representative.digest,
        representativeRef: representative.artifactRef,
        representativeTag,
        tagCount: tags.length,
        signingState,
        lastSuccessfulReconcileAt: this.lastSuccessfulReconcileAt(
          registry,
          repository,
        ),
      });
    }
    summaries.sort((a, b) => {
      const left = a[sort];
      const right = b[sort];
      if (left === undefined && right !== undefined) return 1;
      if (right === undefined && left !== undefined) return -1;
      const sorted =
        left === undefined || right === undefined
          ? 0
          : compareText(left, right);
      return (
        (order === 'asc' ? sorted : -sorted) ||
        compareText(a.registry, b.registry) ||
        compareText(a.repository, b.repository)
      );
    });
    const offset = (page - 1) * pageSize;
    return {
      page,
      pageSize,
      totalItems: summaries.length,
      items: summaries.slice(offset, offset + pageSize),
    };
  }

  async getEERepository(
    registry: string,
    repository: string,
  ): Promise<EERepositoryDetails | undefined> {
    const client = this.clients.get(registry);
    if (!client) return undefined;
    const artifacts = await this.repositoryArtifacts(registry, repository);
    if (!artifacts.length) return undefined;
    const { representative, tags, digests } = repositoryVersions(artifacts);
    return {
      registry,
      repository,
      entityRef: eeRepositoryEntityRef(registry, repository),
      representativeRef: representative.artifactRef,
      tags: tags.map(tag => ({
        ...tag,
        taggedPullReference: client.pullReference({
          registry,
          repository,
          reference: tag.tag,
        }),
      })),
      digests,
    };
  }

  async getArtifact(ref: string): Promise<IndexedArtifact | undefined> {
    const row = await this.db('artifacts').where('ref', ref).first();
    return row ? this.rowToArtifact(row) : undefined;
  }

  private itemQuery(excludeArtifactType?: string) {
    const query = this.db('items');
    if (excludeArtifactType) {
      query.whereIn(
        'artifact_ref',
        this.artifactQuery({ excludeType: excludeArtifactType }).select('ref'),
      );
    }
    return query;
  }

  async listItems(excludeArtifactType?: string): Promise<IndexedItem[]> {
    const rows = await this.itemQuery(excludeArtifactType).select('*');
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
    excludeArtifactType?: string,
  ): Promise<IndexedItem[]> {
    const query = this.itemQuery(excludeArtifactType).where('fqcn', fqcn);
    if (artifactRef) query.where('artifact_ref', artifactRef);
    const rows = await query.select('*');
    return rows.map((row: Record<string, unknown>) => this.rowToItem(row));
  }

  async listCollections(
    excludeArtifactType?: string,
  ): Promise<
    Array<ManifestCollectionEntry & { fqcn: string; providedBy: string[] }>
  > {
    const artifacts = await this.listArtifacts(undefined, excludeArtifactType);
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

  async refreshAll(
    observe?: (name: string, result: RegistryRefresh) => Promise<void>,
  ): Promise<{ artifacts: number; items: number }> {
    for (const name of this.registries.keys()) {
      const result = await this.refreshRegistry(name);
      await observe?.(name, result);
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

  async refreshRegistry(name: string, wait = true): Promise<RegistryRefresh> {
    return this.writeRegistry(name, wait, () => this.reconcileRegistry(name));
  }

  private async reconcileRegistry(
    name: string,
    inventory?: ReadonlyMap<string, RepositoryInventory>,
  ): Promise<RegistryRefresh> {
    const outcome = await this.discoverRegistry(name, inventory);
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

    const changes = await this.persistReconcile(name, outcome.artifacts);
    this.registrySuccess.set(name, at);
    for (const artifact of outcome.artifacts) {
      this.repositorySuccess.set(
        JSON.stringify([name, artifact.repository]),
        at,
      );
    }

    this.lastRefreshed = at;
    this.reconcile.set(name, {
      at,
      ok: true,
      artifacts: outcome.artifacts.length,
    });
    return { discovered: outcome.artifacts.length, ok: true, changes };
  }

  /** Replaces the indexed scope and computes material deltas from its prior committed state. */
  private async persistReconcile(
    registry: string,
    artifacts: IndexedArtifact[],
    repository?: string,
  ): Promise<TagChange[]> {
    return this.db
      .transaction(async trx => {
        const scope = () => {
          const query = trx('artifacts').where({ registry });
          if (repository !== undefined) query.andWhere({ repository });
          return query;
        };
        const previous = (await scope().select('*')).map(row =>
          this.rowToArtifact(row),
        );
        const previousByRef = new Map(
          previous.map(artifact => [artifact.ref, artifact]),
        );
        for (const artifact of artifacts) {
          const old = previousByRef.get(artifact.ref);
          if (
            !artifact.manifest &&
            old?.manifest &&
            artifact.type === old.type
          ) {
            artifact.manifest = old.manifest;
            artifact.contentsKnown = old.contentsKnown;
          }
        }
        const changes = tagChanges(previous, artifacts);
        await scope().del();
        for (const a of artifacts) {
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
            manifest: a.manifest ? JSON.stringify(a.manifest) : null,
            tag_timestamps: a.tagTimestamps
              ? JSON.stringify(a.tagTimestamps)
              : null,
            signing: a.signing ? JSON.stringify(a.signing) : null,
          });
          const items = flattenItems(a);
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
        return changes;
      })
      .catch(() => {
        // Database errors can include the full inserted manifest and item docs.
        throw new Error('Unable to persist registry reconciliation');
      });
  }

  async refreshEERepository(
    registry: string,
    repository: string,
  ): Promise<
    { result: EERepositorySyncResult; changes: TagChange[] } | undefined
  > {
    return this.writeRegistry(registry, false, async () => {
      const client = this.clients.get(registry);
      if (!client || !(await this.getEERepository(registry, repository)))
        return undefined;
      let artifacts: IndexedArtifact[];
      try {
        artifacts = await this.scanRepository(registry, repository, client);
      } catch {
        throw new RegistryScanIncomplete();
      }
      const changes = await this.persistReconcile(
        registry,
        artifacts,
        repository,
      );
      const at = new Date().toISOString();
      this.repositorySuccess.set(JSON.stringify([registry, repository]), at);
      return {
        result: {
          status: 'completed',
          registry,
          repository,
          addedTags: changes.filter(change => !change.before).length,
          movedTags: changes.filter(change => change.before && change.after)
            .length,
          removedTags: changes.filter(change => !change.after).length,
          retainedPrevious: false,
          lastSuccessfulReconcileAt: at,
        },
        changes,
      };
    });
  }

  async detectDrift(name: string): Promise<DriftState> {
    return this.checkDrift(name, new Map());
  }

  private async checkDrift(
    name: string,
    inventory: Map<string, RepositoryInventory>,
  ): Promise<DriftState> {
    const state = this.registries.get(name);
    const client = this.clients.get(name);
    const at = new Date().toISOString();

    if (!state || !client) {
      return { at, changed: false, details: ['unknown registry'], requests: 0 };
    }

    const details: string[] = [];
    let requests = 0;

    try {
      const repositories = await this.resolveRepositories(state, client);
      requests += 1;

      for (const repository of repositories) {
        const snapshot = await this.readRepositoryInventory(repository, client);
        inventory.set(repository, snapshot);
        requests += 2 * snapshot.completeTags.size;
        const observed = new Map(
          [...snapshot.byDigest].flatMap(([digest, tags]) =>
            tags.map(tag => [tag, digest] as const),
          ),
        );

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
      const knownRepositories: string[] = await this.db('artifacts')
        .where({ registry: name })
        .distinct()
        .pluck('repository');
      for (const repository of knownRepositories) {
        if (!inventory.has(repository)) details.push(`${repository} removed`);
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

  async pollRegistry(name: string, wait = true): Promise<RegistryPoll> {
    return this.writeRegistry(name, wait, () => this.reconcileDrift(name));
  }

  private async reconcileDrift(name: string): Promise<RegistryPoll> {
    const inventory = new Map<string, RepositoryInventory>();
    const drift = await this.checkDrift(name, inventory);
    if (!drift.changed) {
      return {
        changed: false,
        refreshed: false,
        details: drift.details,
        requests: drift.requests,
      };
    }
    this.logger.info(`[${name}] drift detected: ${drift.details.join('; ')}`);
    const outcome = await this.reconcileRegistry(name, inventory);
    return {
      changed: true,
      refreshed: outcome.ok,
      changes: outcome.changes,
      details: drift.details,
      requests: drift.requests,
    };
  }

  async pollAll(
    observe?: (name: string, result: RegistryPoll) => Promise<void>,
  ): Promise<{
    checked: number;
    refreshed: number;
    requests: number;
  }> {
    let refreshed = 0;
    let requests = 0;
    for (const name of this.registries.keys()) {
      const result = await this.pollRegistry(name);
      await observe?.(name, result);
      requests += result.requests;
      if (result.refreshed) refreshed += 1;
    }
    return { checked: this.registries.size, refreshed, requests };
  }

  private async discoverRegistry(
    name: string,
    inventory?: ReadonlyMap<string, RepositoryInventory>,
  ): Promise<{
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
      repositories = inventory
        ? [...inventory.keys()]
        : await this.resolveRepositories(state, client);
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
        found.push(
          ...(await this.scanRepository(
            name,
            repository,
            client,
            inventory?.get(repository),
          )),
        );
        this.logger.info(
          `[${name}] scanned ${repo}: ${found.length} artifact(s)`,
        );
      } catch (error) {
        failures.push(
          `${this.redactor.redact(repo)}: ${this.redactor.redactErrorText(
            error,
          )}`,
        );
        this.logger.warn(
          `[${name}] incomplete repository inspection; keeping prior registry view`,
        );
      }
    }

    if (failures.length > 0) {
      return {
        ok: false,
        error: `incomplete registry scan: ${failures[0]}`,
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
      tagTimestamps: row.tag_timestamps
        ? JSON.parse(row.tag_timestamps as string)
        : undefined,
      signing: row.signing ? JSON.parse(row.signing as string) : undefined,
      pullReference: row.pull_reference as string,
      contentsKnown: Boolean(row.contents_known),
      classification: JSON.parse(row.classification as string),
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
    state: RegistryState,
    client: OCIClient,
  ): Promise<string[]> {
    const configured = state.connection.repositories ?? [];
    if (configured.length > 0) return configured;

    const namespaces = state.connection.namespaces;
    const discovered: string[] = [];
    for await (const repository of client.listRepositories(100, {
      strict: true,
    })) {
      if (
        !namespaces?.length ||
        namespaces.some(ns => repository.startsWith(`${ns}/`))
      ) {
        discovered.push(repository);
      }
    }
    return discovered;
  }

  private async readRepositoryInventory(
    repository: string,
    client: OCIClient,
  ): Promise<RepositoryInventory> {
    const byDigest = new Map<string, string[]>();
    const tagTimestamps = new Map<string, string>();
    const completeTags = new Set<string>();

    for await (const tag of client.listTags(repository, 100, {
      strict: true,
    })) {
      completeTags.add(tag);
      if (REFERRER_TAG.test(tag)) continue;
      const head = await client.headManifest(repository, tag, { strict: true });
      if (!head.digest) throw new RegistryScanIncomplete();
      byDigest.set(head.digest, [...(byDigest.get(head.digest) ?? []), tag]);
      if (head.lastModified) tagTimestamps.set(tag, head.lastModified);
    }
    return { byDigest, tagTimestamps, completeTags };
  }

  private async scanRepository(
    registry: string,
    repository: string,
    client: OCIClient,
    inventory?: RepositoryInventory,
  ): Promise<IndexedArtifact[]> {
    const { byDigest, tagTimestamps, completeTags } =
      inventory ?? (await this.readRepositoryInventory(repository, client));
    const found: IndexedArtifact[] = [];
    for (const [digest, tags] of byDigest) {
      const artifact = await this.inspect(
        registry,
        repository,
        digest,
        tags,
        client,
        completeTags,
      );
      artifact.tagTimestamps = Object.fromEntries(
        tags.flatMap(tag =>
          tagTimestamps.has(tag) ? [[tag, tagTimestamps.get(tag)!]] : [],
        ),
      );
      found.push(artifact);
    }
    return found;
  }

  private async inspect(
    registry: string,
    repository: string,
    digest: string,
    tags: string[],
    client: OCIClient,
    completeTags: ReadonlySet<string>,
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

    const resolved = await client.getManifest(repository, digest);
    if (resolved.digest !== digest || !isOciManifest(resolved.manifest))
      throw new RegistryScanIncomplete();
    const config = (resolved.manifest as ImageManifest).config;
    const blob = config
      ? await client.getConfigBlob(repository, config)
      : undefined;
    if (
      (blob !== undefined ||
        config?.mediaType === MediaTypes.ociConfig ||
        config?.mediaType === MediaTypes.dockerConfig) &&
      !isOciImageConfig(blob)
    ) {
      throw new RegistryScanIncomplete();
    }
    const { referrers, signing } = await client.inspectReferrersAndSigning(
      repository,
      digest,
      completeTags,
    );
    const classification = this.identify(resolved, {
      labels: blob?.config?.Labels,
      referrers,
    });
    if (
      classification.type !== 'execution-environment' &&
      signing.mechanisms.some(
        evidence =>
          evidence.mechanism === 'oci-referrers' &&
          evidence.outcome === 'failed',
      )
    ) {
      throw new RegistryScanIncomplete();
    }
    const evidence =
      classification.type === 'execution-environment' ? signing : undefined;

    if (!classification.readsContentManifest) {
      this.logger.debug(
        `[${registry}] ${repository}:${tags.join(',')} classified as ` +
          `${classification.type} — ${classification.signals.join('; ')}`,
      );
      return {
        ...base,
        type: classification.type,
        contentsKnown: false,
        signing: evidence,
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
      signing: evidence,
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
