import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
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
  collectSecurityEvidence,
  verifySecurityEvidence,
} from './security.mjs';

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
    document.runs[0].results.push({ ruleId: 'test-rule', level });
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
    const archive = Buffer.from('validated archive fixture');
    writeFileSync(join(folder, 'artifacts/example.tgz'), archive);
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
  `,
      { mode: 0o755 },
    );
    process.env.PATH = `${join(folder, 'bin')}${delimiter}${previousPath}`;
    let findings = false;
    let unavailable = false;
    t.mock.method(globalThis, 'fetch', async url => {
      const analyses = [
        analysis(undefined, ref),
        { ...analysis('/language:actions', ref), id: 2 },
      ];
      analyses[0].results_count = findings ? 1 : 0;
      if (unavailable) return new Response('{}', { status: 403 });
      if (url.includes('analyses?')) {
        assert.equal(new URL(url).searchParams.get('ref'), ref);
        return new Response(JSON.stringify(analyses));
      }
      const document = sarif();
      if (findings && url.endsWith('/1'))
        document.runs[0].results.push({ ruleId: 'example', level: 'note' });
      return new Response(JSON.stringify(document));
    });
    await collectSecurityEvidence(folder, sha, 'test-read-token', ref);
    verifySecurityEvidence(folder, report, ref);
    const evidence = JSON.parse(
      readFileSync(join(folder, 'security/report.json'), 'utf8'),
    );
    assert.equal(evidence.policy, 'block-all-findings');
    assert.equal(evidence.ref, ref);
    const otherRef =
      ref === 'refs/heads/main' ? 'refs/heads/release-2.1' : 'refs/heads/main';
    assert.throws(
      () => verifySecurityEvidence(folder, report, otherRef),
      /Security source branch mismatch/,
    );
    assert(evidence.files.some(file => file.name === 'consumer.yarn.lock'));
    findings = true;
    await assert.rejects(
      collectSecurityEvidence(folder, sha, 'test-read-token', ref),
      /CodeQL findings block/,
    );
    assert.equal(existsSync(join(folder, 'security/report.json')), false);
    assert.match(
      readFileSync(join(folder, 'security/scan-status.json'), 'utf8'),
      /CodeQL findings block/,
    );
    findings = false;
    writeFileSync(join(folder, 'consumer/audit-fails'), '');
    await assert.rejects(
      collectSecurityEvidence(folder, sha, 'test-read-token', ref),
      /Dependency audit failed/,
    );
    assert.equal(existsSync(join(folder, 'security/report.json')), false);
    unavailable = true;
    await assert.rejects(
      collectSecurityEvidence(folder, sha, 'test-read-token', ref),
      /CodeQL API unavailable/,
    );
  });
}
