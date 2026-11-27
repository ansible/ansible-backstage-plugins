import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { securityPolicy } from './security-scope.mjs';
import { emptyAuditExceptions } from './audit-exceptions.mjs';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import {
  selectCodeqlAnalyses,
  verifyAudit,
  verifyCodeql,
  collectSecurityEvidence as collectEvidence,
  verifySecurityEvidence as verifyEvidence,
} from './security.mjs';

// These synthetic releases have their own graph and no reviewed exceptions.
const collectSecurityEvidence = (
  directory,
  commit,
  token,
  sourceRef,
  options,
) =>
  collectEvidence(directory, commit, token, sourceRef, {
    ...options,
    auditExceptions: emptyAuditExceptions(),
  });
const verifySecurityEvidence = (directory, report, sourceRef) =>
  verifyEvidence(directory, report, sourceRef, {
    auditExceptions: emptyAuditExceptions(),
  });

const finding = (
  level = 'warning',
  path = 'workspaces/portal-core/plugins/portal-plugin-node/src/index.ts',
) => ({
  ruleId: 'test-rule',
  level,
  locations: [{ physicalLocation: { artifactLocation: { uri: path } } }],
});
const sha = 'a'.repeat(40);
const ref = 'refs/heads/main';
const analysis = (
  category = '/language:javascript-typescript',
  sourceRef = ref,
) => ({
  analysis_key: 'codeql-default-setup',
  id: 1,
  category,
  commit_sha: sha,
  ref: sourceRef,
  tool: { name: 'CodeQL' },
  error: '',
  warning: '',
  rules_count: 10,
  results_count: 0,
});
const sarif = () => ({
  version: '2.1.0',
  runs: [{ tool: { driver: { name: 'CodeQL' } }, results: [] }],
});

test('requires both CodeQL categories on the exact release SHA and selected branch ref', () => {
  const js = analysis();
  const actions = { ...analysis('/language:actions'), id: 2 };
  assert.equal(selectCodeqlAnalyses([js], sha, ref), undefined);
  assert.equal(
    selectCodeqlAnalyses(
      [js, { ...actions, commit_sha: 'b'.repeat(40) }],
      sha,
      ref,
    ),
    undefined,
  );
  assert.equal(
    selectCodeqlAnalyses(
      [js, { ...actions, ref: 'refs/pull/1/merge' }],
      sha,
      ref,
    ),
    undefined,
  );
  assert.deepEqual(
    selectCodeqlAnalyses([js, actions, { ...js, id: 3 }], sha, ref).map(
      a => a.id,
    ),
    [3, 2],
  );
  assert.equal(
    selectCodeqlAnalyses(
      [
        js,
        actions,
        { ...js, id: 4, analysis_key: 'another-codeql-configuration' },
      ],
      sha,
      ref,
    ).length,
    3,
  );
});

test('CodeQL gate accepts complete zero-finding results only', () => {
  verifyCodeql(analysis(), sarif(), sha, ref);
  for (const level of ['note', 'warning', 'error']) {
    const document = sarif();
    document.runs[0].results.push(finding(level));
    assert.throws(
      () =>
        verifyCodeql({ ...analysis(), results_count: 1 }, document, sha, ref),
      /findings block publication/,
    );
  }
  for (const changes of [
    { error: 'scan failed' },
    { warning: 'partial extraction' },
    { rules_count: 0 },
    { results_count: 1 },
    { commit_sha: 'b'.repeat(40) },
  ]) {
    assert.throws(() =>
      verifyCodeql({ ...analysis(), ...changes }, sarif(), sha, ref),
    );
  }
  assert.throws(
    () => verifyCodeql(analysis(), { ...sarif(), runs: [] }, sha, ref),
    /Missing CodeQL runs/,
  );
  const failed = sarif();
  failed.runs[0].invocations = [{ executionSuccessful: false }];
  assert.throws(
    () => verifyCodeql(analysis(), failed, sha, ref),
    /execution failed/,
  );
});

