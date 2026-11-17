import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('publisher validates real archives and fails closed on tampering without publishing', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdk-publish-test-'));
  const version = '0.1.0-alpha.0';
  const sha = 'a'.repeat(40);
  const json = (path, data) => writeFileSync(path, JSON.stringify(data));
  const digest = path =>
    createHash('sha256').update(readFileSync(path)).digest('hex');
  try {
    const scripts = join(root, 'scripts/sdk-package-validation');
    mkdirSync(scripts, { recursive: true });
    for (const name of [
      'publish.mjs',
      'release.mjs',
      'validate-archive.mjs',
      'sbom.mjs',
    ]) {
      copyFileSync(new URL(name, import.meta.url), join(scripts, name));
    }
    const path = 'workspaces/portal-core/plugins/example';
    mkdirSync(join(root, path), { recursive: true });
    json(join(scripts, 'packages.json'), [path]);
    writeFileSync(join(root, 'LICENSE'), 'test license');
    const manifest = {
      name: '@ansible/example',
      version,
      private: false,
      license: 'Apache-2.0',
      publishConfig: { access: 'public' },
      repository: {
        type: 'git',
        url: 'https://github.com/ansible/ansible-backstage-plugins.git',
        directory: path,
      },
      main: 'index.js',
      types: 'index.d.ts',
    };
    json(join(root, path, 'package.json'), manifest);
    const directory = join(root, 'release');
    mkdirSync(join(directory, 'artifacts'), { recursive: true });
    mkdirSync(join(directory, 'sboms'));
    mkdirSync(join(root, 'package'));
    json(join(root, 'package/package.json'), manifest);
    for (const file of ['LICENSE', 'index.js', 'index.d.ts'])
      writeFileSync(
        join(root, 'package', file),
        file === 'LICENSE' ? 'test license' : '',
      );
    const archive = join(directory, 'artifacts/example.tgz');
    execFileSync('tar', ['-czf', archive, '-C', root, 'package']);
    const candidate = { name: manifest.name, version, sha256: digest(archive) };
    const report = {
      commit: sha,
      includesUncommittedChanges: false,
      packages: [candidate],
    };
    json(join(directory, 'report.json'), report);
    const sbom = join(directory, 'sboms/example.spdx.json');
    json(sbom, {
      spdxVersion: 'SPDX-2.3',
      packages: [
        {
          name: manifest.name,
          versionInfo: version,
          externalRefs: [
            {
              referenceType: 'purl',
              referenceLocator: `pkg:npm/${manifest.name}@${version}`,
            },
          ],
        },
      ],
    });
    json(join(directory, 'sboms/index.json'), [
      {
        name: manifest.name,
        version,
        archiveSha256: candidate.sha256,
        sbom: 'example.spdx.json',
        sbomSha256: digest(sbom),
      },
    ]);
    const run = (...args) =>
      spawnSync(process.execPath, [join(scripts, 'publish.mjs'), ...args], {
        encoding: 'utf8',
        env: {
          SDK_VALIDATION_DIR: directory,
          SDK_RELEASE_VERSION: version,
          GITHUB_SHA: sha,
        },
      });
    assert.equal(run().status, 0);
    assert.notEqual(
      run('--publish').status,
      0,
      'Actual publishing requires GitHub OIDC context',
    );
    for (const key of ['NPM_TOKEN', 'NODE_AUTH_TOKEN']) {
      const forbidden = spawnSync(
        process.execPath,
        [join(scripts, 'publish.mjs'), '--publish'],
        {
          encoding: 'utf8',
          env: {
            SDK_VALIDATION_DIR: directory,
            SDK_RELEASE_VERSION: version,
            GITHUB_SHA: sha,
            GITHUB_ACTIONS: 'true',
            GITHUB_EVENT_NAME: 'workflow_dispatch',
            GITHUB_REPOSITORY: 'ansible/ansible-backstage-plugins',
            GITHUB_REF: 'refs/heads/main',
            ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.invalid',
            ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-context',
            [key]: 'forbidden-test-credential',
          },
        },
      );
      assert.match(forbidden.stderr, /Static npm authentication/);
    }
    json(join(directory, 'report.json'), { ...report, commit: 'b'.repeat(40) });
    assert.match(run().stderr, /revision mismatch/);
    json(join(directory, 'report.json'), {
      ...report,
      includesUncommittedChanges: true,
    });
    assert.match(run().stderr, /clean release commit/);
    json(join(directory, 'report.json'), report);
    writeFileSync(sbom, '{}');
    assert.match(run().stderr, /AssertionError/);
    writeFileSync(archive, 'tampered');
    assert.match(run().stderr, /archive changed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
