import { CONTENT_MANIFEST_ARTIFACT_TYPE } from '@ansible/content-model';
import type {
  MetadataBundle,
  ResolvedArtifact,
} from '@ansible/automation-content-common';
import {
  CONTENT_MANIFEST_LABEL,
  EE_LABEL,
  ExecutionEnvironmentAdapter,
} from './ExecutionEnvironmentAdapter';

const adapter = new ExecutionEnvironmentAdapter();

const ref = {
  registry: 'mock',
  repository: 'demo/network-ee',
  reference: 'poc',
  digest: `sha256:${'ab'.repeat(32)}`,
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
  it('recognises the label ansible-builder has always emitted', () => {
    // The reason no new convention is needed: this label predates content manifests,
    // so images built years ago still classify correctly.
    const result = adapter.identify(ref, labelled({ [EE_LABEL]: 'true' }));
    expect(result.confidence).toBe('certain');
    expect(result.signals).toContain(`label ${EE_LABEL}=true`);
  });

  it('recognises a content-manifest referrer', () => {
    const result = adapter.identify(
      ref,
      meta({
        referrers: [{ artifactType: CONTENT_MANIFEST_ARTIFACT_TYPE } as any],
      }),
    );
    expect(result.confidence).toBe('certain');
    expect(result.signals).toContain('content-manifest referrer');
  });

  it('recognises the manifest label alone', () => {
    expect(
      adapter.identify(ref, labelled({ [CONTENT_MANIFEST_LABEL]: 'true' }))
        .confidence,
    ).toBe('certain');
  });

  it('declines an ordinary image, and says why', () => {
    const result = adapter.identify(ref, labelled({ maintainer: 'someone' }));
    expect(result.confidence).toBe('no');
    // The reason matters as much as the verdict: an operator staring at a registry
    // needs to know what was missing, not merely that something was.
    expect(result.signals.join(' ')).toContain(EE_LABEL);
  });

  it('costs no extra requests', () => {
    // Everything identify reads is already in the bundle discovery fetched. An adapter
    // that needed its own round trips would make classification cost scale with the
    // number of registered content types.
    const bundle = labelled({ [EE_LABEL]: 'true' });
    expect(bundle.obtained).toEqual(['manifest']);
    expect(adapter.identify(ref, bundle).confidence).toBe('certain');
  });
});

describe('enumerate', () => {
  const backend = (payloads?: Record<string, unknown>, referrers: any[] = []) =>
    ({
      fetchMetadata: async () =>
        meta({
          referrers,
          referrerPayloads: payloads,
          obtained: ['referrers'],
        }),
    }) as any;

  const manifest = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-09-14T00:00:00Z',
    generatedBy: {
      tool: 'ansible-builder-content-manifest',
      version: '1',
      ansibleCore: '2.16.14',
    },
    complete: true,
    collections: [
      {
        namespace: 'ansible',
        name: 'utils',
        version: '6.1.0',
        plugins: [],
        roles: [],
        playbooks: [],
        edaPlugins: [],
        rulebooks: [],
      },
    ],
  };

  it('reads a published manifest through the backend contract', async () => {
    const result = await adapter.enumerate(ref, {
      backend: backend({ 'sha256:x': manifest }),
      capabilities: {} as any,
    });

    expect(result.status).toBe('complete');
    // The fidelity guarantee: generated inside the image by its own ansible-core.
    expect(result.source).toBe('build-time-manifest');
    expect(result.producedBy?.ansibleCore).toBe('2.16.14');
    expect(result.collections?.[0]?.name).toBe('ansible.utils');
  });

  it('prefers a declared referrer but does not require one', async () => {
    // Some registries drop or normalise artifactType, so validation — not the label —
    // is what decides.
    const result = await adapter.enumerate(ref, {
      backend: backend({ 'sha256:undeclared': manifest }),
      capabilities: {} as any,
    });
    expect(result.status).toBe('complete');
  });

  it('returns unknown, never empty, when nothing is published', async () => {
    // "Contains no collections" and "contents could not be determined" are different
    // facts. An image built before manifests existed is the second.
    const result = await adapter.enumerate(ref, {
      backend: backend({}),
      capabilities: {} as any,
    });
    expect(result.status).toBe('unknown');
    expect(result.collections).toBeUndefined();
  });

  it('returns unknown when the backend fails outright', async () => {
    const result = await adapter.enumerate(ref, {
      backend: {
        fetchMetadata: async () => {
          throw new Error('registry down');
        },
      } as any,
      capabilities: {} as any,
    });
    expect(result.status).toBe('unknown');
  });
});
