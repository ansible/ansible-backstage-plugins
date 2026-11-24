/**
 * The universal Ansible automation content object.
 *
 * There are two levels of granularity in Ansible content, and conflating them is the
 * most common modelling error in this domain:
 *
 *   Level A — the distributable artifact. A collection, an execution environment, a
 *             skill. You push, pull, tag, sign, govern and promote these. That is
 *             `ContentObject`.
 *
 *   Level B — the content items inside an artifact. Modules, plugins, roles, playbooks,
 *             rulebooks. You document, search and reference these. They have no
 *             independent lifecycle — you cannot promote a module without promoting the
 *             collection that ships it. That is `Enumeration`.
 *
 * Trust and governance attach at Level A only. Discovery operates at both.
 */

/** Where an artifact sits in its governance lifecycle. Deliberately not a storage location. */
export type LifecycleState =
  | 'discovered'
  | 'staged'
  | 'pending-approval'
  | 'approved'
  | 'published'
  | 'deprecated'
  | 'rejected';

export type Visibility = 'private' | 'internal' | 'public';

/**
 * Certification tiers, strongest first. `dependencyHealth.effectiveTier` is the weakest
 * tier among an artifact's dependencies — trust is inherited downward, never upward.
 */
export type CertificationTier =
  | 'certified'
  | 'validated'
  | 'org-managed'
  | 'community';

export interface PublisherRef {
  id: string;
  displayName: string;
  verified: boolean;
}

export interface ProvenanceStep {
  actor: string;
  action: string;
  at: string;
  /** Free-form evidence: build id, pipeline URL, attestation digest. */
  evidence?: Record<string, string>;
}

export interface ProvenanceChain {
  steps: ProvenanceStep[];
  /** True only when every step carries verifiable evidence. */
  complete: boolean;
}

export interface CveSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  scannedAt: string;
  scanner: string;
}

export interface SbomRef {
  format: 'spdx' | 'cyclonedx';
  uri: string;
  digest?: string;
}

export interface TestSummary {
  passed: number;
  failed: number;
  skipped: number;
  ranAt: string;
  suite?: string;
}

export interface SupportBoundary {
  supported: boolean;
  /** e.g. "Red Hat", "Partner", "Community", "Organization". */
  supportedBy?: string;
  /** Human-readable scope or caveats shown at content selection time. */
  scope?: string;
}

export interface PolicyState {
  /** Policies evaluated against this artifact, and their outcome. */
  evaluated: Array<{
    policyId: string;
    result: 'pass' | 'fail' | 'waived';
    at: string;
  }>;
  /** Whether org policy currently permits use. */
  permitted: boolean;
}

export interface SigningState {
  signed: boolean;
  verified: boolean;
  /** Which SigningProvider produced the verdict. Absent when unverified. */
  providerId?: string;
  algorithm?: string;
  keyId?: string;
  verifiedAt?: string;
}

/**
 * Machine-readable trust and fitness signals.
 *
 * Every field is computed at ingest or during certification enrichment and then STORED.
 * Consumption surfaces read these; they never recompute them. A UI that derives
 * "is this trusted?" from raw data has broken the contract.
 */
export interface TrustAttributes {
  certificationTier: CertificationTier;
  verifiedPublisher?: PublisherRef;
  provenance: ProvenanceChain;
  signing: SigningState;
  securityPosture?: { cveScan?: CveSummary; sbom?: SbomRef };
  behavioralTesting?: TestSummary;
  /** Trust inherited from dependencies — the weakest link governs. */
  dependencyHealth?: {
    effectiveTier: CertificationTier;
    weakestLink?: ContentRef;
  };
  supportBoundary: SupportBoundary;
  policy?: PolicyState;
}

export interface ContentRef {
  type: string;
  namespace: string;
  name: string;
  version?: string;
  digest?: string;
}

export type RelationType =
  | 'contains'
  | 'contained-by'
  | 'depends-on'
  | 'depended-on-by'
  | 'built-from'
  | 'supersedes';

export interface ContentRelation {
  type: RelationType;
  target: ContentRef;
}

// ---------------------------------------------------------------------------
// Level B — content items inside an artifact
// ---------------------------------------------------------------------------

/**
 * How an enumeration was obtained. This is not bookkeeping: fidelity varies by source.
 *
 * An execution environment contains a specific ansible-core, and its collections are
 * authored against that version. Extracting documentation from outside the image, using
 * a different core, can produce subtly wrong results — different plugin loading,
 * argument-spec handling and doc-fragment resolution. Build-time extraction is correct
 * by construction; everything else is an approximation whose fidelity decays with
 * version skew.
 */
export type EnumerationSource =
  | 'build-time-manifest'
  | 'labels'
  | 'blob-fetch'
  | 'external-introspection';

export interface EnumerationProvenance {
  tool: string;
  version: string;
  /** The ansible-core that performed extraction. Absent implies reduced fidelity. */
  ansibleCore?: string;
}

