import {
  ArtifactRef,
  BackendCapabilities,
  MetadataBundle,
  RegistryConnection,
  ResolvedArtifact,
} from '../oci/types';

export interface ListScope {
  /** Namespaces or path prefixes to enumerate. */
  namespaces?: string[];
  /** Explicit repositories, required when the backend cannot enumerate. */
  repositories?: string[];
}

export interface PageOpts {
  pageSize?: number;
}

export type MetadataHint =
  | 'manifest'
  | 'config'
  | 'referrers'
  | 'referrer-payloads';

export interface ChangeEvent {
  type: 'pushed' | 'deleted' | 'tagged' | 'untagged';
  repository: string;
  reference?: string;
  digest?: string;
  at: string;
}

export interface Disposable {
  dispose(): void;
}

/**
 * The storage axis.
 *
 * A backend adapter knows how to list, resolve, fetch metadata for, and watch content in
 * one kind of storage system — an OCI registry, an SCM, a filesystem, a Galaxy API. It
 * knows nothing about what the bytes mean. If an implementation ever needs to know what
 * a collection is, the boundary has been violated and the logic belongs in a
 * ContentTypeAdapter instead.
 *
 * Optional methods are the degradation mechanism. A read-only Git backend simply omits
 * `store`, and the framework hides publish affordances rather than failing at runtime.
 */
export interface BackendAdapter {
  /** Stable id: 'oci' | 'scm' | 'filesystem' | 'galaxy'. */
  readonly id: string;

  /** Discover what this connection can actually do. Never assume. */
  probe(connection: RegistryConnection): Promise<BackendCapabilities>;

  /** Enumerate candidate artifacts. Streamed — registries can be very large. */
  list(scope: ListScope, opts?: PageOpts): AsyncIterable<ArtifactRef>;

  /** Resolve a possibly-mutable reference to immutable identity. */
  resolve(ref: ArtifactRef): Promise<ResolvedArtifact>;

  /**
   * Retrieve raw metadata documents for a content-type adapter to interpret.
   * The adapter requests what it wants via hints; the backend supplies what it can.
   */
  fetchMetadata(
    ref: ResolvedArtifact,
    hints: MetadataHint[],
  ): Promise<MetadataBundle>;

  /** Publish. Absent when the backend is read-only. */
  store?(ref: ArtifactRef, payload: unknown): Promise<ResolvedArtifact>;

  /** Retag. Absent when unsupported. */
  tag?(ref: ResolvedArtifact, tag: string): Promise<void>;

  /** Absent when the backend or its configuration disallows deletion. */
  delete?(ref: ResolvedArtifact): Promise<void>;

  /**
   * Drift detection. Webhooks where available, digest polling otherwise. The registry
   * is authoritative for manifest and tag state; the catalog is a cache that must know
   * when it is stale.
   */
  watch?(scope: ListScope, onChange: (event: ChangeEvent) => void): Disposable;
}
