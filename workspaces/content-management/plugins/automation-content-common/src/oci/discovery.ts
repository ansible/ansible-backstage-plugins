import { Descriptor, MediaTypes, SigningEvidence } from './types';

const COSIGN_ARTIFACT = 'application/vnd.dev.cosign.artifact.sig.v1+json';
const COSIGN_LAYER = 'application/vnd.dev.cosign.simplesigning.v1+json';
const COSIGN_SIGNATURE = 'dev.cosignproject.cosign/signature';
const SIGSTORE_BUNDLE = 'application/vnd.dev.sigstore.bundle';
const OCI_TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const REPOSITORY_PART = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isOciDigest(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^([a-z0-9]+(?:[+._-][a-z0-9]+)*):([A-Za-z0-9=_-]+)$/.exec(
    value,
  );
  if (!match) return false;
  const [, algorithm, encoded] = match;
  if (algorithm === 'sha256') return /^[0-9a-f]{64}$/.test(encoded);
  if (algorithm === 'sha512') return /^[0-9a-f]{128}$/.test(encoded);
  return true;
}

export function readInventoryNames(
  value: unknown,
  field: 'repositories' | 'tags',
  repository?: string,
): string[] | undefined {
  if (!isRecord(value)) return undefined;
  if (field === 'tags' && value.name !== repository) return undefined;
  const names = value[field];
  // Some Distribution-compatible registries encode an empty tag array as null.
  if (field === 'tags' && names === null) return [];
  if (!Array.isArray(names)) return undefined;
  const valid = names.every(
    name =>
      typeof name === 'string' &&
      (field === 'tags'
        ? OCI_TAG.test(name)
        : name.split('/').every(part => REPOSITORY_PART.test(part))),
  );
  return valid ? names : undefined;
}

function isDescriptor(value: unknown): value is Descriptor {
  return (
    isRecord(value) &&
    typeof value.mediaType === 'string' &&
    value.mediaType.length > 0 &&
    isOciDigest(value.digest) &&
    typeof value.size === 'number' &&
    Number.isSafeInteger(value.size) &&
    value.size >= 0 &&
    (value.artifactType === undefined || typeof value.artifactType === 'string')
  );
}

export function readReferrerIndex(value: unknown): Descriptor[] | undefined {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    (value.mediaType !== undefined &&
      value.mediaType !== MediaTypes.ociIndex) ||
    !Array.isArray(value.manifests) ||
    !value.manifests.every(isDescriptor)
  ) {
    return undefined;
  }
  return value.manifests;
}

export function referrerSigningOutcome(
  referrers: Descriptor[],
): SigningEvidence['outcome'] {
  const mediaTypes = referrers.flatMap(descriptor => [
    descriptor.mediaType,
    descriptor.artifactType ?? '',
  ]);
  if (
    mediaTypes.some(type => type === COSIGN_ARTIFACT || type === COSIGN_LAYER)
  ) {
    return 'found';
  }
  return mediaTypes.some(type => type.startsWith(SIGSTORE_BUNDLE))
    ? 'ambiguous'
    : 'absent';
}

export function taggedSignatureOutcome(
  value: unknown,
): SigningEvidence['outcome'] {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    !Array.isArray(value.layers) ||
    !value.layers.every(isDescriptor)
  ) {
    return 'failed';
  }
  const hasSignature = value.layers.some(layer => {
    const signature = layer.annotations?.[COSIGN_SIGNATURE];
    return (
      layer.mediaType === COSIGN_LAYER &&
      typeof signature === 'string' &&
      signature.trim().length > 0
    );
  });
  return hasSignature ? 'found' : 'ambiguous';
}
