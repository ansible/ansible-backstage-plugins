import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';

const version = '0.1.0-alpha.0';
const sha = 'a'.repeat(40);
const json = (path, data) => writeFileSync(path, JSON.stringify(data));
const digest = path =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
const oidc = {
  GITHUB_ACTIONS: 'true',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REPOSITORY: 'ansible/ansible-backstage-plugins',
  GITHUB_REF: 'refs/heads/main',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.invalid',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-context',
};

function releaseFixture(t, ref = 'refs/heads/main') {
  const root = mkdtempSync(join(tmpdir(), 'sdk-publish-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const scripts = join(root, 'scripts/sdk-package-validation');
  mkdirSync(scripts, { recursive: true });
  for (const name of [
    'publish.mjs',
    'release.mjs',
    'validate-archive.mjs',
    'sbom.mjs',
    'security.mjs',
  ]) {
    copyFileSync(new URL(name, import.meta.url), join(scripts, name));
  }
  writeFileSync(join(root, 'LICENSE'), 'test license');
  const directory = join(root, 'release');
  mkdirSync(join(directory, 'artifacts'), { recursive: true });
  mkdirSync(join(directory, 'sboms'));
  mkdirSync(join(root, 'package'));
  const candidates = [];
  const index = [];
  const paths = [];
  // Deliberately list the consumer first so sorting bugs cannot pass by accident.
  for (const name of ['example', 'common']) {
    const path = `workspaces/portal-core/plugins/${name}`;
    paths.push(path);
    mkdirSync(join(root, path), { recursive: true });
    const manifest = {
      name: `@ansible/${name}`,
      version,
      private: false,
      license: 'Apache-2.0',
      publishConfig: { access: 'public' },
      repository: {
        type: 'git',
        url: 'https://github.com/ansible/ansible-backstage-plugins.git',
        directory: path,
      },
      main: 'index.js',
      types: 'index.d.ts',
      ...(name === 'example'
        ? { dependencies: { '@ansible/common': version } }
        : {}),
    };
    json(join(root, path, 'package.json'), manifest);
    json(join(root, 'package/package.json'), manifest);
    for (const file of ['LICENSE', 'index.js', 'index.d.ts'])
      writeFileSync(
        join(root, 'package', file),
        file === 'LICENSE' ? 'test license' : '',
      );
    const archive = join(directory, `artifacts/${name}.tgz`);
    execFileSync('tar', ['-czf', archive, '-C', root, 'package']);
    const candidate = { name: manifest.name, version, sha256: digest(archive) };
    candidates.push(candidate);
    const sbomName = `${name}.spdx.json`;
    const sbom = join(directory, 'sboms', sbomName);
    json(sbom, {
      spdxVersion: 'SPDX-2.3',
      packages: [
        {
          name: manifest.name,
          versionInfo: version,
          externalRefs: [
            {
              referenceType: 'purl',
              referenceLocator: `pkg:npm/${manifest.name}@${version}`,
            },
          ],
        },
      ],
    });
    index.push({
      name: manifest.name,
      version,
      archiveSha256: candidate.sha256,
      sbom: sbomName,
      sbomSha256: digest(sbom),
    });
  }
  json(join(scripts, 'packages.json'), paths);
  const report = {
    commit: sha,
    includesUncommittedChanges: false,
    packages: candidates,
  };
  json(join(directory, 'report.json'), report);
  json(join(directory, 'sboms/index.json'), index);
  const security = join(directory, 'security');
  mkdirSync(security);
  const securityFiles = [];
  for (const [offset, category] of [
    '/language:javascript-typescript',
    '/language:actions',
  ].entries()) {
    const id = offset + 1;
    const metadata = `codeql-${id}.metadata.json`;
    const sarif = `codeql-${id}.sarif.json`;
    json(join(security, metadata), {
      analysis_key: 'codeql-default-setup',
      id,
      category,
      commit_sha: sha,
      ref,
      tool: { name: 'CodeQL' },
      rules_count: 1,
      results_count: 0,
      error: '',
    });
    json(join(security, sarif), {
      version: '2.1.0',
      runs: [{ tool: { driver: { name: 'CodeQL' } }, results: [] }],
    });
    securityFiles.push(metadata, sarif);
  }
  writeFileSync(
    join(security, 'consumer.yarn.lock'),
    'isolated consumer lockfile',
  );
  writeFileSync(
    join(security, 'yarn-audit.ndjson'),
    JSON.stringify({ type: 'info', data: 'No audit suggestions' }),
  );
  securityFiles.push('consumer.yarn.lock', 'yarn-audit.ndjson');
  json(join(security, 'report.json'), {
    commit: sha,
    ref,
    policy: 'block-all-findings',
    packages: candidates,
    auditExitCode: 0,
    files: securityFiles.map(name => ({
      name,
      sha256: digest(join(security, name)),
    })),
  });

  const events = join(root, 'events.jsonl');
  const preload = join(root, 'registry-stub.mjs');
  writeFileSync(
    preload,
    String.raw`
    import assert from 'node:assert/strict';
    import { appendFileSync } from 'node:fs';
    globalThis.fetch = async url => {
      assert(url.startsWith('https://registry.npmjs.org/'));
      const name = decodeURIComponent(new URL(url).pathname.slice(1));
      appendFileSync(process.env.PUBLISH_EVENTS, JSON.stringify({ kind: 'precheck', name, url }) + '\n');
      const failing = name === '@ansible/example';
      const exists = failing && process.env.REGISTRY_CASE === 'existing';
      return new Response(JSON.stringify({ versions: exists ? { [process.env.SDK_RELEASE_VERSION]: {} } : {} }), {
        status: failing && process.env.REGISTRY_CASE === 'missing' ? 404 : 200,
      });
    };
  `,
  );
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'npm'),
    String.raw`#!${process.execPath}
    const { appendFileSync } = require('node:fs');
    appendFileSync(process.env.PUBLISH_EVENTS, JSON.stringify({ kind: 'publish', args: process.argv.slice(2) }) + '\n');
  `,
    { mode: 0o755 },
  );

  return {
    directory,
    report,
    index,
    run(args = [], env = {}) {
      writeFileSync(events, '');
      // Every invocation stubs fetch and npm, including rejection tests: no registry writes.
      const result = spawnSync(
        process.execPath,
        ['--import', preload, join(scripts, 'publish.mjs'), ...args],
        {
          encoding: 'utf8',
          env: {
            PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
            PUBLISH_EVENTS: events,
            SDK_VALIDATION_DIR: directory,
            SDK_RELEASE_VERSION: version,
            GITHUB_SHA: sha,
            GITHUB_REF: ref,
            ...env,
          },
        },
      );
      return {
        ...result,
        events: readFileSync(events, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line)),
      };
    },
  };
}

