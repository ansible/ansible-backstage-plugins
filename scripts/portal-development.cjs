const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { ConfigSources } = require('@backstage/config-loader');
const {
  selectedWorkspacePlugins,
} = require('./portal-development-workspaces.cjs');

const repo = path.resolve(__dirname, '..');
const appDirectory = path.join(repo, 'workspaces/portal-core/packages/app');

function validateDevelopmentDiscovery(config, root = repo) {
  const profile =
    config.getOptionalString('portal.development.profile') ?? 'full';
  if (!['full', 'scaffolder', 'core'].includes(profile)) {
    throw new Error(`Unknown portal.development.profile '${profile}'`);
  }
  const selection = config.getOptional('app.packages');
  if (selection === undefined || selection === null) return [];
  // An explicit include prevents all-package discovery from bypassing a reduced
  // profile or evaluating a bundled contributor's legacy package root.
  if (
    typeof selection !== 'object' ||
    Array.isArray(selection) ||
    !Array.isArray(selection.include)
  ) {
    throw new Error(
      'Use app.packages.include for additional development plugins; all-package discovery bypasses profile selection',
    );
  }
  const names = config.getStringArray('app.packages.include');
  const excluded = new Set(
    config.getOptionalStringArray('app.packages.exclude') ?? [],
  );
  if (names.some(name => excluded.has(name)))
    throw new Error(
      'An additional plugin cannot be both included and excluded',
    );
  const bundled = new Set([
    '@ansible/portal-core',
    '@ansible/portal-scaffolder',
    '@ansible/plugin-backstage-apme',
    '@ansible/plugin-backstage-rhaap',
    '@ansible/aap-app-auth',
  ]);
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(root, 'workspaces/portal-core/packages/app/package.json'),
      'utf8',
    ),
  );
  const plugins = selectedWorkspacePlugins(root, names, { frontendOnly: true });
  for (const name of names) {
    if (bundled.has(name))
      throw new Error(
        `${name} is managed by the development harness; select its profile instead of rediscovering it`,
      );
    if (!manifest.dependencies?.[name])
      throw new Error(
        `Add ${name} to the source app dependencies before discovery`,
      );
    const selected = plugins.find(item => item.packageJson.name === name);
    if (selected.packageJson.sideEffects !== false)
      throw new Error(
        `${name} must declare sideEffects: false and keep its root entry free of legacy registration side effects`,
      );
    const appRequire = createRequire(
      path.join(root, 'workspaces/portal-core/packages/app/package.json'),
    );
    let installedDirectory = path.dirname(appRequire.resolve(name));
    while (!fs.existsSync(path.join(installedDirectory, 'package.json'))) {
      const parent = path.dirname(installedDirectory);
      if (parent === installedDirectory)
        throw new Error(`Cannot locate installed package ${name}`);
      installedDirectory = parent;
    }
    const installedManifest = JSON.parse(
      fs.readFileSync(path.join(installedDirectory, 'package.json'), 'utf8'),
    );
    if (
      installedManifest.name !== name ||
      fs.realpathSync(installedDirectory) !== selected.directory
    )
      throw new Error(
        `${name} must resolve from the app to the selected workspace; install workspace dependencies first`,
      );
  }
  return plugins;
}

async function run() {
  const [command, ...args] = process.argv.slice(2);
  if (!['start', 'build', 'check'].includes(command))
    throw new Error('Expected start, build or check');
  const config = await ConfigSources.toConfig(
    ConfigSources.default({ rootDir: repo, argv: args, watch: false }),
  );
  try {
    validateDevelopmentDiscovery(config);
  } finally {
    config.close();
  }
  if (command === 'check') return;
  const cli = path.join(
    path.dirname(require.resolve('@backstage/cli/package.json')),
    'bin/backstage-cli',
  );
  const result = spawnSync(
    process.execPath,
    [cli, 'package', command, ...args],
    { cwd: appDirectory, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (require.main === module) {
  run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { validateDevelopmentDiscovery };
