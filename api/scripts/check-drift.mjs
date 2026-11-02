/*
 * Compares routes registered in backend plugin router files against paths
 * in api/openapi.yaml. Automatically discovers router.ts files under
 * workspace plugin directories and the legacy plugins/ directory.
 *
 * Exits with code 1 if any route is missing from the spec or vice versa.
 *
 * Usage: node api/scripts/check-drift.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative, sep } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const specPath = resolve(repoRoot, 'api/openapi.yaml');

// Collect all plugin directories to scan.
// The repo uses a workspaces layout: workspaces/<workspace>/plugins/<plugin>/
// The legacy root plugins/ directory is kept for backward compatibility but
// currently contains only a README — real router files live in workspaces.
function collectPluginDirs() {
  const dirs = [];
  const rootPlugins = resolve(repoRoot, 'plugins');
  if (statSync(rootPlugins, { throwIfNoEntry: false })?.isDirectory()) {
    dirs.push(rootPlugins);
  }
  const workspacesRoot = resolve(repoRoot, 'workspaces');
  if (statSync(workspacesRoot, { throwIfNoEntry: false })?.isDirectory()) {
    for (const workspace of readdirSync(workspacesRoot)) {
      if (workspace.startsWith('.')) continue;
      const workspacePath = resolve(workspacesRoot, workspace);
      // Skip files (e.g. README.md) — only process directories
      if (!statSync(workspacePath, { throwIfNoEntry: false })?.isDirectory()) {
        continue;
      }
      const workspacePlugins = resolve(workspacePath, 'plugins');
      if (
        statSync(workspacePlugins, { throwIfNoEntry: false })?.isDirectory()
      ) {
        dirs.push(workspacePlugins);
      }
    }
  }
  return dirs;
}

const routeRegex =
  /router\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;

// These routers share a local /health path but have separate mounted operations
// because their authentication policies differ. Keep their identities distinct.
const mountedHealthPaths = new Map([
  [
    'workspaces/aap/plugins/catalog-backend-module-rhaap/src/router.ts',
    '/api/catalog/health',
  ],
  [
    'workspaces/content/plugins/automation-content-backend/src/router.ts',
    '/api/automation-content/health',
  ],
]);

// Normalize path parameters: convert Express :param to OpenAPI {param}
function normalizePath(path) {
  return path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
}

// Recursively find all router.ts files under plugins/
function findRouterFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (
      entry === 'node_modules' ||
      entry === 'dist' ||
      entry === 'dist-dynamic'
    )
      continue;
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findRouterFiles(fullPath));
    } else if (entry === 'router.ts' && !fullPath.includes('.test.')) {
      results.push(fullPath);
    }
  }
  return results;
}

export function checkRouteDrift(routerSources, spec) {
  const codeRoutes = new Map();

  for (const { file, source } of routerSources) {
    let match;
    routeRegex.lastIndex = 0;
    while ((match = routeRegex.exec(source)) !== null) {
      const method = match[1].toUpperCase();
      let path = normalizePath(match[2]);
      if (path === '/health') {
        path = mountedHealthPaths.get(file) ?? path;
      }
      const key = `${method} ${path}`;
      codeRoutes.set(key, { method, path, file });
    }
  }

  const specRoutes = new Map();
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    for (const method of Object.keys(methods)) {
      if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
        specRoutes.set(`${method.toUpperCase()} ${path}`, { method, path });
      }
    }
  }

  const inCodeNotInSpec = [];
  const inSpecNotInCode = [];

  for (const [key, info] of codeRoutes.entries()) {
    if (!specRoutes.has(key)) {
      inCodeNotInSpec.push({ route: key, file: info.file });
    }
  }

  for (const key of specRoutes.keys()) {
    if (!codeRoutes.has(key)) {
      inSpecNotInCode.push(key);
    }
  }

  return { routeCount: codeRoutes.size, inCodeNotInSpec, inSpecNotInCode };
}

function main() {
  const routerFiles = collectPluginDirs().flatMap(dir => findRouterFiles(dir));
  const routerSources = routerFiles.map(filePath => ({
    file: relative(repoRoot, filePath).split(sep).join('/'),
    source: readFileSync(filePath, 'utf-8'),
  }));
  const spec = parse(readFileSync(specPath, 'utf-8'));
  const { routeCount, inCodeNotInSpec, inSpecNotInCode } = checkRouteDrift(
    routerSources,
    spec,
  );

  const scannedFiles = routerSources.map(({ file }) => file);
  console.log(
    `Scanned ${scannedFiles.length} router file(s): ${scannedFiles.join(', ')}`,
  );

  if (inCodeNotInSpec.length === 0 && inSpecNotInCode.length === 0) {
    console.log(`OK: All ${routeCount} routes match api/openapi.yaml`);
    return 0;
  }

  if (inCodeNotInSpec.length > 0) {
    console.error('\nRoutes in code but MISSING from api/openapi.yaml:');
    for (const { route, file } of inCodeNotInSpec) {
      console.error(`  - ${route}  (${file})`);
    }
  }

  if (inSpecNotInCode.length > 0) {
    console.error('\nRoutes in api/openapi.yaml but MISSING from code:');
    for (const route of inSpecNotInCode) {
      console.error(`  - ${route}`);
    }
  }

  console.error('\nUpdate api/openapi.yaml to match the code (or vice versa).');
  return 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
