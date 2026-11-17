import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicationOrder, validateReleaseManifests } from './release.mjs';

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
