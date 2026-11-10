import { unknownEnumeration } from '@ansible/content-model';
import type { ContentObject, Enumeration } from '@ansible/content-model';
import type {
  Classification,
  ContentTypeAdapter,
  MetadataBundle,
  ResolvedArtifact,
  UpdatePolicy,
} from '@ansible/automation-content-common';

/** The content type this adapter owns. */
export const COLLECTION_TYPE = 'collection';

/**
 * Label marking an OCI artifact as a bundled Ansible collection.
 *
 * Follows the `ansible-execution-environment` convention ansible-builder
 * established: a flat `ansible-<kind>` label on the config blob, readable from
 * the metadata discovery has already fetched, so identification costs no extra
 * registry requests.
 */
export const COLLECTION_LABEL = 'ansible-collection';

/** Metadata schema version this adapter reports when it has nothing better. */
const SCHEMA_VERSION = '1.0.0';

/**
 * Re-read a collection only when its digest changes. A digest names the bytes,
 * so identical bytes cannot have different contents.
 */
const digestCompare: UpdatePolicy = {
  kind: 'digest-compare',
  shouldUpdate(previous, current) {
    return previous?.identity.digest !== current.digest;
  },
};

/**
 * The collection content type: an Ansible collection bundled as an OCI artifact.
 *
 * Knows what a collection *is* and nothing about where it came from — it reads a
 * `MetadataBundle` that discovery already fetched, and reaches a registry only
 * through the `BackendAdapter` handed to `enumerate`.
 */
export class CollectionAdapter implements ContentTypeAdapter {
  readonly type = COLLECTION_TYPE;

  readonly schema = {
    $id: 'https://ansible.com/schemas/collection',
    version: SCHEMA_VERSION,
  };

  /** No established media or artifact type claims a collection bundle yet. */
  readonly mediaTypes: string[] = [];

  readonly updatePolicy = digestCompare;

  identify(_ref: ResolvedArtifact, meta: MetadataBundle): Classification {
    const labels = meta.config?.config?.Labels ?? {};

    if (labels[COLLECTION_LABEL] === 'true') {
      return {
        confidence: 'certain',
        signals: [`label ${COLLECTION_LABEL}=true`],
      };
    }

    return {
      confidence: 'no',
      signals: [`no ${COLLECTION_LABEL} label`],
    };
  }

  /**
   * Build the universal content object. Every trust field starts at its weakest
   * honest value: a discovered artifact is not signed, verified, certified or
   * supported, and a default that flattered it would become a trust signal
   * nobody ever earned.
   */
  async normalize(
    ref: ResolvedArtifact,
    _meta: MetadataBundle,
  ): Promise<ContentObject> {
    const slash = ref.repository.indexOf('/');

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
    };
  }

  /**
   * A standalone collection's contents — the plugins, roles and playbooks inside
   * it — are not enumerated from the artifact yet. Returning `unknown` rather
   * than an empty list keeps "contents undetermined" distinct from "contains
   * nothing"; a collection with no published inventory is the first, not the
   * second.
   */
  async enumerate(
    _ref: ResolvedArtifact,
    _ctx: Parameters<ContentTypeAdapter['enumerate']>[1],
  ): Promise<Enumeration> {
    return unknownEnumeration(
      SCHEMA_VERSION,
      'collection contents are not enumerated from the artifact yet',
    );
  }
}
