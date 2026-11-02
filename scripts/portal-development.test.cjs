const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { ConfigReader } = require('@backstage/config');
const { validateDevelopmentDiscovery } = require('./portal-development.cjs');
const {
  workspacePackages,
  selectedWorkspacePlugins,
} = require('./portal-development-workspaces.cjs');

function fixture(
  t,
  workspaces = ['workspaces/*/plugins/*', 'workspaces/*/packages/*'],
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-discovery-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function write(relative, value) {
    const target = path.join(root, relative, 'package.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value));
  }
  write('', { private: true, workspaces });
  const appPath = 'workspaces/portal-core/packages/app';
  function app(dependencies = { '@test/extra': 'workspace:^' }) {
    write(appPath, {
      name: 'app',
      backstage: { role: 'frontend' },
      dependencies,
    });
  }
  function plugin(
    name = '@test/extra',
    overrides = {},
    relative = 'workspaces/test/plugins/extra',
  ) {
    write(relative, {
      name,
      sideEffects: false,
      backstage: { role: 'frontend-plugin' },
      exports: { '.': './index.js', './alpha': './src/alpha.tsx' },
      scripts: { 'export-dynamic': 'rhdh-cli plugin export' },
      ...overrides,
    });
    fs.writeFileSync(
      path.join(root, relative, 'index.js'),
      'module.exports = {};',
    );
    const link = path.join(root, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    if (!fs.existsSync(link))
      fs.symlinkSync(path.join(root, relative), link, 'dir');
  }
  app();
  plugin();
  return { root, app, plugin, write };
}

function config(packages = { include: ['@test/extra'] }, profile = 'core') {
  return new ConfigReader({
    app: { packages },
    portal: { development: { profile } },
  });
}

test('reads only registered workspaces and supports Yarn object workspace patterns', t => {
  const f = fixture(t, {
    packages: ['workspaces/*/plugins/*', 'workspaces/*/packages/*'],
  });
  f.plugin('@test/unregistered', {}, 'unregistered/plugin');
  const packages = workspacePackages(f.root);
  assert.deepEqual([...packages.keys()].sort(), ['@test/extra', 'app']);
  assert.equal(
    packages.get('@test/extra').relativeDir,
    'workspaces/test/plugins/extra',
  );
  assert.equal(
    packages.get('@test/extra').directory,
    fs.realpathSync(path.join(f.root, 'workspaces/test/plugins/extra')),
  );
});

test('rejects missing workspace declarations and duplicate workspace identities', t => {
  const f = fixture(t);
  f.plugin('@test/extra', {}, 'workspaces/test/plugins/duplicate');
  assert.throws(
    () => workspacePackages(f.root),
    /Duplicate workspace package name/,
  );
  f.write('', { private: true });
  assert.throws(
    () => workspacePackages(f.root),
    /must declare Yarn workspaces/,
  );
});

test('accepts an additional native frontend plugin with a source-app dependency', t => {
  const f = fixture(t);
  const result = validateDevelopmentDiscovery(config(), f.root);
  assert.equal(result.length, 1);
  assert.equal(result[0].packageJson.name, '@test/extra');
});

test('requires the additional package to declare a side-effect-free root', t => {
  const f = fixture(t);
  f.plugin('@test/extra', { sideEffects: true });
  assert.throws(
    () => validateDevelopmentDiscovery(config(), f.root),
    /sideEffects: false/,
  );
});

test('rejects an installed dependency that differs from the selected workspace', t => {
  const f = fixture(t);
  const link = path.join(f.root, 'node_modules/@test/extra');
  fs.unlinkSync(link);
  fs.mkdirSync(link);
  fs.writeFileSync(
    path.join(link, 'package.json'),
    JSON.stringify({ name: '@test/extra', main: 'index.js' }),
  );
  fs.writeFileSync(path.join(link, 'index.js'), 'module.exports = {};');
  assert.throws(
    () => validateDevelopmentDiscovery(config(), f.root),
    /selected workspace/,
  );
});

for (const profile of ['full', 'scaffolder', 'core']) {
  test(`supports explicit discovery on ${profile} without changing the baseline`, t => {
    const f = fixture(t);
    assert.equal(
      validateDevelopmentDiscovery(config(undefined, profile), f.root).length,
      1,
    );
  });
}

test('does not enable discovery when app.packages is absent', t => {
  const f = fixture(t);
  assert.deepEqual(
    validateDevelopmentDiscovery(new ConfigReader({}), f.root),
    [],
  );
  assert.deepEqual(
    validateDevelopmentDiscovery(config({ include: [] }), f.root),
    [],
  );
});

for (const packages of ['all', {}, { exclude: ['@test/extra'] }, [], true]) {
  test(`rejects implicit/all-package discovery: ${JSON.stringify(
    packages,
  )}`, t => {
    const f = fixture(t);
    assert.throws(
      () => validateDevelopmentDiscovery(config(packages), f.root),
      /app.packages.include/,
    );
  });
}

for (const profile of ['', 'other', 'CORE']) {
  test(`rejects invalid profile ${JSON.stringify(
    profile,
  )} even without discovery`, t => {
    const f = fixture(t);
    assert.throws(
      () =>
        validateDevelopmentDiscovery(
          new ConfigReader({ portal: { development: { profile } } }),
          f.root,
        ),
      /portal.development.profile/,
    );
  });
}

test('rejects unknown packages, duplicate selections and package paths or URLs', t => {
  const f = fixture(t);
  assert.throws(
    () => selectedWorkspacePlugins(f.root, ['@test/missing']),
    /Unknown workspace plugin/,
  );
  assert.throws(
    () =>
      validateDevelopmentDiscovery(
        config({ include: ['@test/extra', '@test/extra'] }),
        f.root,
      ),
    /Duplicate additional plugin/,
  );
  for (const name of [
    './extra',
    '/tmp/plugin',
    'https://example.com/plugin',
    '../plugin',
  ]) {
    assert.throws(
      () => selectedWorkspacePlugins(f.root, [name]),
      /workspace package names/,
    );
  }
});

for (const role of [
  'web-library',
  'node-library',
  'backend-plugin',
  'backend-plugin-module',
  undefined,
]) {
  test(`rejects non-frontend role ${role} in source discovery`, t => {
    const f = fixture(t);
    f.plugin('@test/extra', { backstage: { role } });
    assert.throws(
      () => validateDevelopmentDiscovery(config(), f.root),
      /unsupported standalone plugin role/,
    );
  });
}

test('requires native alpha and a direct app dependency', t => {
  const f = fixture(t);
  f.plugin('@test/extra', { exports: { '.': './src/index.ts' } });
  assert.throws(
    () => validateDevelopmentDiscovery(config(), f.root),
    /native .\/alpha/,
  );
  f.plugin();
  f.app({});
  assert.throws(
    () => validateDevelopmentDiscovery(config(), f.root),
    /source app dependencies/,
  );
});

for (const name of [
  '@ansible/portal-core',
  '@ansible/portal-scaffolder',
  '@ansible/plugin-backstage-apme',
  '@ansible/plugin-backstage-rhaap',
  '@ansible/aap-app-auth',
]) {
  test(`rejects rediscovery of bundled ${name} even in core profile`, t => {
    const f = fixture(t);
    f.plugin(name);
    f.app({ [name]: 'workspace:^' });
    assert.throws(
      () => validateDevelopmentDiscovery(config({ include: [name] }), f.root),
      /managed by the development harness/,
    );
  });
}

test('rejects include/exclude conflicts and permits unrelated disabled packages', t => {
  const f = fixture(t);
  assert.throws(
    () =>
      validateDevelopmentDiscovery(
        config({ include: ['@test/extra'], exclude: ['@test/extra'] }),
        f.root,
      ),
    /both included and excluded/,
  );
  assert.equal(
    validateDevelopmentDiscovery(
      config({
        include: ['@test/extra'],
        exclude: ['@ansible/portal-scaffolder'],
      }),
      f.root,
    ).length,
    1,
  );
});

test('local dynamic export selection supports frontend modules and backend plugins', t => {
  const f = fixture(t);
  for (const role of [
    'frontend-plugin-module',
    'backend-plugin',
    'backend-plugin-module',
  ]) {
    f.plugin('@test/extra', { backstage: { role } });
    assert.equal(
      selectedWorkspacePlugins(f.root, ['@test/extra'], { dynamic: true })[0]
        .packageJson.backstage.role,
      role,
    );
  }
});

test('dynamic export selection requires the exporter, while source discovery does not', t => {
  const f = fixture(t);
  for (const scripts of [{}, { 'export-dynamic': 'echo export' }]) {
    f.plugin('@test/extra', { scripts });
    assert.throws(
      () =>
        selectedWorkspacePlugins(f.root, ['@test/extra'], { dynamic: true }),
      /export-dynamic script/,
    );
    assert.equal(validateDevelopmentDiscovery(config(), f.root).length, 1);
  }
});