test('publisher validates real archives and fails closed on tampering', t => {
  const fixture = releaseFixture(t);
  const { directory, report, index, run } = fixture;
  assert.equal(run().status, 0);
  assert.notEqual(
    run(['--publish']).status,
    0,
    'Publishing requires GitHub OIDC context',
  );
  for (const key of ['NPM_TOKEN', 'NODE_AUTH_TOKEN']) {
    assert.match(
      run(['--publish'], { ...oidc, [key]: 'forbidden-test-credential' })
        .stderr,
      /Static npm authentication/,
    );
  }
  json(join(directory, 'report.json'), { ...report, commit: 'b'.repeat(40) });
  assert.match(run().stderr, /revision mismatch/);
  json(join(directory, 'report.json'), {
    ...report,
    includesUncommittedChanges: true,
  });
  assert.match(run().stderr, /clean release commit/);
  json(join(directory, 'report.json'), report);
  const securityReport = join(directory, 'security/report.json');
  const originalSecurity = readFileSync(securityReport, 'utf8');
  rmSync(securityReport);
  assert.match(run().stderr, /ENOENT/);
  writeFileSync(securityReport, originalSecurity);
  const changedSecurity = JSON.parse(originalSecurity);
  changedSecurity.commit = 'b'.repeat(40);
  json(securityReport, changedSecurity);
  assert.match(run().stderr, /Security source revision mismatch/);
  writeFileSync(securityReport, originalSecurity);
  const sarifPath = join(directory, 'security/codeql-1.sarif.json');
  const originalSarif = readFileSync(sarifPath, 'utf8');
  writeFileSync(sarifPath, '{}');
  assert.match(run().stderr, /Security evidence changed/);
  writeFileSync(sarifPath, originalSarif);
  const sbom = join(directory, 'sboms/example.spdx.json');
  writeFileSync(sbom, '{}');
  assert.match(run().stderr, /AssertionError/);
  // A matching digest must not make an SBOM for a different package acceptable.
  json(sbom, {
    spdxVersion: 'SPDX-2.3',
    packages: [
      {
        name: '@ansible/unrelated',
        versionInfo: version,
        externalRefs: [
          {
            referenceType: 'purl',
            referenceLocator: `pkg:npm/@ansible/unrelated@${version}`,
          },
        ],
      },
    ],
  });
  index[0].sbomSha256 = digest(sbom);
  json(join(directory, 'sboms/index.json'), index);
  assert.match(run().stderr, /SBOM does not describe the packed npm package/);
  writeFileSync(join(directory, 'artifacts/example.tgz'), 'tampered');
  assert.match(run().stderr, /archive changed/);
});

