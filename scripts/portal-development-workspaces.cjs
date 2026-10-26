const fs = require('node:fs');
const path = require('node:path');

const frontendRoles = new Set(['frontend-plugin', 'frontend-plugin-module']);
const pluginRoles = new Set([
  ...frontendRoles,
  'backend-plugin',
  'backend-plugin-module',
]);

/** Read registered Yarn workspaces, never URLs, guessed paths or module code. */
function workspacePackages(repo) {
  const root = fs.realpathSync(repo);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  const patterns = Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : manifest.workspaces?.packages;
  if (!Array.isArray(patterns))
    throw new Error('PLUGIN_REPO must declare Yarn workspaces');
  const packages = new Map();
  for (const pattern of patterns) {
    for (const relative of fs.globSync(pattern, { cwd: root })) {
      const directory = fs.realpathSync(path.join(root, relative));
      const relativeDir = path.relative(root, directory);
      if (relativeDir.startsWith('..') || path.isAbsolute(relativeDir)) {
        throw new Error(
          `Workspace must remain inside the development checkout: ${relative}`,
        );
      }
      const file = path.join(directory, 'package.json');
      if (!fs.existsSync(file)) continue;
      const packageJson = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!packageJson.name)
        throw new Error(`Workspace has no package name: ${relative}`);
      if (packages.has(packageJson.name)) {
        throw new Error(
          `Duplicate workspace package name: ${packageJson.name}`,
        );
      }
      packages.set(packageJson.name, { directory, relativeDir, packageJson });
    }
  }
  return packages;
}

function selectedWorkspacePlugins(
  repo,
  names,
  { frontendOnly = false, dynamic = false } = {},
) {
  if (
    !Array.isArray(names) ||
    names.some(
      name =>
        typeof name !== 'string' ||
        !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name),
    )
  ) {
    throw new Error(
      'Additional plugins must be workspace package names, not paths or URLs',
    );
  }
  if (new Set(names).size !== names.length)
    throw new Error('Duplicate additional plugin package');
  const packages = workspacePackages(repo);
  return names.map(name => {
    const item = packages.get(name);
    if (!item) throw new Error(`Unknown workspace plugin package: ${name}`);
    const role = item.packageJson.backstage?.role;
    if (!(frontendOnly ? frontendRoles : pluginRoles).has(role)) {
      throw new Error(
        `${name} has unsupported standalone plugin role: ${role ?? 'missing'}`,
      );
    }
    if (frontendRoles.has(role) && !item.packageJson.exports?.['./alpha']) {
      throw new Error(
        `${name} must expose a native ./alpha frontend entry point`,
      );
    }
    if (
      dynamic &&
      !item.packageJson.scripts?.['export-dynamic']?.includes('plugin export')
    ) {
      throw new Error(
        `${name} must declare an export-dynamic script using rhdh-cli plugin export`,
      );
    }
    return item;
  });
}

module.exports = { workspacePackages, selectedWorkspacePlugins };