test('never substitutes another branch even when it has the same release SHA', () => {
  const releaseRef = 'refs/heads/release-2.1';
  const js = analysis(undefined, releaseRef);
  const actions = { ...analysis('/language:actions', releaseRef), id: 2 };
  assert.deepEqual(selectCodeqlAnalyses([js, actions], sha, releaseRef), [
    js,
    actions,
  ]);
  assert.equal(selectCodeqlAnalyses([js, actions], sha, ref), undefined);
  assert.equal(
    selectCodeqlAnalyses([analysis(), actions], sha, releaseRef),
    undefined,
  );
  verifyCodeql(js, sarif(), sha, releaseRef);
  assert.throws(
    () => verifyCodeql(js, sarif(), sha, ref),
    /source branch mismatch/,
  );
  assert.throws(
    () => selectCodeqlAnalyses([js, actions], sha, 'refs/tags/release-2.1'),
    /Release/,
  );
});

test('dependency audit fails closed on findings, scanner errors and malformed output', () => {
  verifyAudit('', 0);
  verifyAudit(
    JSON.stringify({ type: 'info', data: 'No audit suggestions' }),
    0,
  );
  for (const status of [1, 2, null])
    assert.throws(() => verifyAudit('{}', status), /audit failed/);
  for (const output of [
    'not json',
    '{}',
    JSON.stringify({ type: 'error', data: 'registry unavailable' }),
  ]) {
    assert.throws(() => verifyAudit(output, 0));
  }
});

