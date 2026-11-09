/** @jest-environment node */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MINIMAL_CAPABILITIES,
  ARCHIVE_BYTE_LIMIT,
} from '@ansible/automation-content-common';
import type {
  BackendAdapter,
  EnumerationContext,
  ResolvedArtifact,
} from '@ansible/automation-content-common';
import manifest from './fixtures/oci-manifest.json';
import { AnsibleCollectionAdapter } from './AnsibleCollectionAdapter';

const adapter = new AnsibleCollectionAdapter();
const ref: ResolvedArtifact = {
  registry: 'mock',
  repository: 'arbitrary/repository',
  reference: 'latest',
  digest: `sha256:${'b'.repeat(64)}`,
  mediaType: manifest.mediaType,
  manifest,
};
const blob = readFileSync(join(__dirname, 'fixtures/layer.tar.gz'));
function context(payload: Buffer | undefined = blob): EnumerationContext {
  return {
    capabilities: MINIMAL_CAPABILITIES,
    backend: {
      fetchBlob: jest.fn().mockResolvedValue(payload),
    } as unknown as BackendAdapter,
  };
}

it('identifies the real fixture by artifactType without config labels', () => {
  expect(
    adapter.identify(ref, { manifest, obtained: ['manifest'] }).confidence,
  ).toBe('certain');
  const old = {
    ...ref,
    repository: 'demo/collections/ansible-utils',
    manifest: { ...manifest, artifactType: undefined },
  };
  expect(
    adapter.identify(old, { manifest: old.manifest, obtained: ['manifest'] })
      .confidence,
  ).toBe('no');
});

it('enumerates collection_info and retains authors, tags, dependencies and links', async () => {
  const result = await adapter.enumerate(ref, context());
  expect(result.status).toBe('complete');
  expect(result.items).toEqual([
    expect.objectContaining({
      fqcn: 'utopia.network',
      type: 'collection',
      version: '1.0.0',
      detail: expect.objectContaining({
        authors: ['Utopia'],
        tags: ['network'],
        dependencies: { 'ansible.utils': '>=1.0.0' },
        documentation: 'https://example.org/docs',
      }),
    }),
  ]);
});

it('reports a missing MANIFEST.json honestly', async () => {
  const result = await adapter.enumerate(
    ref,
    context(readFileSync(join(__dirname, 'fixtures/missing-manifest.tar.gz'))),
  );
  expect(result).toMatchObject({
    status: 'unknown',
    diagnostics: [expect.stringContaining('MANIFEST.json')],
  });
  expect(result.items).toBeUndefined();
});

it('rejects oversized layers and corrupt archives without losing the artifact', async () => {
  const large = {
    ...ref,
    manifest: {
      ...manifest,
      layers: [{ ...manifest.layers[0], size: ARCHIVE_BYTE_LIMIT + 1 }],
    },
  };
  expect((await adapter.enumerate(large, context())).status).toBe('partial');
  expect(
    (await adapter.enumerate(ref, context(Buffer.from('corrupt gzip')))).status,
  ).toBe('unknown');
  const ctx = context();
  ctx.backend.fetchBlob = async () => {
    throw new Error('network unavailable');
  };
  expect((await adapter.enumerate(ref, ctx)).status).toBe('unknown');
});

it.each([
  '{}',
  'null',
  '{"collection_info":[]}',
  '{"collection_info":{"namespace":"utopia"}}',
  'broken',
])('rejects invalid manifests: %s', text => {
  expect(() => adapter.parse(text)).toThrow();
});
