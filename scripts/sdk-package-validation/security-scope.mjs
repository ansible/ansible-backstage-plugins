import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { verifyArchiveDigest } from './sbom.mjs';

export const securityPolicy = 'block-unreviewed-release-findings-v1';
const packageRoots = JSON.parse(
  readFileSync(new URL('packages.json', import.meta.url)),
);
// Reviewed build/publish inputs. Other repository workflows do not execute this release.
const releaseInputs = [
  '.github/workflows/sdk-package-publish.yml',
  '.github/workflows/sdk-package-validation.yml',
  '.github/workflows/sdk-package-validation-run.yml',
  '.github/actions/',
  'scripts/sdk-package-validation/',
  'scripts/test-with-console-log.sh',
  '.config/',
  '.yarn/',
  '.yarnrc.yml',
  'package.json',
  'yarn.lock',
  'backstage.json',
  'tsconfig.json',
];

/** Validate a decoded repository path without interpreting literal percent sequences. */
function validateRepositoryPath(path) {
  assert(
    typeof path === 'string' && path.length > 0,
    'Missing CodeQL source path',
  );
  assert(
    !/[\\\s\x00-\x1f?#:]/.test(path) &&
      !path.startsWith('/') &&
      !path.split('/').includes('..'),
    'Unclassifiable CodeQL source path',
  );
  const normalized = posix.normalize(path);
  assert(
    normalized !== '.' && !normalized.endsWith('/'),
    'Unclassifiable CodeQL source path',
  );
  return normalized;
}

/** Decode an encoded SARIF URI exactly once before validating its path. */
export function repositoryPath(uri) {
  assert(
    typeof uri === 'string' && uri.length > 0,
    'Missing CodeQL source path',
  );
  return validateRepositoryPath(decodeURIComponent(uri));
}

/** extraSources contains decoded repository paths derived from archive source maps. */
export function createSecurityScope(roots = packageRoots, extraSources = []) {
  assert(
    Array.isArray(roots) && roots.length > 0,
    'Missing release package scope',
  );
  for (const root of roots)
    assert(
      /^workspaces\/[a-z0-9-]+\/plugins\/[a-z0-9-]+$/.test(root),
      'Invalid release package scope',
    );
  return {
    policy: securityPolicy,
    paths: [
      ...new Set([
        ...roots.map(root => `${root}/`),
        ...releaseInputs,
        ...extraSources
          .map(validateRepositoryPath)
          .filter(path => !roots.some(root => path.startsWith(`${root}/`))),
      ]),
    ].sort(),
  };
}

export const scopeDigest = scope =>
  createHash('sha256').update(JSON.stringify(scope)).digest('hex');

/** Include repository code bundled from outside a package's own root. */
export function sourceMapPaths(map, packageRoot, mapPath) {
  if (map.sections)
    return map.sections.flatMap(section =>
      sourceMapPaths(section.map, packageRoot, mapPath),
    );
  assert(Array.isArray(map.sources), 'Missing archive source-map sources');
  const sourceRoot = decodeURIComponent(map.sourceRoot ?? '');
  assert(
    !/[:\\]/.test(sourceRoot) && !posix.isAbsolute(sourceRoot),
    'Unsupported archive source root',
  );
  return map.sources.flatMap(source => {
    assert(typeof source === 'string', 'Invalid archive source-map source');
    let relative = decodeURIComponent(source);
    const webpack = relative.startsWith('webpack://');
    if (webpack) {
      relative = relative.replace(/^webpack:\/\/[^/]*\//, '');
      if (relative.startsWith('webpack/') || relative === '==void 0') return []; // Generated bundler runtime.
    }
    assert(
      !/[:\\?#\x00-\x1f]/.test(relative) && !relative.startsWith('/'),
      'Unsupported archive source-map path',
    );
    const path = posix.normalize(
      posix.join(
        packageRoot,
        webpack ? '' : posix.dirname(mapPath),
        sourceRoot,
        relative,
      ),
    );
    // Registry dependencies are covered by the consumer dependency audit.
    if (path.split('/').includes('node_modules')) return [];
    return [validateRepositoryPath(path)];
  });
}

/** Recompute scope from the reviewed allowlist and the exact hashed archive bytes. */
export function archiveSecurityScope(directory, report) {
  const extra = [];
  for (const candidate of report.packages) {
    const archive = verifyArchiveDigest(directory, candidate);
    const tar = args =>
      execFileSync('tar', [...args, archive], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
    const entries = tar(['-tzf']).trim().split('\n');
    for (const entry of entries)
      assert(
        entry.startsWith('package/') &&
          !entry.includes('\\') &&
          !entry.split('/').includes('..'),
        'Unsafe scoped archive entry',
      );
    const extract = entry =>
      execFileSync('tar', ['-xOf', archive, entry], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
    const manifest = JSON.parse(extract('package/package.json'));
    assert.equal(
      manifest.name,
      candidate.name,
      'Security archive package mismatch',
    );
    const root = manifest.repository?.directory;
    assert(
      packageRoots.includes(root),
      'Archive outside release package scope',
    );
    for (const entry of entries.filter(path => path.endsWith('.map'))) {
      extra.push(
        ...sourceMapPaths(
          JSON.parse(extract(entry)),
          root,
          entry.slice('package/'.length),
        ),
      );
    }
  }
  return createSecurityScope(packageRoots, extra);
}

function artifactPaths(artifact, run) {
  assert(
    artifact && typeof artifact === 'object',
    'Missing CodeQL source location',
  );
  if (artifact.uriBaseId !== undefined)
    throw new Error('Unclassifiable CodeQL source base');
  const paths =
    artifact.uri === undefined ? [] : [repositoryPath(artifact.uri)];
  if (artifact.index !== undefined) {
    assert(
      Number.isSafeInteger(artifact.index) && artifact.index >= 0,
      'Invalid CodeQL artifact index',
    );
    const indexed = run.artifacts?.[artifact.index]?.location;
    if (indexed !== undefined) {
      assert(
        indexed.uri !== undefined && indexed.uriBaseId === undefined,
        'Unclassifiable CodeQL artifact index',
      );
      // GitHub SARIF can contain different explicit and indexed paths. Include
      // both conservatively so neither can hide a release-scoped finding.
      paths.push(repositoryPath(indexed.uri));
    }
  }
  assert(paths.length > 0, 'Missing CodeQL source path');
  return paths;
}

/** Examine primary/related locations, fixes and complete data-flow paths. */
export function findingInScope(result, run, scope) {
  const paths = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.artifactLocation !== undefined)
      paths.push(...artifactPaths(value.artifactLocation, run));
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  }
  visit(result);
  assert(
    paths.length > 0,
    'Unclassifiable CodeQL finding without source locations',
  );
  return paths.some(path =>
    scope.paths.some(entry =>
      entry.endsWith('/') ? path.startsWith(entry) : path === entry,
    ),
  );
}
