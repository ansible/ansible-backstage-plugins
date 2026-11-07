import type {
  MetadataBundle,
  ResolvedArtifact,
} from '@ansible/automation-content-common';
import { COLLECTION_LABEL, CollectionAdapter } from './CollectionAdapter';

const adapter = new CollectionAdapter();

const ref = {
  registry: 'mock',
  repository: 'demo/collections/ansible-utils',
  reference: '6.1.0',
  digest: `sha256:${'cd'.repeat(32)}`,
  mediaType: 'application/vnd.oci.image.manifest.v1+json',
  manifest: { schemaVersion: 2 },
} as ResolvedArtifact;

const meta = (over: Partial<MetadataBundle> = {}): MetadataBundle => ({
  manifest: { schemaVersion: 2 } as any,
  obtained: ['manifest'],
  ...over,
});

const labelled = (labels: Record<string, string>) =>
  meta({ config: { config: { Labels: labels } } as any });

describe('identify', () => {
  it('recognises the collection label', () => {
    const result = adapter.identify(
      ref,
      labelled({ [COLLECTION_LABEL]: 'true' }),
    );
    expect(result.confidence).toBe('certain');
    expect(result.signals).toContain(`label ${COLLECTION_LABEL}=true`);
  });

  it('declines an ordinary image, and says why', () => {
    const result = adapter.identify(ref, labelled({ maintainer: 'someone' }));
    expect(result.confidence).toBe('no');
    // The reason matters as much as the verdict: an operator staring at a
    // registry needs to know what was missing, not merely that something was.
    expect(result.signals.join(' ')).toContain(COLLECTION_LABEL);
  });

  it('does not claim an execution environment', () => {
    expect(
      adapter.identify(
        ref,
        labelled({ 'ansible-execution-environment': 'true' }),
      ).confidence,
    ).toBe('no');
  });

  it('costs no extra requests', () => {
    // Everything identify reads is already in the bundle discovery fetched.
    const bundle = labelled({ [COLLECTION_LABEL]: 'true' });
    expect(bundle.obtained).toEqual(['manifest']);
    expect(adapter.identify(ref, bundle).confidence).toBe('certain');
  });
});

describe('normalize', () => {
  it('builds a content object typed as a collection', async () => {
    const object = await adapter.normalize(ref, labelled({}));
    expect(object.identity.type).toBe('collection');
    expect(object.identity.namespace).toBe('demo');
    expect(object.identity.name).toBe('collections/ansible-utils');
    expect(object.version.tags).toEqual(['6.1.0']);
    // Trust starts at its weakest honest value, never flatters the artifact.
    expect(object.trust.signing).toEqual({ signed: false, verified: false });
  });
});

describe('enumerate', () => {
  it('returns unknown, never empty, when the contents are not enumerated', async () => {
    // "Contains nothing" and "contents could not be determined" are different
    // facts; a collection without a published inventory is the second.
    const result = await adapter.enumerate(ref, {
      backend: {} as any,
      capabilities: {} as any,
    });
    expect(result.status).toBe('unknown');
    expect(result.collections).toBeUndefined();
  });
});
