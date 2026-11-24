import { CapabilityProbe } from '../oci/CapabilityProbe';
import { OCIClient } from '../oci/OCIClient';
import { decodeLayerPayload } from '../oci/contentManifestReader';
import type {
  ArtifactRef,
  BackendCapabilities,
  Descriptor,
  ImageManifest,
  MetadataBundle,
  RegistryConnection,
  ResolvedArtifact,
} from '../oci/types';
import type {
  BackendAdapter,
  ListScope,
  MetadataHint,
  PageOpts,
} from './BackendAdapter';

/**
 * The OCI storage axis.
 *
 * Wraps `OCIClient` in the storage-agnostic contract content-type adapters are written
 * against. Everything here is about *retrieval* — listing, resolving, fetching metadata
 * documents and unwrapping the layers they arrive in. Nothing here knows what the bytes
 * mean: there is no mention of execution environments, collections or Ansible below
 * this line, and if one ever appears the boundary has been violated and the logic
 * belongs in a content-type adapter.
 *
 * The one judgement call is layer unwrapping. Gzip and tar are OCI packaging
 * conventions — ORAS's, in fact — so undoing them is a registry concern, and the
 * decoded document is handed on as `unknown` for a content-type adapter to recognise.
 */
export class OCIBackendAdapter implements BackendAdapter {
  readonly id = 'oci';

  constructor(
    private readonly client: OCIClient,
    private readonly connection: RegistryConnection,
  ) {}

  /** Discover what this registry can actually do. Never assume. */
  async probe(_connection: RegistryConnection): Promise<BackendCapabilities> {
    return new CapabilityProbe(this.client).probe();
  }

  /**
   * Enumerate candidate artifacts, streamed.
   *
   * A registry without `_catalog` cannot be walked, so an explicit repository list is
   * the documented degradation rather than a failure — the config shape makes the
   * limitation visible instead of leaving it mysterious at runtime.
   */
  async *list(scope: ListScope, opts?: PageOpts): AsyncIterable<ArtifactRef> {
    const repositories: string[] = [];

    if (scope.repositories?.length) {
      repositories.push(...scope.repositories);
    } else {
      for await (const repository of this.client.listRepositories(
        opts?.pageSize,
      )) {
        const inScope =
          !scope.namespaces?.length ||
          scope.namespaces.some(
            ns => repository === ns || repository.startsWith(`${ns}/`),
          );
        if (inScope) repositories.push(repository);
      }
    }

    for (const repository of repositories) {
      for await (const tag of this.client.listTags(
        repository,
        opts?.pageSize,
      )) {
        yield { registry: this.connection.name, repository, reference: tag };
      }
    }
  }

  /** Resolve a possibly-mutable reference to immutable identity. */
  async resolve(ref: ArtifactRef): Promise<ResolvedArtifact> {
    return this.client.getManifest(ref.repository, ref.reference);
  }

  /**
   * Retrieve raw metadata documents for a content-type adapter to interpret.
   *
   * Hints are requests, not guarantees: `obtained` records what actually came back, so
   * an adapter can tell a missing document from an empty one. A registry that answers
   * none of them still produces a bundle — degradation, not failure.
   */
  async fetchMetadata(
    ref: ResolvedArtifact,
    hints: MetadataHint[],
  ): Promise<MetadataBundle> {
    const wanted = new Set(hints);
    const obtained: MetadataBundle['obtained'] = [];
    const bundle: MetadataBundle = { manifest: ref.manifest, obtained };
    obtained.push('manifest');

    if (wanted.has('config')) {
      const descriptor = (ref.manifest as ImageManifest).config;
      if (descriptor) {
        const config = await this.client
          .getConfigBlob(ref.repository, descriptor)
          .catch(() => undefined);
        if (config) {
          bundle.config = config;
          obtained.push('config');
        }
      }
    }

    if (wanted.has('referrers') || wanted.has('referrer-payloads')) {
      const { referrers } = await this.client
        .getReferrers(ref.repository, ref.digest)
        .catch(() => ({ referrers: [] as Descriptor[], via: 'none' as const }));
      bundle.referrers = referrers;
      obtained.push('referrers');

      if (wanted.has('referrer-payloads') && referrers.length > 0) {
        const payloads: Record<string, unknown> = {};
        for (const descriptor of referrers) {
          const payload = await this.fetchReferrerPayload(
            ref.repository,
            descriptor,
          );
          if (payload !== undefined) payloads[descriptor.digest] = payload;
        }
        if (Object.keys(payloads).length > 0) {
          bundle.referrerPayloads = payloads;
          obtained.push('referrer-payloads');
        }
      }
    }

    return bundle;
  }

  /**
   * Fetch one referrer's first layer and unwrap it.
   *
   * Uses the cached blob read, so an unchanged artifact never re-downloads its payload
   * on a later sync — a blob addressed by digest is immutable, so a hit is permanently
   * valid.
   */
  private async fetchReferrerPayload(
    repository: string,
    descriptor: Descriptor,
  ): Promise<unknown | undefined> {
    const artifact = await this.client
      .getManifest(repository, descriptor.digest)
      .catch(() => undefined);
    if (!artifact) return undefined;

    const layer = (artifact.manifest as ImageManifest).layers?.[0];
    if (!layer) return undefined;

    const blob = await this.client
      .getBlob(repository, layer)
      .catch(() => undefined);
    if (!blob) return undefined;

    return decodeLayerPayload(blob, layer.mediaType);
  }
}
