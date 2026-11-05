import {
  CONTENT_MANIFEST_ARTIFACT_TYPE,
  isContentManifest,
  normaliseContentManifest,
  summariseManifest,
  unknownEnumeration,
} from '@ansible/content-model';
import type {
  AnsibleContentManifest,
  ContentObject,
  Enumeration,
} from '@ansible/content-model';
import type {
  Classification,
  ContentTypeAdapter,
  EnumerationContext,
  MetadataBundle,
  ResolvedArtifact,
  UpdatePolicy,
} from '@ansible/automation-content-common';

/** The content type this adapter owns. */
export const EXECUTION_ENVIRONMENT_TYPE = 'execution-environment';

/**
 * The label `ansible-builder` puts on every execution environment it produces.
 *
 * Emitted unconditionally by its `_prepare_label_steps`, so it is present on images
 * built long before content manifests existed. That makes it the single most useful
 * classification signal in the field, and the reason no new convention is needed.
 */
export const EE_LABEL = 'ansible-execution-environment';

/** Label added when a content manifest was generated at build time. */
export const CONTENT_MANIFEST_LABEL = 'io.ansible.content.manifest';

/** Manifest schema version this adapter reports when it has nothing better. */
const SCHEMA_VERSION = '1.0.0';

/**
 * Re-read an execution environment only when its digest changes.
 *
 * A digest names the bytes, so identical bytes cannot have different contents. Anything
 * keyed on a tag would re-read on every sync and still miss a tag that moved between
 * syncs.
 */
const digestCompare: UpdatePolicy = {
  kind: 'digest-compare',
  shouldUpdate(previous, current) {
    return previous?.identity.digest !== current.digest;
  },
};

/**
 * The execution environment content type.
 *
 * Knows what an execution environment *is* and nothing about where it came from: it
 * reads a `MetadataBundle` that discovery already fetched, and reaches the registry
 * only through the `BackendAdapter` handed to `enumerate`. There is deliberately no
 * reference to OCI, HTTP or any registry vendor below this line — a `backend.id ===
 * 'oci'` check here would collapse the two axes and defeat the design.
 */
export class ExecutionEnvironmentAdapter implements ContentTypeAdapter {
  readonly type = EXECUTION_ENVIRONMENT_TYPE;

  readonly schema = {
    $id: 'https://ansible.com/schemas/execution-environment',
    version: SCHEMA_VERSION,
  };

  readonly mediaTypes = [CONTENT_MANIFEST_ARTIFACT_TYPE];

  readonly updatePolicy = digestCompare;

  /**
   * Signals are ordered by reliability and every one is read from metadata discovery
   * has already fetched — the labels live in the config blob that enumeration reads
   * anyway — so identification costs no extra requests.
   */
  identify(_ref: ResolvedArtifact, meta: MetadataBundle): Classification {
    const labels = meta.config?.config?.Labels ?? {};
    const signals: string[] = [];

    if (
      meta.referrers?.some(
        r => r.artifactType === CONTENT_MANIFEST_ARTIFACT_TYPE,
      )
    ) {
      signals.push('content-manifest referrer');
    }
    if (labels[EE_LABEL] === 'true') {
      signals.push(`label ${EE_LABEL}=true`);
    }
    if (labels[CONTENT_MANIFEST_LABEL] === 'true') {
      signals.push(`label ${CONTENT_MANIFEST_LABEL}=true`);
    }

    if (signals.length > 0) return { confidence: 'certain', signals };

    return {
      confidence: 'no',
      signals: [`no ${EE_LABEL} label and no content-manifest referrer`],
    };
  }

