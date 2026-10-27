import { Entity } from '@backstage/catalog-model';
import {
  LoggerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import {
  CapabilityProbe,
  ContentTypeRegistry,
  ImageManifest,
  MetadataBundle,
  FetchLike,
  OCIClient,
  RegistryConnection,
  Resolution,
  UNKNOWN_IMAGE_TYPE,
  readContentManifest,
  BackendCapabilities,
} from '@ansible/automation-content-common';
import {
  AnsibleContentManifest,
  CONTENT_MANIFEST_ARTIFACT_TYPE,
  summariseManifest,
} from '@ansible/content-model';

export const ANNOTATION_PREFIX = 'ansible.com';

/**
 * Referrer fallback tags, as defined by the OCI distribution spec for registries
 * without a referrers endpoint. They address artifacts *about* an image, not images.
 */
const REFERRER_TAG = /^sha256-[0-9a-f]{64}$/;

/**
 * Build the "Registry" link shown on a catalog entity.
 *
 * The configured registry URL is stored in canonical form, where a bare host
 * gains a trailing slash (`https://quay.io/`). Gluing strings onto that with
 * a `/` in the middle produces `https://quay.io//repo`, so the link is
 * assembled through the URL parser instead, which normalises the join for
 * every URL shape — including a registry mounted under a sub-path.
 *
 * The scheme the registry was configured with is kept as-is, because forcing
 * `http://` would downgrade HTTPS registries; `https` is assumed when the
 * configured URL somehow carries no scheme at all.
 */
export function registryLinkUrl(
  registryUrl: string,
  repository: string,
): string {
  const withScheme = registryUrl.startsWith('http')
    ? registryUrl
    : `https://${registryUrl}`;
  // The parser replaces the last path segment when joining a relative
  // reference, so the base is normalised to end with a slash first. The one
  // shape the parser does not add it to is a sub-path mount
  // (`https://host/prefix`), which is exactly the shape that would lose its
  // prefix without this.
  const base = withScheme.endsWith('/') ? withScheme : `${withScheme}/`;
  return new URL(repository, base).toString();
}

/**
 * Whether the adapter that claimed this artifact reads a build-time content manifest.
 *
 * The provider renders rich sub-entities — a component per collection — only for such
 * types. Gated on a *declared media type* rather than on a type name, so it stays a
 * statement about capability rather than about identity, and a future content type that
 * publishes the same manifest gets the same treatment without editing this file.
 *
 * This is the last EE-shaped assumption in the provider. It survives because the
 * universal Enumeration is flat — `collections: ContentRef[]`, `plugins: PluginDoc[]` —
 * while these entities need the per-collection nesting the raw manifest carries. Making
 * this fully generic is a change to the content model, not to this file.
 */
function declaresContentManifest(identified: Identified): boolean {
  return Boolean(
    identified.resolution?.adapter.mediaTypes.includes(
      CONTENT_MANIFEST_ARTIFACT_TYPE,
    ),
  );
}

/** Location type used for entities discovered in a registry. */
const LOCATION_TYPE = 'oci-registry';

export const Annotations = {
  registry: `${ANNOTATION_PREFIX}/registry`,
  repository: `${ANNOTATION_PREFIX}/repository`,
  digest: `${ANNOTATION_PREFIX}/digest`,
  tags: `${ANNOTATION_PREFIX}/tags`,
  pullReference: `${ANNOTATION_PREFIX}/pull-reference`,
  /** How the contents were determined. Fidelity varies, so it is recorded. */
  enumerationSource: `${ANNOTATION_PREFIX}/enumeration-source`,
  ansibleCore: `${ANNOTATION_PREFIX}/ansible-core`,
  contentCounts: `${ANNOTATION_PREFIX}/content-counts`,
  contentType: `${ANNOTATION_PREFIX}/content-type`,
  classification: `${ANNOTATION_PREFIX}/classification`,
  lastReconciled: `${ANNOTATION_PREFIX}/last-reconciled`,
  capabilities: `${ANNOTATION_PREFIX}/registry-capabilities`,
} as const;

export interface RegistryProviderConfig extends RegistryConnection {
  /** Repositories to scan when the registry cannot enumerate its own catalog. */
  repositories?: string[];
}

export interface OCIRegistryEntityProviderOptions {
  connection: RegistryProviderConfig;
  logger: LoggerService;
  taskRunner?: SchedulerServiceTaskRunner;
  /** Owner applied to emitted entities. */
  owner?: string;
  /** System entities are grouped under. */
  system?: string;
  /**
   * Which content types this provider can recognise.
   *
   * The provider itself knows none: an empty registry discovers artifacts and reports
   * every one as unidentified. Registering types is the composition root's job, which
   * is what makes adding one a matter of installing a package rather than editing this
   * file.
   */
  contentTypes?: ContentTypeRegistry;
  /** Injected transport. Tests drive the provider against a mock registry with it. */
  fetch?: FetchLike;
}

/** What discovery concluded about one artifact. */
interface Identified {
  type: string;
  signals: string[];
  resolution?: Resolution;
}

/**
 * Discovers Ansible content in an OCI registry and emits it as catalog entities.
 *
 * Two things distinguish this from a conventional image lister:
 *
 *  - It reads the *contents* of each execution environment — collections, modules,
 *    plugins, roles, EDA plugins — from a content manifest published alongside the
 *    image, without pulling the image itself.
 *
 *  - It never claims more than it knows. Where no manifest exists the entity is still
 *    emitted, annotated as having unknown contents, because "contains nothing" and
 *    "contents undetermined" are different facts.
 *
 * The provider holds no registry-specific logic: it composes an OCI backend client with
 * a capability profile and degrades according to what the registry actually supports.
 */
export class OCIRegistryEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;
  private capabilities?: BackendCapabilities;
  private readonly client: OCIClient;

  constructor(private readonly options: OCIRegistryEntityProviderOptions) {
    this.client = new OCIClient(options.connection, {
      fetch: options.fetch,
      logger: {
        debug: (msg: string) => options.logger.debug(msg),
        warn: (msg: string) => options.logger.warn(msg),
      },
    });
  }

  getProviderName(): string {
    return `oci-registry-${this.options.connection.name}`;
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    const runner = this.options.taskRunner;
    if (runner) {
      await runner.run({
        id: this.getProviderName(),
        fn: async () => {
          await this.refresh();
        },
      });
    }
  }

  /** Discover everything the registry exposes and replace the catalog's view of it. */
  async refresh(): Promise<{ entities: number; errors: string[] }> {
    if (!this.connection) {
      throw new Error(`${this.getProviderName()} is not connected`);
    }
    const { logger, connection: registry } = this.options;
    const errors: string[] = [];

    if (!this.capabilities) {
      this.capabilities = await new CapabilityProbe(this.client, {
        sampleRepository: registry.repositories?.[0],
        logger: {
          debug: (m: string) => logger.debug(m),
          warn: (m: string) => logger.warn(m),
        },
      }).probe();
      logger.info(
        `[${registry.name}] capabilities: referrers=${this.capabilities.referrers} ` +
          `catalog=${this.capabilities.catalogEnumeration} ` +
          `auth=${this.capabilities.auth.join('/')}`,
      );
    }

    const repositories = await this.resolveRepositories();
    logger.info(
      `[${registry.name}] scanning ${repositories.length} repositor(ies)`,
    );

    const entities: Entity[] = [];
    for (const repository of repositories) {
      try {
        entities.push(...(await this.scanRepository(repository)));
      } catch (error) {
        const message = `${repository}: ${(error as Error).message}`;
        errors.push(message);
        // Per-repository isolation: one bad repository must not abort the batch.
        logger.warn(`[${registry.name}] ${message}`);
      }
    }

    // Deduplicate by canonical entity ref before a `full` mutation. Backstage's
    // provider contract does not define which duplicate wins when one
    // submission carries the same ref twice — reachable, for example, when two
    // tags resolve to the same digest — so collapse them here.
    const seen = new Set<string>();
    const unique = entities.filter(entity => {
      const ref = `${entity.kind}:${entity.metadata.namespace ?? 'default'}/${
        entity.metadata.name
      }`;
      if (seen.has(ref)) return false;
      seen.add(ref);
      return true;
    });
    if (unique.length < entities.length) {
      logger.warn(
        `[${registry.name}] dropped ${entities.length - unique.length} ` +
          `duplicate entity ref(s) before mutation`,
      );
    }

    // A `full` mutation with the default orphan strategy deletes entities for
    // repositories that failed this cycle — a transient 5xx, timeout or 429
    // must not read as "its content is gone". Keep the previous view and let
    // the next successful cycle catch up.
    if (errors.length > 0) {
      logger.warn(
        `[${registry.name}] keeping previous entities: ` +
          `${errors.length} repositor(y/ies) failed this cycle`,
      );
      return { entities: unique.length, errors };
    }

    await this.connection.applyMutation({
      type: 'full',
      entities: unique.map(entity => ({
        entity,
        locationKey: this.getProviderName(),
      })),
    });

    logger.info(`[${registry.name}] emitted ${unique.length} entities`);
    return { entities: unique.length, errors };
  }

  /**
   * Determine which repositories to scan.
   *
   * Registries that disable `_catalog` require an explicit list. That is a
   * configuration consequence of a registry capability, surfaced rather than hidden.
   */
  private async resolveRepositories(): Promise<string[]> {
    const configured = this.options.connection.repositories ?? [];
    if (configured.length > 0) return configured;

    if (!this.capabilities?.catalogEnumeration) {
      this.options.logger.warn(
        `[${this.options.connection.name}] no repositories configured and _catalog is ` +
          `unavailable; nothing to scan`,
      );
      return [];
    }

    const discovered: string[] = [];
    const namespaces = this.options.connection.namespaces;
    for await (const repository of this.client.listRepositories()) {
      if (
        !namespaces?.length ||
        namespaces.some(ns => repository.startsWith(`${ns}/`))
      ) {
        discovered.push(repository);
      }
    }
    return discovered;
  }

  private async scanRepository(repository: string): Promise<Entity[]> {
    const entities: Entity[] = [];
    // Group tags by digest: several tags commonly point at one image, and identity is
    // the digest, not the tag.
    const byDigest = new Map<string, string[]>();

    for await (const tag of this.client.listTags(repository)) {
      // Referrer fallback tags are not images. Registries without the referrers API
      // publish referrer indexes under `sha256-<hex>`, and treating those as execution
      // environments produces phantom entries for artifacts that merely describe a
      // real image.
      if (REFERRER_TAG.test(tag)) continue;

      const head = await this.client.headManifest(repository, tag);
      if (!head.digest) continue;
      byDigest.set(head.digest, [...(byDigest.get(head.digest) ?? []), tag]);
    }

    for (const [digest, tags] of byDigest) {
      const classification = await this.classify(repository, digest);

      // Only an image actually identified as an execution environment gets enumerated.
      // Anything else is still catalogued — honestly, as an unrecognised image — rather
      // than presented as an empty environment.
      const found = declaresContentManifest(classification)
        ? await readContentManifest(this.client, repository, digest).catch(
            () => undefined,
          )
        : undefined;

      entities.push(
        this.toExecutionEnvironment(
          repository,
          digest,
          tags,
          classification,
          found?.manifest,
        ),
      );
      if (found?.manifest) {
        entities.push(
          ...this.toCollections(repository, digest, tags, found.manifest),
        );
      }
    }
    return entities;
  }

  /**
   * Identify an image using signals already fetched during discovery.
   *
   * `ansible-builder` labels every execution environment it produces, so this works on
   * images built long before content manifests existed. The labels live in the config
   * blob, which enumeration reads anyway — classification costs no extra requests.
   */
  private async classify(
    repository: string,
    digest: string,
  ): Promise<Identified> {
    const registry = this.options.contentTypes;

    const { referrers } = await this.client
      .getReferrers(repository, digest)
      .catch(() => ({ referrers: [], via: 'none' as const }));

    let artifact;
    let config;
    try {
      artifact = await this.client.getManifest(repository, digest);
      const descriptor = (artifact.manifest as ImageManifest).config;
      if (descriptor) {
        config = await this.client.getConfigBlob(repository, descriptor);
      }
    } catch (error) {
      this.options.logger.debug(
        `[${this.options.connection.name}] ${repository}@${digest}: ${String(
          error,
        )}`,
      );
    }

    if (!artifact || !registry) {
      return {
        type: UNKNOWN_IMAGE_TYPE,
        signals: ['no content types registered'],
      };
    }

    const meta: MetadataBundle = {
      manifest: artifact.manifest,
      config,
      referrers,
      obtained: ['manifest', 'config', 'referrers'],
    };

    const resolution = registry.resolve(artifact, meta);
    if (resolution) {
      return {
        type: resolution.adapter.type,
        signals: resolution.classification.signals,
        resolution,
      };
    }

    // Nobody claimed it. Still catalogued, with every adapter's reason recorded, so an
    // operator can see why rather than wondering where the image went.
    return {
      type: UNKNOWN_IMAGE_TYPE,
      signals: registry.explain(artifact, meta),
    };
  }

  private entityName(parts: string[]): string {
    // Catalog names allow [A-Za-z0-9] plus - _ . and must be <= 63 chars.
    const raw = parts
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-');
    return raw.length <= 63 ? raw : `${raw.slice(0, 55)}-${hash(raw)}`;
  }

  private toExecutionEnvironment(
    repository: string,
    digest: string,
    tags: string[],
    classification: Identified,
    manifest?: AnsibleContentManifest,
  ): Entity {
    const { connection: registry, owner = 'unknown', system } = this.options;
    const summary = manifest ? summariseManifest(manifest) : undefined;

    const location = `${LOCATION_TYPE}:${registry.name}/${repository}@${digest}`;
    const annotations: Record<string, string> = {
      // Required by the catalog: an entity must declare where it came from. For
      // registry-discovered content the natural location is the immutable content
      // address, not a file path.
      'backstage.io/managed-by-location': location,
      'backstage.io/managed-by-origin-location': location,
      [Annotations.registry]: registry.name,
      [Annotations.repository]: repository,
      [Annotations.digest]: digest,
      [Annotations.tags]: tags.join(','),
      [Annotations.pullReference]: this.client.pullReference({
        registry: registry.name,
        repository,
        reference: digest,
      }),
      [Annotations.lastReconciled]: new Date().toISOString(),
      [Annotations.contentType]: classification.type,
      [Annotations.classification]: classification.signals.join('; '),
      [Annotations.capabilities]: JSON.stringify({
        referrers: this.capabilities?.referrers,
        notifications: this.capabilities?.notifications,
      }),
      // Fidelity is part of the record, not an implementation detail.
      [Annotations.enumerationSource]: manifest
        ? 'build-time-manifest'
        : 'unknown',
    };

    if (manifest?.generatedBy.ansibleCore) {
      annotations[Annotations.ansibleCore] = manifest.generatedBy.ansibleCore;
    }
    if (summary) {
      annotations[Annotations.contentCounts] = JSON.stringify(summary);
    }

    const isEE = declaresContentManifest(classification);
    let description: string;
    if (summary) {
      description =
        `Execution environment with ${summary.collections} collections, ` +
        `${summary.plugins} plugins, ${summary.edaPlugins} EDA plugins ` +
        `(ansible-core ${manifest?.generatedBy.ansibleCore ?? 'unknown'})`;
    } else if (isEE) {
      description =
        'Execution environment — contents could not be determined ' +
        '(no content manifest published)';
    } else {
      description =
        `OCI image, not recognised as an execution environment — ` +
        `${classification.signals.join('; ')}`;
    }

    // The EE name is also the scope for its collection entities: two
    // environments shipping the same collection version are distinct facts,
    // and an unscoped name would collide (see toCollections).
    const eeName = this.entityName([
      registry.name,
      repository,
      digest.slice(7, 19),
    ]);

    return {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: eeName,
        title: `${repository}:${tags[0] ?? digest.slice(7, 19)}`,
        description,
        annotations,
        tags: [classification.type, ...(summary ? [] : ['contents-unknown'])],
        links: [
          {
            url: registryLinkUrl(registry.url, repository),
            title: 'Registry',
          },
        ],
      },
      spec: {
        type: classification.type,
        lifecycle: 'production',
        owner,
        ...(system ? { system } : {}),
        dependsOn: manifest
          ? manifest.collections.map(
              c =>
                `component:default/${this.entityName([
                  'collection',
                  eeName,
                  c.namespace,
                  c.name,
                  c.version,
                ])}`,
            )
          : [],
      },
    };
  }

  /**
   * Emit each contained collection as its own entity.
   *
   * Collections are Level A artifacts in their own right — independently versioned and
   * distributable — so they are entities, related to the EE that ships them. The Level
   * B items inside them (modules, plugins, roles) are carried as annotations rather
   * than entities, because they have no independent lifecycle.
   */
  private toCollections(
    repository: string,
    digest: string,
    _tags: string[],
    manifest: AnsibleContentManifest,
  ): Entity[] {
    const { connection: registry, owner = 'unknown', system } = this.options;
    const eeName = this.entityName([
      registry.name,
      repository,
      digest.slice(7, 19),
    ]);

    return manifest.collections.map(collection => {
      const counts = {
        plugins: collection.plugins.length,
        roles: collection.roles.length,
        playbooks: collection.playbooks.length,
        edaPlugins: collection.edaPlugins.length,
        rulebooks: collection.rulebooks.length,
      };
      const byType: Record<string, number> = {};
      for (const plugin of collection.plugins) {
        byType[plugin.type] = (byType[plugin.type] ?? 0) + 1;
      }
      const collectionLocation =
        `${LOCATION_TYPE}:${registry.name}/${repository}@${digest}` +
        `#${collection.namespace}.${collection.name}`;

      return {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          // Scoped by the owning EE so two environments shipping the same
          // collection version do not collide on one entity ref.
          name: this.entityName([
            'collection',
            eeName,
            collection.namespace,
            collection.name,
            collection.version,
          ]),
          title: `${collection.namespace}.${collection.name} ${collection.version}`,
          description:
            collection.description ??
            `Ansible collection with ${counts.plugins} plugins${
              counts.edaPlugins ? `, ${counts.edaPlugins} EDA plugins` : ''
            }`,
          annotations: {
            'backstage.io/managed-by-location': collectionLocation,
            'backstage.io/managed-by-origin-location': collectionLocation,
            [`${ANNOTATION_PREFIX}/collection`]: `${collection.namespace}.${collection.name}`,
            [`${ANNOTATION_PREFIX}/version`]: collection.version,
            [`${ANNOTATION_PREFIX}/content-counts`]: JSON.stringify(counts),
            [`${ANNOTATION_PREFIX}/plugins-by-type`]: JSON.stringify(byType),
            [Annotations.enumerationSource]:
              manifest.generatedBy.docsSource ?? 'unknown',
            ...(manifest.generatedBy.ansibleCore
              ? { [Annotations.ansibleCore]: manifest.generatedBy.ansibleCore }
              : {}),
          },
          tags: [
            'ansible-collection',
            ...(counts.edaPlugins ? ['eda'] : []),
            ...(counts.rulebooks ? ['rulebooks'] : []),
          ],
          ...(collection.repository
            ? { links: [{ url: collection.repository, title: 'Source' }] }
            : {}),
        },
        spec: {
          type: 'ansible-collection',
          lifecycle: 'production',
          owner,
          ...(system ? { system } : {}),
          partOf: [`component:default/${eeName}`],
        },
      } as Entity;
    });
  }
}

/** Short stable suffix for names that exceed the catalog's length limit. */
function hash(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 7);
}
