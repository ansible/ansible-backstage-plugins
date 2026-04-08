/*
 * Compares routes registered in backend plugin router files against paths
 * in api/openapi.yaml. Automatically discovers all router.ts files across
 * the plugins/ directory.
 *
 * Exits with code 1 if any route is missing from the spec or vice versa.
 *
 * Usage: node api/scripts/check-drift.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const pluginsDir = resolve(repoRoot, 'plugins');
const specPath = resolve(repoRoot, 'api/openapi.yaml');

const routeRegex =
  /router\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;

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

// Extract routes from all router files
const routerFiles = findRouterFiles(pluginsDir);
const codeRoutes = new Map();

for (const filePath of routerFiles) {
  const source = readFileSync(filePath, 'utf-8');
  const relPath = relative(repoRoot, filePath);
  let match;
  routeRegex.lastIndex = 0;
  while ((match = routeRegex.exec(source)) !== null) {
    const method = match[1].toUpperCase();
    const path = match[2];
    const key = `${method} ${path}`;
    codeRoutes.set(key, { method, path, file: relPath });
  }
}

// Extract paths from openapi.yaml
const specContent = readFileSync(specPath, 'utf-8');
const spec = parse(specContent);
const specRoutes = new Map();
for (const [path, methods] of Object.entries(spec.paths || {})) {
  for (const method of Object.keys(methods)) {
    if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
      specRoutes.set(`${method.toUpperCase()} ${path}`, { method, path });
    }
  }
}

// Compare
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

// Report
const scannedFiles = routerFiles.map(f => relative(repoRoot, f));
console.log(
  `Scanned ${scannedFiles.length} router file(s): ${scannedFiles.join(', ')}`,
);

if (inCodeNotInSpec.length === 0 && inSpecNotInCode.length === 0) {
  console.log(`OK: All ${codeRoutes.size} routes match api/openapi.yaml`);
  process.exit(0);
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
process.exit(1);
