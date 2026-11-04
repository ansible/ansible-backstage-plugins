/** OCI Distribution Specification v2 types and registry capability modelling. */

export const MediaTypes = {
  ociManifest: 'application/vnd.oci.image.manifest.v1+json',
  ociIndex: 'application/vnd.oci.image.index.v1+json',
  ociConfig: 'application/vnd.oci.image.config.v1+json',
  dockerManifest: 'application/vnd.docker.distribution.manifest.v2+json',
  dockerManifestList:
    'application/vnd.docker.distribution.manifest.list.v2+json',
  dockerConfig: 'application/vnd.docker.container.image.v1+json',
} as const;

/** Accept header covering every manifest form a registry may return. */
export const MANIFEST_ACCEPT = [
  MediaTypes.ociManifest,
  MediaTypes.ociIndex,
  MediaTypes.dockerManifest,
  MediaTypes.dockerManifestList,
].join(', ');

export interface Descriptor {
  mediaType: string;
  digest: string;
  size: number;
  annotations?: Record<string, string>;
  artifactType?: string;
  platform?: Platform;
}

export interface Platform {
  architecture: string;
  os: string;
  'os.version'?: string;
  variant?: string;
}

export interface ImageManifest {
  schemaVersion: number;
  mediaType?: string;
  artifactType?: string;
  config: Descriptor;
  layers: Descriptor[];
  subject?: Descriptor;
  annotations?: Record<string, string>;
}

export interface ImageIndex {
  schemaVersion: number;
  mediaType?: string;
  artifactType?: string;
  manifests: Descriptor[];
  subject?: Descriptor;
  annotations?: Record<string, string>;
}

export type Manifest = ImageManifest | ImageIndex;

export function isIndex(m: Manifest): m is ImageIndex {
  return Array.isArray((m as ImageIndex).manifests);
}

/** The `config` blob of an image — where OCI image labels actually live. */
export interface ImageConfig {
  architecture?: string;
  os?: string;
  config?: {
    Labels?: Record<string, string>;
    Env?: string[];
    Entrypoint?: string[];
    Cmd?: string[];
  };
  history?: Array<{
    created?: string;
    created_by?: string;
    empty_layer?: boolean;
  }>;
  created?: string;
}

export type AuthScheme = 'anonymous' | 'basic' | 'bearer' | 'oauth2';

export interface RegistryAuth {
  type: AuthScheme;
  username?: string;
  password?: string;
  /** Pre-issued bearer token, when not using the token-exchange flow. */
  token?: string;
}

export interface RegistryConnection {
  /** Stable identifier used in config and in content source records. */
  name: string;
  /** Base URL including scheme, e.g. https://quay.io */
  url: string;
  auth: RegistryAuth;
  /** Namespaces to enumerate. Used when the registry supports _catalog. */
  namespaces?: string[];
  /** Explicit repositories. Required when _catalog is unavailable. */
  repositories?: string[];
  /**
   * The explicit, auditable opt-out from transport trust.
   *
   * Omitted or false — the default — means every request goes out over HTTPS with
   * certificate verification: a registry presenting an untrusted, expired or
   * wrong-host certificate fails the connection, and plain HTTP is refused outright.
   *
   * True disables certificate verification and admits plain HTTP for this registry
   * only, and is warned about when the client is created. Local development against
   * a throwaway registry is the intended use.
   */
  insecure?: boolean;
  /**
   * PEM bundle this registry's certificate is verified against, in addition
   * to the process's default root store. Verification stays on: this is how a
   * registry behind a private CA is trusted without resorting to
   * `insecure: true`.
   *
   * Trust is additive, deliberately: a registry behind a private CA can
   * redirect to, or authenticate through, a host whose certificate chains to
   * the process's default roots — a CDN in front of the registry, a separate
   * auth host — and duplicating those roots into every bundle is exactly the
   * trap additive trust avoids. Combining `ca` with `insecure: true` is
   * refused outright.
   */
  ca?: string;
  /**
   * Rewrite the host of a bearer-auth realm to match this connection's host.
   *
   * Registries advertise their token endpoint using their own configured hostname. When
   * that hostname is not reachable from the client — a registry configured as
   * `localhost` but reached from inside a container, for example — the token exchange
   * fails even though the registry itself is reachable.
   *
   * Off by default: redirecting where credentials are sent is security-sensitive and
   * must be a deliberate choice, not a silent fallback.
   */
  rewriteAuthRealmHost?: boolean;
}

/**
 * What a specific registry can actually do.
 *
 * The design may not assume registry features: the requirement is to work against any
 * OCI-compliant registry "without reliance on vendor-specific extensions". So every
 * capability is discovered by probe and every feature gates on the result. Assuming a
 * high floor breaks minimal registries; assuming a low ceiling wastes rich ones.
 */
export interface BackendCapabilities {
  /** OCI 1.1 referrers API: native endpoint, tag-schema fallback, or unavailable. */
  referrers: 'native' | 'tag-fallback' | 'none';
  /** GET /v2/_catalog — many hosted registries disable it. */
  catalogEnumeration: boolean;
  /** Link-header pagination on tag listings. */
  tagPagination: boolean;
  /**
   * Delete support. Not probed: probing is destructive. Declared via config or
   * left 'unknown', and delete affordances stay hidden while unknown.
   */
  delete: 'manifest' | 'tag' | 'none' | 'unknown';
  /** Push events. Absent means drift detection falls back to digest polling. */
  notifications: 'webhook' | 'poll-only';
  /** Auth schemes the registry advertised. */
  auth: AuthScheme[];
  /**
   * Maximum usable reference length, where known. Downstream consumers impose caps —
   * the EDA UI's 150-character limit breaks disconnected mirrors with long paths and
   * sha256 digests.
   */
  maxReferenceLength?: number;
  /** Human-readable notes from probing, surfaced in admin UI. */
  notes: string[];
}

/** Capabilities assumed before probing: the pessimistic floor. */
export const MINIMAL_CAPABILITIES: BackendCapabilities = {
  referrers: 'none',
  catalogEnumeration: false,
  tagPagination: false,
  delete: 'unknown',
  notifications: 'poll-only',
  auth: ['anonymous'],
  notes: [],
};

export interface ArtifactRef {
  registry: string;
  repository: string;
  /** Tag or digest. Mutable if a tag. */
  reference: string;
}

export interface ResolvedArtifact extends ArtifactRef {
  /** Immutable content address — the identity governance keys on. */
  digest: string;
  mediaType: string;
  manifest: Manifest;
  size?: number;
}

/** Raw, unparsed metadata for a content-type adapter to interpret. */
export interface MetadataBundle {
  manifest: Manifest;
  config?: ImageConfig;
  /** Referrer descriptors, when the registry could supply them. */
  referrers?: Descriptor[];
  /** Fetched referrer payloads, keyed by digest. */
  referrerPayloads?: Record<string, unknown>;
  /** Which retrieval steps succeeded, for enumeration provenance. */
  obtained: Array<'manifest' | 'config' | 'referrers' | 'referrer-payloads'>;
}

export class RegistryError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly registry?: string,
  ) {
    super(message);
    this.name = 'RegistryError';
  }
}