  /**
   * Build the universal content object.
   *
   * Every trust field starts at its weakest honest value. An artifact that has merely
   * been discovered is not signed, not verified, not certified and not supported, and
   * saying so explicitly is the point — a default that flattered the artifact would
   * become a trust signal nobody ever earned.
   */
  async normalize(
    ref: ResolvedArtifact,
    meta: MetadataBundle,
  ): Promise<ContentObject> {
    const slash = ref.repository.indexOf('/');
    const labels = meta.config?.config?.Labels ?? {};

    return {
      identity: {
        type: this.type,
        namespace: slash > 0 ? ref.repository.slice(0, slash) : '',
        name: slash > 0 ? ref.repository.slice(slash + 1) : ref.repository,
        digest: ref.digest,
      },
      version: {
        // The digest is the identity; a tag is display only, because it can move.
        value: ref.digest,
        scheme: 'oci-tag',
        tags:
          ref.reference && ref.reference !== ref.digest
            ? [ref.reference]
            : undefined,
      },
      source: {
        uri: `${ref.registry}/${ref.repository}@${ref.digest}`,
        backendId: 'oci',
        discoveredAt: new Date().toISOString(),
      },
      lifecycle: { state: 'discovered', visibility: 'internal' },
      trust: {
        certificationTier: 'community',
        provenance: { steps: [], complete: false },
        signing: { signed: false, verified: false },
        supportBoundary: { supported: false },
      },
      relationships: [],
      enumeration: unknownEnumeration(SCHEMA_VERSION, 'not yet enumerated'),
      extensions: {
        ansibleCore: labels['io.ansible.content.ansible_core'],
      },
    };
  }

  /**
   * Level 1 of the enumeration ladder: the build-time content manifest.
   *
   * Reaches the registry only through the backend contract — `fetchMetadata` with
   * hints — so this works unchanged against any backend that can carry a referring
   * document. Unwrapping the layer is the backend's job; recognising the decoded
   * payload as an Ansible manifest is this adapter's.
   *
   * Returns an `unknown` enumeration rather than an empty one when nothing is
   * published. "Contains no collections" and "contents could not be determined" are
   * different facts, and an image built before manifests existed is the second.
   */
  async enumerate(
    ref: ResolvedArtifact,
    ctx: EnumerationContext,
  ): Promise<Enumeration> {
    const meta = await ctx.backend
      .fetchMetadata(ref, ['referrers', 'referrer-payloads'])
      .catch(() => undefined);

    const payloads = meta?.referrerPayloads ?? {};
    // Prefer a referrer that declares the Ansible artifact type, but do not require
    // it: some registries drop or normalise `artifactType`, so an undeclared referrer
    // may still be the manifest. Validation, not the label, is what decides.
    const declared = (meta?.referrers ?? [])
      .filter(
        descriptor =>
          descriptor.artifactType === CONTENT_MANIFEST_ARTIFACT_TYPE,
      )
      .map(descriptor => descriptor.digest);
    const order = [
      ...declared,
      ...Object.keys(payloads).filter(d => !declared.includes(d)),
    ];

    for (const digest of order) {
      const payload = payloads[digest];
      if (isContentManifest(payload))
        return toEnumeration(normaliseContentManifest(payload));
    }

    return unknownEnumeration(
      SCHEMA_VERSION,
      'no content manifest published alongside this artifact',
    );
  }
}

/** Convert a build-time manifest into the universal enumeration shape. */
export function toEnumeration(manifest: AnsibleContentManifest): Enumeration {
  const summary = summariseManifest(manifest);
  return {
    status: manifest.complete ? 'complete' : 'partial',
    // The fidelity guarantee: generated inside the image by its own ansible-core.
    source: 'build-time-manifest',
    producedBy: {
      tool: manifest.generatedBy.tool,
      ansibleCore: manifest.generatedBy.ansibleCore,
    },
    extractedAt: manifest.generatedAt,
    schemaVersion: manifest.schemaVersion,
    collections: manifest.collections.map(collection => ({
      type: 'collection',
      name: `${collection.namespace}.${collection.name}`,
      version: collection.version,
    })),
    diagnostics:
      summary.collections === 0
        ? ['manifest published but lists no collections']
        : undefined,
  } as Enumeration;
}
