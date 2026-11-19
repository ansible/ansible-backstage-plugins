import assert from 'node:assert/strict';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';
import { build } from 'esbuild';
import semver from 'semver';

const require = createRequire(import.meta.url);
const consumer = realpathSync(process.cwd());
function assertInsideConsumer(path) {
  const location = relative(consumer, realpathSync(path));
  assert(
    !location.startsWith('..') && !isAbsolute(location),
    `Consumer escaped its install: ${path}`,
  );
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
for (const name of Object.keys(manifest.dependencies).filter(n =>
  n.startsWith('@ansible/'),
)) {
  assertInsideConsumer(require.resolve(name));
  const packed = require(`${name}/package.json`);
  for (const field of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const [dependency, range] of Object.entries(packed[field] ?? {})) {
      if (!dependency.startsWith('@ansible/')) continue;
      const installed = require(`${dependency}/package.json`);
      assert(
        semver.satisfies(installed.version, range),
        `Internal version mismatch: ${name} requires ${dependency}@${range}, installed ${installed.version}`,
      );
    }
  }
}

const result = await build({
  entryPoints: [
    'frontend.tsx',
    'host-frontend.ts',
    'auth-split.ts',
    'auth-settings.tsx',
  ],
  bundle: true,
  platform: 'browser',
  loader: { '.svg': 'file', '.png': 'file' },
  format: 'esm',
  outdir: 'build',
  metafile: true,
  logLevel: 'warning',
});
for (const input of Object.keys(result.metafile.inputs)) {
  // esbuild represents browser:false mappings as virtual empty modules.
  if (!input.startsWith('(disabled):')) assertInsideConsumer(resolve(input));
}
writeFileSync(
  'bundle-metafile.json',
  `${JSON.stringify(result.metafile, null, 2)}\n`,
);

// Exercise public APIs from installed archives without starting a host or native DB.
const {
  createPortalPlugin,
  PortalHealth,
  PortalCatalogEntityProviders,
  portalCatalogEntityProvidersServiceRef,
} = require('@ansible/portal-plugin-node');
const health = new PortalHealth();
const sdk = createPortalPlugin({ pluginId: 'external-consumer', health });
sdk.pushHealthStatus({
  state: 'READY',
  message: 'Packed consumer initialized',
});
assert.equal(health.snapshot()['external-consumer'].state, 'READY');

// Exercise the new public API from archives, not a workspace source alias.
// These serial test providers are not production lock implementations.
const providers = new PortalCatalogEntityProviders();
assert.equal(portalCatalogEntityProvidersServiceRef.scope, 'root');
function addTestProvider(id) {
  const entities = new Map();
  const states = new Map();
  providers.register({
    id,
    provider: {
      isReady: () => true,
      async withEntityMutation({ entityRef }, operation) {
        return operation({
          get registrationState() {
            return states.get(entityRef) ?? 'none';
          },
          async upsert(entity) {
            entities.set(entityRef, entity);
            states.set(entityRef, 'registered');
          },
          async remove() {
            entities.delete(entityRef);
            states.delete(entityRef);
          },
          async clearRegistration() {
            states.delete(entityRef);
          },
        });
      },
    },
  });
  return entities;
}
const first = addTestProvider('external.components');
const second = addTestProvider('another.resources');
for (const [id, kind] of [
  ['external.components', 'Component'],
  ['another.resources', 'Resource'],
]) {
  const entityRef = `${kind.toLowerCase()}:consumer/example`;
  await providers.get(id).withEntityMutation({ entityRef }, async mutation => {
    assert.equal(mutation.registrationState, 'none');
    await mutation.upsert({
      apiVersion: 'backstage.io/v1alpha1',
      kind,
      metadata: { namespace: 'consumer', name: 'example' },
    });
    assert.equal(mutation.registrationState, 'registered');
  });
}
assert.deepEqual([...first.keys()], ['component:consumer/example']);
assert.deepEqual([...second.keys()], ['resource:consumer/example']);
assert.ok(require('@ansible/portal-health-backend').default);
assert.ok(require('@ansible/portal-operations-backend').default);
console.log(
  'Packed frontend bundles, backend health and catalog providers passed without workspace links.',
);
