import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  publicationOrder,
  validateReleaseManifests,
  validateReleaseRef,
} from './release.mjs';

const version = '0.1.0-alpha.0';
const manifest = name => ({
  name: `@ansible/${name}`,
  version,
  private: false,
  publishConfig: { access: 'public' },
  repository: {
    url: 'https://github.com/ansible/ansible-backstage-plugins.git',
  },
});

test('requires reviewed public preview metadata', () => {
  validateReleaseManifests([manifest('sdk')], version);
  for (const changes of [
    { private: true },
    { private: null },
    { private: 'false' },
    { version: '0.1.0' },
    { publishConfig: { access: 'restricted' } },
    { publishConfig: { access: 'public', provenance: false } },
    { publishConfig: { access: 'public', registry: 'https://example.com/' } },
  ]) {
    assert.throws(() =>
      validateReleaseManifests([{ ...manifest('sdk'), ...changes }], version),
    );
  }
  for (const invalid of [
    '0.1.0',
    '1.0.0-alpha.0',
    '0.1.0-alpha.01',
    '$(echo token)',
    undefined,
  ]) {
    assert.throws(() => validateReleaseManifests([manifest('sdk')], invalid));
  }
});

test('rejects publish configuration that could override the preview tag or inject authentication', () => {
  for (const overrides of [
    { tag: 'latest' },
    { _authToken: 'forbidden' },
    { ignoreScripts: false },
  ]) {
    assert.throws(
      () =>
        validateReleaseManifests(
          [
            {
              ...manifest('sdk'),
              publishConfig: { access: 'public', ...overrides },
            },
          ],
          version,
        ),
      /publishConfig override/,
    );
  }
});

test('rejects duplicates, feature dependencies and incompatible internal versions', () => {
  assert.throws(
    () => validateReleaseManifests([manifest('sdk'), manifest('sdk')], version),
    /Duplicate/,
  );
  for (const dependencies of [
    { '@ansible/feature': 'workspace:^' },
    { '@ansible/common': '^0.1.0' },
  ]) {
    assert.throws(() =>
      validateReleaseManifests(
        [{ ...manifest('sdk'), dependencies }, manifest('common')],
        version,
      ),
    );
  }
});

test('publishes dependency and peer providers before consumers', () => {
  const packages = [
    { ...manifest('host'), dependencies: { '@ansible/sdk': `^${version}` } },
    { ...manifest('sdk'), peerDependencies: { '@ansible/common': version } },
    manifest('common'),
  ];
  validateReleaseManifests(packages, version);
  assert.deepEqual(
    publicationOrder(packages).map(p => p.name),
    ['@ansible/common', '@ansible/sdk', '@ansible/host'],
  );
  packages[2].dependencies = { '@ansible/host': version };
  assert.throws(() => publicationOrder(packages), /Cyclic/);
});

test('permits only main and release-* branches matching the environment rules', () => {
  for (const ref of [
    'refs/heads/main',
    'refs/heads/release-2.1',
    'refs/heads/release-preview',
  ]) {
    assert.equal(validateReleaseRef(ref), ref);
  }
  for (const ref of [
    undefined,
    '',
    'main',
    'refs/heads/feature/example',
    'refs/heads/release-',
    'refs/heads/release-2.1/hotfix',
    'refs/tags/release-2.1',
    'refs/pull/1/merge',
  ]) {
    assert.throws(() => validateReleaseRef(ref), /Release/);
  }
});

test('rejects npm aliases to internal packages in every runtime dependency section', () => {
  for (const section of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const target of ['@ansible/common', '@ansible/outside-release']) {
      assert.throws(
        () =>
          validateReleaseManifests(
            [
              {
                ...manifest('sdk'),
                [section]: { alias: `npm:${target}@${version}` },
              },
              manifest('common'),
            ],
            version,
          ),
        /npm aliases to @ansible/,
      );
    }
  }
  validateReleaseManifests(
    [
      {
        ...manifest('sdk'),
        dependencies: { alias: 'npm:external-package@1.0.0' },
      },
    ],
    version,
  );
});

test('accepts the public metadata form persisted by Yarn without changing release requirements', () => {
  const normalized = manifest('sdk');
  delete normalized.private;
  validateReleaseManifests([normalized], version);
  assert.throws(() =>
    validateReleaseManifests([{ ...normalized, version: '0.1.0' }], version),
  );
});
