/** @jest-environment node */
import { readFileSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';
import {
  MINIMAL_CAPABILITIES,
  ARCHIVE_BYTE_LIMIT,
} from '@ansible/automation-content-common';
import type {
  BackendAdapter,
  EnumerationContext,
  ResolvedArtifact,
} from '@ansible/automation-content-common';
import manifest from './fixtures/manifest.json';
import { AnsibleSkillAdapter } from './AnsibleSkillAdapter';

const adapter = new AnsibleSkillAdapter();
it('rejects small aliased YAML before normalized detail can expand beyond the archive budget', () => {
  const text = `---\nname: alias\ndescription: &s ${'A'.repeat(
    512 * 1024,
  )}\nextra: [${Array(49).fill('*s').join(',')}]\n---`;
  expect(() => adapter.parse(text)).toThrow();
});

it.each([
  '---\nname: alias\ndescription: &s small\nextra: [*s]\n---',
  `---\nname: huge\ndescription: ${'A'.repeat(1024 * 1024)}\n---`,
  '---\nname: recursive\ndescription: test\nextra: &r [*r]\n---',
  `---\nname: deep\ndescription: test\nextra: ${'['.repeat(40)}0${']'.repeat(
    40,
  )}\n---`,
  `---\nname: many\ndescription: test\nextra: [${Array(10001)
    .fill('0')
    .join(',')}]\n---`,
])('rejects oversized, recursive or over-budget metadata', document => {
  expect(() => adapter.parse(document)).toThrow();
});
const ref: ResolvedArtifact = {
  registry: 'mock',
  repository: 'arbitrary/repository',
  reference: 'latest',
  digest: `sha256:${'a'.repeat(64)}`,
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

it('identifies the real fixture by artifactType, never by repository path', () => {
  expect(
    adapter.identify(ref, { manifest, obtained: ['manifest'] }).confidence,
  ).toBe('certain');
  const old = {
    ...ref,
    repository: 'demo/skills/cluster-triage',
    manifest: { ...manifest, artifactType: undefined },
  };
  expect(
    adapter.identify(old, { manifest: old.manifest, obtained: ['manifest'] })
      .confidence,
  ).toBe('no');
});

it('enumerates SKILL.md and preserves unknown YAML fields', async () => {
  const result = await adapter.enumerate(ref, context());
  expect(result.status).toBe('complete');
  expect(result.items).toEqual([
    expect.objectContaining({
      fqcn: 'cluster-triage',
      type: 'skill',
      description: 'Diagnose a cluster',
      detail: expect.objectContaining({
        custom: { retained: true },
        tags: ['operations'],
      }),
    }),
  ]);
  const normalized = await adapter.normalize(ref, {
    manifest,
    obtained: ['manifest'],
  });
  expect(normalized.identity.type).toBe('skill');
  expect(normalized.trust.signing.verified).toBe(false);
});

it('records oversize layers as partial without pulling them', async () => {
  const ctx = context();
  const oversized = {
    ...ref,
    manifest: {
      ...manifest,
      layers: [{ ...manifest.layers[0], size: ARCHIVE_BYTE_LIMIT + 1 }],
    },
  };
  expect(await adapter.enumerate(oversized, ctx)).toMatchObject({
    status: 'partial',
    diagnostics: [expect.stringContaining('budget')],
  });
  expect(ctx.backend.fetchBlob).not.toHaveBeenCalled();
});

it('keeps corrupt tar, unavailable pulls and unsupported backends unknown', async () => {
  expect(
    (await adapter.enumerate(ref, context(gzipSync(Buffer.from('not a tar')))))
      .status,
  ).toBe('unknown');
  const ctx = context();
  ctx.backend.fetchBlob = async () => {
    throw new Error('pull failed');
  };
  expect(await adapter.enumerate(ref, ctx)).toMatchObject({
    status: 'unknown',
    diagnostics: ['pull failed'],
  });
  delete ctx.backend.fetchBlob;
  expect((await adapter.enumerate(ref, ctx)).status).toBe('unknown');
});

it.each([
  'name: bad',
  '---\nname: bad',
  '---\n- name\n---',
  '---\nname: [broken\n---',
  '---\nname: bad\n---',
  '---\nname: ""\ndescription: test\n---',
])('rejects malformed frontmatter: %s', text => {
  expect(() => adapter.parse(text)).toThrow();
});