for (const ref of ['refs/heads/main', 'refs/heads/release-2.1']) {
  test(`collects and binds scans on ${ref} and removes stale passing evidence on failure`, async t => {
    const folder = mkdtempSync(join(tmpdir(), 'sdk-security-test-'));
    const previousPath = process.env.PATH;
    t.after(() => {
      process.env.PATH = previousPath;
      rmSync(folder, { recursive: true, force: true });
    });
    for (const path of ['artifacts', 'consumer', 'bin'])
      mkdirSync(join(folder, path));
    mkdirSync(join(folder, 'package'));
    writeFileSync(
      join(folder, 'package/package.json'),
      JSON.stringify({
        name: '@ansible/example',
        repository: {
          directory: 'workspaces/portal-core/plugins/portal-plugin-node',
        },
      }),
    );
    execFileSync('tar', [
      '-czf',
      join(folder, 'artifacts/example.tgz'),
      '-C',
      folder,
      'package',
    ]);
    const archive = readFileSync(join(folder, 'artifacts/example.tgz'));
    const report = {
      commit: sha,
      includesUncommittedChanges: false,
      packages: [
        {
          name: '@ansible/example',
          version: '0.1.0-alpha.0',
          sha256: createHash('sha256').update(archive).digest('hex'),
        },
      ],
    };
    writeFileSync(join(folder, 'report.json'), JSON.stringify(report));
    writeFileSync(join(folder, 'consumer/yarn.lock'), 'consumer lock');
    writeFileSync(
      join(folder, 'bin/corepack'),
      String.raw`#!${process.execPath}
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    assert.deepEqual(process.argv.slice(2), ['yarn','npm','audit','--recursive','--environment','production','--severity','info','--no-deprecations','--json']);
    assert.equal(process.env.GH_TOKEN, '');
    assert.equal(process.env.YARN_ENABLE_SCRIPTS, 'false');
    if (fs.existsSync('audit-fails')) { console.log('{}'); process.exitCode = 1; }
    if (fs.existsSync('audit-findings.json')) { console.log(fs.readFileSync('audit-findings.json', 'utf8')); process.exitCode = 1; }
    if (fs.existsSync('audit-diagnostics')) { console.error('partial registry failure'); }
  `,
      { mode: 0o755 },
    );
    process.env.PATH = `${join(folder, 'bin')}${delimiter}${previousPath}`;
    let findings = false;
    let outsideFindings = false;
    let unavailable = false;
    let downloadUnavailable = false;
    let paginated = false;
    let searchLimit = false;
    let missingActions = false;
    let polls = 0;
    t.mock.method(globalThis, 'fetch', async url => {
      const analyses = [
        analysis(undefined, ref),
        { ...analysis('/language:actions', ref), id: 2 },
      ];
      analyses[0].results_count = findings || outsideFindings ? 1 : 0;
      if (unavailable || (downloadUnavailable && url.endsWith('/2')))
        return new Response('{}', { status: 403 });
      if (url.includes('analyses?')) {
        polls++;
        assert.equal(new URL(url).searchParams.get('ref'), ref);
        const page = Number(new URL(url).searchParams.get('page'));
        if (searchLimit || (paginated && page === 1)) {
          return new Response(
            JSON.stringify(
              Array.from({ length: 100 }, (_, i) => ({
                ...analysis(),
                id: 100 + i,
                commit_sha: 'b'.repeat(40),
              })),
            ),
          );
        }
        assert.equal(page, paginated ? 2 : 1);
        return new Response(
          JSON.stringify(missingActions ? analyses.slice(0, 1) : analyses),
        );
      }
      const document = sarif();
      if ((findings || outsideFindings) && url.endsWith('/1'))
        document.runs[0].results.push({
          ...finding(
            'note',
            outsideFindings
              ? 'workspaces/feature/plugins/example/index.ts'
              : undefined,
          ),
          message: { text: 'restricted-detail-sentinel' },
        });
      return new Response(JSON.stringify(document));
    });
    await collectSecurityEvidence(folder, sha, 'test-read-token', ref);
    verifySecurityEvidence(folder, report, ref);
    const evidence = JSON.parse(
      readFileSync(join(folder, 'security/report.json'), 'utf8'),
    );
    assert.equal(evidence.policy, securityPolicy);
    assert.equal(evidence.ref, ref);
    const otherRef =
      ref === 'refs/heads/main' ? 'refs/heads/release-2.1' : 'refs/heads/main';
    assert.throws(
      () => verifySecurityEvidence(folder, report, otherRef),
      /Security source branch mismatch/,
    );
    assert(evidence.files.some(file => file.name === 'consumer.yarn.lock'));
    const exceptions = {
      schemaVersion: 1,
      consumerLockSha256: createHash('sha256')
        .update('consumer lock')
        .digest('hex'),
      exceptions: [
        {
          advisory: 'GHSA-x7hr-w5r2-h6wg',
          package: 'prismjs',
          versions: ['1.27.0'],
          severity: 'moderate',
          disposition: 'risk-accepted',
          owner: '@ansible/automation-portal-engineers',
          createdOn: new Date().toISOString().slice(0, 10),
          expiresOn: new Date(Date.now() + 7 * 86400000)
            .toISOString()
            .slice(0, 10),
          rationale:
            'An explicit preview risk decision for this synthetic release, retained for publisher verification.',
          evidence: ['https://github.com/wooorm/refractor/pull/82'],
        },
      ],
    };
    writeFileSync(
      join(folder, 'consumer/audit-findings.json'),
      JSON.stringify({
        value: 'prismjs',
        children: {
          ID: 1105770,
          Issue: 'DOM clobbering',
          URL: 'https://github.com/advisories/GHSA-x7hr-w5r2-h6wg',
          Severity: 'moderate',
          'Vulnerable Versions': '<1.30.0',
          'Tree Versions': ['1.27.0'],
          Dependents: ['refractor@npm:3.6.0'],
        },
      }),
    );
    await collectEvidence(folder, sha, 'test-read-token', ref, {
      auditExceptions: exceptions,
    });
    verifyEvidence(folder, report, ref, { auditExceptions: exceptions });
    assert.equal(
      JSON.parse(readFileSync(join(folder, 'security/report.json')))
        .auditExitCode,
      1,
    );
    assert.equal(
      JSON.parse(
        readFileSync(join(folder, 'security/dependency-audit.summary.json')),
      ).acceptedFindings,
      1,
    );
    assert.throws(
      () => verifySecurityEvidence(folder, report, ref),
      /findings block/,
    );
    const changedPolicy = structuredClone(exceptions);
    changedPolicy.exceptions[0].rationale += ' A different decision.';
    assert.throws(
      () =>
        verifyEvidence(folder, report, ref, { auditExceptions: changedPolicy }),
      /assessment mismatch/,
    );
    writeFileSync(join(folder, 'consumer/audit-diagnostics'), '');
    await assert.rejects(
      collectEvidence(folder, sha, 'test-read-token', ref, {
        auditExceptions: exceptions,
      }),
      /scan completeness/,
    );
    assert.equal(existsSync(join(folder, 'security/report.json')), false);
    rmSync(join(folder, 'consumer/audit-diagnostics'));
    rmSync(join(folder, 'consumer/audit-findings.json'));
    outsideFindings = true;
    await collectSecurityEvidence(folder, sha, 'test-read-token', ref);
    verifySecurityEvidence(folder, report, ref);
    const scopedEvidence = JSON.parse(
      readFileSync(join(folder, 'security/report.json'), 'utf8'),
    );
    for (const file of scopedEvidence.files) {
      assert(!file.name.endsWith('.sarif.json'));
      assert(
        !readFileSync(join(folder, 'security', file.name), 'utf8').includes(
          'restricted-detail-sentinel',
        ),
      );
    }
    assert.equal(
      JSON.parse(readFileSync(join(folder, 'security/codeql-1.summary.json')))
        .excludedFindings,
      1,
    );
    outsideFindings = false;
    findings = true;
    await assert.rejects(
      collectSecurityEvidence(folder, sha, 'test-read-token', ref),
      /CodeQL findings block/,
    );
    assert.equal(existsSync(join(folder, 'security/report.json')), false);
    assert.deepEqual(
      JSON.parse(
        readFileSync(join(folder, 'security/scan-status.json'), 'utf8'),
      ),
      { commit: sha, ref, sast: 'failed', sca: 'passed' },
    );
    findings = false;
    writeFileSync(join(folder, 'consumer/audit-fails'), '');
    await assert.rejects(
      collectSecurityEvidence(folder, sha, 'test-read-token', ref),
      /Dependency audit failed/,
    );
    assert.equal(existsSync(join(folder, 'security/report.json')), false);
    rmSync(join(folder, 'consumer/audit-fails'));
    downloadUnavailable = true;
    await assert.rejects(
      collectSecurityEvidence(folder, sha, 'test-read-token', ref),
      /CodeQL API unavailable/,
    );
    assert.deepEqual(
      JSON.parse(
        readFileSync(join(folder, 'security/scan-status.json'), 'utf8'),
      ),
      { commit: sha, ref, sast: 'failed', sca: 'passed' },
    );
    assert.equal(existsSync(join(folder, 'security/report.json')), false);
    downloadUnavailable = false;
    paginated = true;
    await collectSecurityEvidence(folder, sha, 'test-read-token', ref);
    verifySecurityEvidence(folder, report, ref);
    searchLimit = true;
    await assert.rejects(
      collectSecurityEvidence(folder, sha, 'test-read-token', ref),
      /search limit exceeded/,
    );
    assert.equal(existsSync(join(folder, 'security/report.json')), false);
    unavailable = true;
    await assert.rejects(
      collectSecurityEvidence(folder, sha, 'test-read-token', ref),
      /CodeQL API unavailable/,
    );
    unavailable = false;
    paginated = false;
    searchLimit = false;
    await t.test(
      'missing scans exhaust finite polling without a passing handoff',
      async () => {
        missingActions = true;
        polls = 0;
        await assert.rejects(
          collectSecurityEvidence(folder, sha, 'test-read-token', ref, {
            attempts: 2,
            delayMs: 0,
          }),
          /Missing CodeQL analyses/,
        );
        assert.equal(polls, 2);
        assert.deepEqual(
          JSON.parse(
            readFileSync(join(folder, 'security/scan-status.json'), 'utf8'),
          ),
          { commit: sha, ref, sast: 'failed', sca: 'passed' },
        );
        assert.equal(existsSync(join(folder, 'security/report.json')), false);
        missingActions = false;
        polls = 0;
        await collectSecurityEvidence(folder, sha, 'test-read-token', ref, {
          attempts: 2,
          delayMs: 0,
        });
        assert.equal(polls, 1, 'Complete scans stop polling immediately');
        verifySecurityEvidence(folder, report, ref);
      },
    );
  });
}

test('accepts prefixed language categories while retaining every configuration', () => {
  const js = {
    ...analysis(),
    category: 'release/language:javascript-typescript',
  };
  const actions = {
    ...analysis('/language:actions'),
    id: 2,
    category: 'release/language:actions',
  };
  assert.deepEqual(selectCodeqlAnalyses([js, actions], sha, ref), [
    js,
    actions,
  ]);
  const extra = { ...js, id: 3, analysis_key: 'another-configuration' };
  assert.deepEqual(selectCodeqlAnalyses([js, actions, extra], sha, ref), [
    js,
    actions,
    extra,
  ]);
  assert.throws(
    () =>
      verifyCodeql(
        { ...extra, results_count: 1 },
        {
          ...sarif(),
          runs: [
            {
              tool: { driver: { name: 'CodeQL' } },
              results: [finding('note')],
            },
          ],
        },
        sha,
        ref,
      ),
    /findings block/,
  );
  assert.equal(
    selectCodeqlAnalyses(
      [js, { ...actions, category: 'release/language:actions-extra' }],
      sha,
      ref,
    ),
    undefined,
  );
});