test('checks the entire registry set before publishing exact archives in dependency order', t => {
  const { directory, run } = releaseFixture(t);
  const result = run(['--publish'], oidc);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.events, [
    ...['common', 'example'].map(name => ({
      kind: 'precheck',
      name: `@ansible/${name}`,
      url: `https://registry.npmjs.org/${encodeURIComponent(
        `@ansible/${name}`,
      )}`,
    })),
    ...['common', 'example'].map(name => ({
      kind: 'publish',
      args: [
        'publish',
        join(directory, `artifacts/${name}.tgz`),
        '--registry',
        'https://registry.npmjs.org/',
        '--access',
        'public',
        '--tag',
        'next',
        '--provenance',
        '--ignore-scripts',
      ],
    })),
  ]);
});

for (const scenario of ['missing', 'existing']) {
  test(`a ${scenario} package stops the release before any npm invocation`, t => {
    const { run } = releaseFixture(t);
    const result = run(['--publish'], { ...oidc, REGISTRY_CASE: scenario });
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      scenario === 'missing' ? /package must already exist/ : /already exists/,
    );
    assert.deepEqual(
      result.events.map(event => event.kind),
      ['precheck', 'precheck'],
    );
  });
}

test('publishes release-branch archives only with evidence from that same branch', t => {
  const ref = 'refs/heads/release-2.1';
  const { run } = releaseFixture(t, ref);
  const success = run(['--publish'], { ...oidc, GITHUB_REF: ref });
  assert.equal(success.status, 0, success.stderr);
  assert.equal(
    success.events.filter(event => event.kind === 'publish').length,
    2,
  );
  const mismatch = run(['--publish'], oidc);
  assert.match(mismatch.stderr, /Security source branch mismatch/);
  assert.deepEqual(mismatch.events, []);
});

test('rejects unapproved branch and tag refs before registry access', t => {
  const { run } = releaseFixture(t);
  for (const ref of [
    'refs/heads/feature/example',
    'refs/heads/release-',
    'refs/heads/release-2.1/hotfix',
    'refs/tags/release-2.1',
  ]) {
    const result = run(['--publish'], { ...oidc, GITHUB_REF: ref });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Release requires/);
    assert.deepEqual(result.events, []);
  }
});
