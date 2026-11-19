import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSecurityScope,
  findingInScope,
  repositoryPath,
  sourceMapPaths,
} from './security-scope.mjs';
import { verifyCodeql } from './security.mjs';

const root = 'workspaces/portal-core/plugins/portal-plugin-node';
const scope = createSecurityScope();
const location = uri => ({ physicalLocation: { artifactLocation: { uri } } });
const result = uri => ({
  ruleId: 'example',
  level: 'note',
  locations: [location(uri)],
});
const sha = 'a'.repeat(40);
const ref = 'refs/heads/main';
const metadata = count => ({
  commit_sha: sha,
  ref,
  tool: { name: 'CodeQL' },
  rules_count: 1,
  results_count: count,
});
const sarif = results => ({
  version: '2.1.0',
  runs: [{ tool: { driver: { name: 'CodeQL' } }, results }],
});

test('package roots and release tooling block findings at every severity', () => {
  for (const path of [
    `${root}/src/index.ts`,
    'scripts/sdk-package-validation/security.mjs',
    '.github/workflows/sdk-package-publish.yml',
    '.github/workflows/sdk-package-validation-run.yml',
    '.github/actions/local/action.yml',
    'scripts/test-with-console-log.sh',
    'package.json',
    '.config/build.js',
  ]) {
    for (const level of ['note', 'warning', 'error'])
      assert.throws(
        () =>
          verifyCodeql(
            metadata(1),
            sarif([{ ...result(path), level }]),
            sha,
            ref,
            scope,
          ),
        /findings block/,
      );
  }
});

test('unrelated plugins and workflows remain reported but do not block this release', () => {
  const paths = [
    'workspaces/content-management/plugins/automation-content-common/src/oci/OCITransportPolicy.test.ts',
    'workspaces/content-development/plugins/portal-scaffolder-react/src/utils/parseMarkdownLinks.tsx',
    'workspaces/aap/plugins/backstage-rhaap/src/components/CatalogContent/CatalogContent.test.tsx',
    'e2e-tests/playwright/global-setup.ts',
    '.github/workflows/code-quality.yml',
    '.github/workflows/pr.yml',
    `${root}-other/src/index.ts`,
  ];
  const summary = verifyCodeql(
    metadata(paths.length),
    sarif(paths.map(result)),
    sha,
    ref,
    scope,
  );
  assert.equal(summary.excludedFindings, paths.length);
  assert.equal(summary.blockingFindings, 0);
  assert(!JSON.stringify(summary).includes('OCITransportPolicy'));
});

test('data flows and related locations inside the release boundary block outside primary findings', () => {
  const outside = result('workspaces/feature/plugins/example/index.ts');
  const inside = location(`${root}/src/operations.ts`);
  assert(findingInScope({ ...outside, relatedLocations: [inside] }, {}, scope));
  assert(
    findingInScope(
      {
        ...outside,
        codeFlows: [{ threadFlows: [{ locations: [{ location: inside }] }] }],
      },
      {},
      scope,
    ),
  );
  const indexed = {
    locations: [{ physicalLocation: { artifactLocation: { index: 0 } } }],
  };
  assert(
    findingInScope(
      indexed,
      { artifacts: [{ location: { uri: `${root}/src/index.ts` } }] },
      scope,
    ),
  );
});

test('missing, ambiguous and unsafe source locations fail closed', () => {
  for (const value of [
    {},
    { locations: [] },
    result('../outside.ts'),
    result('file:///unknown/index.ts'),
    result('workspaces/%2e%2e/unknown.ts'),
    { locations: [{ physicalLocation: { artifactLocation: { index: 100 } } }] },
    {
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: 'index.ts', uriBaseId: 'UNKNOWN' },
          },
        },
      ],
    },
  ]) {
    assert.throws(
      () => verifyCodeql(metadata(1), sarif([value]), sha, ref, scope),
      /CodeQL/,
    );
  }
  assert.equal(
    findingInScope(
      {
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'outside/file.ts', index: 0 },
            },
          },
        ],
      },
      { artifacts: [{ location: { uri: `${root}/src/index.ts` } }] },
      scope,
    ),
    true,
  );
  assert.equal(
    repositoryPath('./scripts/sdk-package-validation/security.mjs'),
    'scripts/sdk-package-validation/security.mjs',
  );
});

test('archive source maps extend scope to repository code outside the package root', () => {
  const external = 'workspaces/shared/plugins/helper/src/index.ts';
  const sources = sourceMapPaths(
    { sources: ['../../helper/src/index.ts'] },
    'workspaces/shared/plugins/example',
    'dist/index.js.map',
  );
  assert.deepEqual(sources, [external]);
  assert(
    findingInScope(result(external), {}, createSecurityScope([root], sources)),
  );
  assert.deepEqual(
    sourceMapPaths(
      { sources: ['webpack://example/./src/index.ts'] },
      root,
      'dist/remote.js.map',
    ),
    [`${root}/src/index.ts`],
  );
  assert.deepEqual(
    sourceMapPaths(
      {
        sources: [
          'webpack://example/../../../../node_modules/library/index.js',
          'webpack://example/webpack/bootstrap',
          'webpack://example/==void 0',
        ],
      },
      root,
      'dist/remote.js.map',
    ),
    [],
  );
  assert.throws(
    () =>
      sourceMapPaths(
        { sources: ['file:///unknown.ts'] },
        root,
        'dist/index.js.map',
      ),
    /Unsupported/,
  );
});

test('scope includes outside repository sources from real hashed tarballs', async t => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } =
    await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const { archiveSecurityScope } = await import('./security-scope.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'sdk-archive-scope-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'package/dist'), { recursive: true });
  mkdirSync(join(directory, 'artifacts'));
  writeFileSync(
    join(directory, 'package/package.json'),
    JSON.stringify({
      name: '@ansible/example',
      repository: { directory: root },
    }),
  );
  writeFileSync(
    join(directory, 'package/dist/index.js.map'),
    JSON.stringify({
      sources: ['../../../../content-development/plugins/shared/src/index.ts'],
    }),
  );
  const archive = join(directory, 'artifacts/example.tgz');
  execFileSync('tar', ['-czf', archive, '-C', directory, 'package']);
  const report = {
    packages: [
      {
        name: '@ansible/example',
        sha256: createHash('sha256')
          .update(readFileSync(archive))
          .digest('hex'),
      },
    ],
  };
  const derived = archiveSecurityScope(directory, report);
  const outside = 'workspaces/content-development/plugins/shared/src/index.ts';
  assert(derived.paths.includes(outside));
  assert.throws(
    () =>
      verifyCodeql(metadata(1), sarif([result(outside)]), sha, ref, derived),
    /findings block/,
  );
  writeFileSync(archive, 'tampered');
  assert.throws(
    () => archiveSecurityScope(directory, report),
    /archive changed/,
  );
});