export interface DocOption {
  name: string;
  type?: string;
  required?: boolean;
  default?: unknown;
  choices?: unknown[];
  description?: string[];
}

/** Tier 1 — modules and the 14 plugin types. */
export interface PluginDoc {
  name: string;
  /** 'module' | 'filter' | 'lookup' | 'callback' | 'connection' | ... */
  pluginType: string;
  shortDescription?: string;
  description?: string[];
  options?: DocOption[];
  examples?: string;
  deprecated?: boolean;
}

/** Tiers 2-3 — roles, with or without argument_specs.yml. */
export interface RoleDoc {
  name: string;
  entryPoints: Array<{
    name: string;
    shortDescription?: string;
    options?: DocOption[];
  }>;
  /** True when derived by inference rather than a declared argument_specs.yml. */
  inferred: boolean;
}

/** Tier 4 — playbooks in collections. No documentation convention is standardised yet. */
export interface PlaybookDoc {
  name: string;
  description?: string;
  requiredVars?: DocOption[];
  optionalVars?: DocOption[];
  /** Which convention this was read from, while the standard is unsettled. */
  conventionUsed?: 'header-comment' | 'playbook-specs' | 'inline-keys';
}

/** Tier 5 — EDA rulebooks. May yet be ruled out of scope for shared tooling. */
export interface RulebookDoc {
  name: string;
  description?: string;
  sources?: string[];
  rules?: Array<{ name: string; condition?: string; actions?: string[] }>;
}

/**
 * The contents of an artifact.
 *
 * `status: 'unknown'` is a first-class, expected state — not an error. Legacy execution
 * environments carry no content manifest, and the UI must distinguish "contains no
 * collections" from "contents could not be determined".
 */
export interface Enumeration {
  status: 'complete' | 'partial' | 'unknown';
  source: EnumerationSource;
  producedBy?: EnumerationProvenance;
  extractedAt?: string;
  /** Tiers 4 and 5 are unresolved upstream, so the schema must be versioned. */
  schemaVersion: string;
  collections?: ContentRef[];
  plugins?: PluginDoc[];
  roles?: RoleDoc[];
  playbooks?: PlaybookDoc[];
  rulebooks?: RulebookDoc[];
  /** Why enumeration is partial or unknown, for honest display. */
  diagnostics?: string[];
}

// ---------------------------------------------------------------------------
// Level A — the distributable artifact
// ---------------------------------------------------------------------------

export interface ContentIdentity {
  /** 'execution-environment' | 'collection' | 'skill' | ... */
  type: string;
  namespace: string;
  name: string;
  /**
   * Immutable content address. Governance state is keyed on this, never on a tag —
   * a tag is a mutable pointer, and keying approval to one would silently transfer
   * that approval to whatever content the tag is later moved to.
   */
  digest: string;
}

export interface ContentVersion {
  value: string;
  scheme: 'semver' | 'oci-tag' | 'opaque';
  /** Mutable tags currently pointing at this digest. Display only. */
  tags?: string[];
}

export interface ContentSource {
  /** Where it was found. Not necessarily where it is served from. */
  uri: string;
  backendId: string;
  discoveredAt: string;
  /** Last successful reconcile against the authoritative backend. */
  lastReconciledAt?: string;
}

export interface ContentLifecycle {
  state: LifecycleState;
  visibility: Visibility;
  promotedAt?: string;
  promotedBy?: string;
  labels?: Record<string, string>;
}

export interface ContentObject {
  identity: ContentIdentity;
  version: ContentVersion;
  source: ContentSource;
  /** Portal-owned, digest-keyed. The only mutable region after ingest. */
  lifecycle: ContentLifecycle;
  trust: TrustAttributes;
  relationships: ContentRelation[];
  enumeration: Enumeration;
  /** Extension points, so a new content type needs no schema change. */
  extensions?: Record<string, unknown>;
}

/** Stable string form of an identity, for keys and lookups. */
export function contentKey(identity: ContentIdentity): string {
  return `${identity.type}:${identity.namespace}/${identity.name}@${identity.digest}`;
}

/** An enumeration that could not be determined. Use instead of throwing or faking. */
export function unknownEnumeration(
  schemaVersion: string,
  ...diagnostics: string[]
): Enumeration {
  return {
    status: 'unknown',
    source: 'external-introspection',
    schemaVersion,
    diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
  };
}

/**
 * Whether an enumeration should be presented as authoritative.
 *
 * Only build-time extraction is exact; anything derived externally is an approximation
 * and must be surfaced as such rather than silently displayed as fact.
 */
export function isAuthoritative(enumeration: Enumeration): boolean {
  return (
    enumeration.status === 'complete' &&
    (enumeration.source === 'build-time-manifest' ||
      enumeration.source === 'labels') &&
    enumeration.producedBy?.ansibleCore !== undefined
  );
}
