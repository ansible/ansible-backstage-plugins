import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateArchive } from './validate-archive.mjs';

function archive() {
  const repository = {
    type: 'git',
    url: 'https://github.com/ansible/ansible-backstage-plugins.git',
    directory: 'workspaces/portal-core/plugins/example',
  };
  return {
    manifest: {
      name: '@ansible/example',
      version: '0.1.0',
      private: true,
      license: 'Apache-2.0',
      repository: { ...repository },
      main: 'dist/index.cjs.js',
      types: 'dist/index.d.ts',
      exports: {
        '.': { types: './dist/index.d.ts', default: './dist/index.cjs.js' },
      },
    },
    files: [
      'package/LICENSE',
      'package/dist/index.cjs.js',
      'package/dist/index.d.ts',
    ],
    license: 'repository license',
    expected: {
      name: '@ansible/example',
      version: '0.1.0',
      license: 'repository license',
      repository,
    },
    candidates: new Set(['@ansible/example']),
  };
}

test('accepts packed entry points and conditional declarations', () => {
  validateArchive(archive());
});

test('requires repository metadata for provenance readiness', () => {
  const input = archive();
  delete input.manifest.repository;
  assert.throws(() => validateArchive(input), /repository metadata/);
});

test('rejects an unrelated repository URL', () => {
  const input = archive();
  input.manifest.repository.url = 'https://github.com/other/repository.git';
  assert.throws(() => validateArchive(input), /repository URL/);
});

test('rejects missing or changed monorepo directory metadata', () => {
  const input = archive();
  delete input.manifest.repository.directory;
  assert.throws(() => validateArchive(input), /repository directory/);
  input.manifest.repository.directory = 'workspaces/portal-core/plugins/other';
  assert.throws(() => validateArchive(input), /differs from source/);
});

test('rejects a missing declaration even if the runtime export exists', () => {
  const input = archive();
  input.files.pop();
  assert.throws(() => validateArchive(input), /Missing types|Missing exports/);
});

for (const range of [
  'workspace:^',
  'file:../other',
  'link:../other',
  '~/other',
  'https://example.com/package.tgz',
]) {
  test(`rejects unpublished dependency reference ${range}`, () => {
    const input = archive();
    input.manifest.dependencies = { dependency: range };
    assert.throws(() => validateArchive(input), /Non-registry dependencies/);
  });
}

test('rejects a feature-plugin dependency outside the candidate closure', () => {
  const input = archive();
  input.manifest.peerDependencies = { '@ansible/feature-plugin': '^0.1.0' };
  assert.throws(() => validateArchive(input), /outside scope/);
});

for (const file of [
  'package/.env.local',
  'package/app-config.production.yaml',
  'package/node_modules/a.js',
  'package/../outside',
]) {
  test(`rejects unintended or unsafe file ${file}`, () => {
    const input = archive();
    input.files.push(file);
    assert.throws(() => validateArchive(input), /Unintended|Unsafe/);
  });
}

test('accepts Backstage feature markers while checking real export files', () => {
  const input = archive();
  input.manifest.exports['./alpha'] = {
    backstage: '@backstage/FrontendModule',
    default: './dist/index.cjs.js',
    types: './dist/index.d.ts',
  };
  validateArchive(input);
  input.manifest.exports['./alpha'].default = './missing.js';
  assert.throws(() => validateArchive(input), /Missing exports/);
});

test('rejects removing the publication guard during preparation', () => {
  const input = archive();
  input.manifest.private = false;
  assert.throws(() => validateArchive(input), /private guard/);
});

test('rejects a license file that differs from the repository license', () => {
  const input = archive();
  input.license = 'wrong license';
  assert.throws(() => validateArchive(input), /repository license/);
});

test('accepts tilde semver ranges in published dependency fields', () => {
  const input = archive();
  for (const field of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    input.manifest[field] = { dependency: '~1.2.3' };
  }
  validateArchive(input);
});
