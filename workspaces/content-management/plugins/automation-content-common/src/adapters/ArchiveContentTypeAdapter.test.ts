/** @jest-environment node */
import { readFileSync } from 'fs';
import { join } from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { Header } from 'tar';
import {
  ArchiveContentTypeAdapter,
  ARCHIVE_BYTE_LIMIT,
  ARCHIVE_LAYER_MEDIA_TYPE,
  readArchiveFile,
} from './ArchiveContentTypeAdapter';
import type { ArchiveItem } from './ArchiveContentTypeAdapter';
import type { BackendAdapter } from './BackendAdapter';
import { OCIBackendAdapter } from './OCIBackendAdapter';
import { OCIClient } from '../oci/OCIClient';
import { MINIMAL_CAPABILITIES, MediaTypes } from '../oci/types';
import type { ResolvedArtifact } from '../oci/types';

class TestAdapter extends ArchiveContentTypeAdapter {
  readonly type = 'test';
  readonly mediaTypes = ['test'];
  readonly filename = 'MANIFEST.json';
  parse(): ArchiveItem[] {
    return [];
  }
}
const adapter = new TestAdapter();
const blob = readFileSync(join(__dirname, 'fixtures/metadata.tar.gz'));
const layer = {
  mediaType: ARCHIVE_LAYER_MEDIA_TYPE,
  digest: `sha256:${'a'.repeat(64)}`,
  size: blob.length,
};
const ref: ResolvedArtifact = {
  registry: 'mock',
  repository: 'test/repo',
  reference: 'latest',
  digest: `sha256:${'b'.repeat(64)}`,
  mediaType: MediaTypes.ociManifest,
  manifest: {
    schemaVersion: 2,
    artifactType: 'test',
    config: {
      mediaType: MediaTypes.ociConfig,
      digest: 'sha256:config',
      size: 2,
    },
    layers: [layer],
  },
};
const ctx = (payload: Buffer | undefined) => ({
  capabilities: MINIMAL_CAPABILITIES,
  backend: { fetchBlob: async () => payload } as unknown as BackendAdapter,
});

it('rejects nested gzip with spoofed ustar magic before a second decompression', async () => {
  const body = Buffer.alloc(ARCHIVE_BYTE_LIMIT + 1, 'A');
  const header = new Header({
    path: 'MANIFEST.json',
    size: body.length,
    type: 'File',
  });
  const block = Buffer.alloc(512);
  header.encode(block);
  const inner = gzipSync(
    Buffer.concat([
      block,
      body,
      Buffer.alloc(512 - (body.length % 512) + 1024),
    ]),
  );
  inner[3] |= 0x10;
  const comment = Buffer.alloc(1024, 'x');
  comment.write('ustar', 247);
  const outer = gzipSync(
    Buffer.concat([
      inner.subarray(0, 10),
      comment,
      Buffer.from([0]),
      inner.subarray(10),
    ]),
  );
  await expect(readArchiveFile(outer, 'MANIFEST.json')).rejects.toThrow(
    'nested gzip/zstd',
  );
});

it('rejects nested zstd and invalid checksums even when ustar magic is present', async () => {
  const spoofed = Buffer.alloc(512);
  spoofed.writeUInt32LE(0xfd2fb528, 0);
  spoofed.write('ustar', 257);
  await expect(
    readArchiveFile(gzipSync(spoofed), 'MANIFEST.json'),
  ).rejects.toThrow('nested gzip/zstd');
  spoofed.writeUInt32LE(0, 0);
  await expect(
    readArchiveFile(gzipSync(spoofed), 'MANIFEST.json'),
  ).rejects.toThrow('checksum');
});

it('keeps oversized root metadata partial and a subsequent valid artifact complete', async () => {
  const body = Buffer.alloc(1024 * 1024 + 1, 'A');
  const block = Buffer.alloc(512);
  new Header({ path: 'MANIFEST.json', size: body.length, type: 'File' }).encode(
    block,
  );
  const layerBlob = gzipSync(
    Buffer.concat([
      block,
      body,
      Buffer.alloc(512 - (body.length % 512) + 1024),
    ]),
  );
  expect(await adapter.enumerate(ref, ctx(layerBlob))).toMatchObject({
    status: 'partial',
    diagnostics: [expect.stringContaining('metadata document')],
  });
  expect((await adapter.enumerate(ref, ctx(blob))).status).toBe('complete');
});

