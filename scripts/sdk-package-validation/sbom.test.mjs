import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  verifyArchiveDigest,
  verifyArchiveEntries,
  verifySbom,
} from './sbom.mjs';

test('rejects an archive changed after validation before generating its SBOM', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdk-sbom-test-'));
  try {
    mkdirSync(join(root, 'artifacts'));
    const archive = join(root, 'artifacts/example.tgz');
    writeFileSync(archive, 'original');
    const candidate = {
      name: '@ansible/example',
      sha256: createHash('sha256').update('original').digest('hex'),
    };
    assert.equal(verifyArchiveDigest(root, candidate), archive);
    writeFileSync(archive, 'changed');
    assert.throws(
      () => verifyArchiveDigest(root, candidate),
      /archive changed/,
    );
    assert.throws(
      () =>
        verifyArchiveDigest(root, {
          ...candidate,
          name: '@ansible/../../outside',
        }),
      /Invalid candidate/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('permits regular packed files but rejects traversal, symlinks and devices', () => {
  verifyArchiveEntries('package/LICENSE\n', '-rw-r--r-- entry\n');
  assert.throws(
    () => verifyArchiveEntries('package/../outside\n', '-rw-r--r-- entry\n'),
    /Unsafe/,
  );
  assert.throws(
    () => verifyArchiveEntries('package/link\n', 'lrwxrwxrwx link\n'),
    /rejects links/,
  );
  assert.throws(
    () => verifyArchiveEntries('package/device\n', 'crw-rw-rw- device\n'),
    /rejects links/,
  );
});

test('requires a cataloged npm component rather than only a directory source', () => {
  const candidate = { name: '@ansible/example', version: '0.1.0' };
  const component = { name: candidate.name, versionInfo: candidate.version };
  const document = { spdxVersion: 'SPDX-2.3', packages: [component] };
  assert.throws(() => verifySbom(document, candidate), /packed npm package/);
  component.externalRefs = [
    {
      referenceType: 'purl',
      referenceLocator: 'pkg:npm/%40ansible/example@0.1.0',
    },
  ];
  verifySbom(document, candidate);
});