it('reads a real GNU tar archive but refuses missing, corrupt and truncated documents', async () => {
  expect(await readArchiveFile(blob, 'MANIFEST.json')).toContain(
    'collection_info',
  );
  await expect(readArchiveFile(blob, 'SKILL.md')).rejects.toThrow('not found');
  await expect(
    readArchiveFile(gzipSync(Buffer.from('bad tar')), 'MANIFEST.json'),
  ).rejects.toThrow();
  const tar = gunzipSync(blob);
  await expect(
    readArchiveFile(gzipSync(tar.subarray(0, 600)), 'MANIFEST.json'),
  ).rejects.toThrow();
});

it('distinguishes a successfully enumerated empty inventory from an unknown one', async () => {
  expect(await adapter.enumerate(ref, ctx(blob))).toMatchObject({
    status: 'complete',
    items: [],
    diagnostics: ['metadata document contains no items'],
  });
  expect((await adapter.enumerate(ref, ctx(undefined))).status).toBe('unknown');
  expect(
    (
      await adapter.enumerate(
        { ...ref, manifest: { schemaVersion: 2, manifests: [] } },
        ctx(blob),
      )
    ).status,
  ).toBe('unknown');
  expect(
    (await adapter.enumerate(ref, ctx(Buffer.alloc(ARCHIVE_BYTE_LIMIT + 1))))
      .status,
  ).toBe('partial');
  const expanded = await adapter.enumerate(
    ref,
    ctx(gzipSync(Buffer.alloc(ARCHIVE_BYTE_LIMIT + 1))),
  );
  expect(expanded.status).toBe('partial');
});

it('normalizes annotation fallbacks and compares immutable digests', async () => {
  const object = await adapter.normalize(ref, {
    manifest: ref.manifest,
    obtained: ['manifest'],
  });
  expect(object.identity.name).toBe('test/repo');
  expect(object.version.value).toBe(ref.digest);
  expect(adapter.updatePolicy.shouldUpdate(object, ref)).toBe(false);
  expect(adapter.updatePolicy.shouldUpdate(undefined, ref)).toBe(true);
  expect(
    adapter.identify(ref, { manifest: ref.manifest, obtained: ['manifest'] })
      .confidence,
  ).toBe('certain');
  const unclaimed = {
    ...ref,
    manifest: { ...ref.manifest, artifactType: undefined },
  };
  expect(
    adapter.identify(unclaimed, {
      manifest: unclaimed.manifest,
      obtained: ['manifest'],
    }).confidence,
  ).toBe('no');
  const annotated = {
    ...ref,
    manifest: {
      ...ref.manifest,
      annotations: {
        'org.opencontainers.image.title': 'Title',
        'org.opencontainers.image.version': '1.2.3',
      },
    },
  };
  const objectWithMetadata = await adapter.normalize(annotated, {
    manifest: annotated.manifest,
    obtained: ['manifest'],
  });
  expect(objectWithMetadata.identity.name).toBe('Title');
  expect(objectWithMetadata.version.value).toBe('1.2.3');
});

it('reports unavailable backends, declared size limits and non-Error failures', async () => {
  const oversized = {
    ...ref,
    manifest: {
      ...ref.manifest,
      layers: [{ ...layer, size: ARCHIVE_BYTE_LIMIT + 1 }],
    },
  };
  expect((await adapter.enumerate(oversized, ctx(blob))).status).toBe(
    'partial',
  );
  const unsupported = ctx(blob);
  delete unsupported.backend.fetchBlob;
  expect((await adapter.enumerate(ref, unsupported)).status).toBe('unknown');
  const failed = ctx(blob);
  failed.backend.fetchBlob = () => Promise.reject('unavailable');
  expect(await adapter.enumerate(ref, failed)).toMatchObject({
    status: 'unknown',
    diagnostics: ['archive enumeration failed'],
  });
});

it('bounds actual streamed blob bytes even if the descriptor lies, and bounds cached reads', async () => {
  const connection = {
    name: 'mock',
    url: 'https://registry.example.org',
    auth: { type: 'anonymous' as const },
  };
  const fetch = jest
    .fn()
    .mockImplementation(async () => new Response(Buffer.alloc(32)));
  const client = new OCIClient(connection, { fetch });
  const backend = new OCIBackendAdapter(client, connection);
  await expect(
    backend.fetchBlob(ref, { ...layer, size: 1 }, 16),
  ).rejects.toThrow('budget');
  expect(
    await backend.fetchBlob(ref, { ...layer, size: 32 }, 16),
  ).toBeUndefined();
  expect(await backend.fetchBlob(ref, { ...layer, size: 1 }, 64)).toHaveLength(
    32,
  );
});
