import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repository } from './release.mjs';
import { verifyArchiveDigest } from './sbom.mjs';

export const requiredCategories = [
  '/language:javascript-typescript',
  '/language:actions',
];
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const digest = path =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

export function selectCodeqlAnalyses(analyses, commit) {
  assert(Array.isArray(analyses), 'Invalid CodeQL analysis response');
  const latest = new Map();
  for (const analysis of analyses) {
    if (
      analysis.commit_sha !== commit ||
      analysis.ref !== 'refs/heads/main' ||
      analysis.tool?.name !== 'CodeQL'
    )
      continue;
    assert(
      Number.isSafeInteger(analysis.id) && analysis.id > 0,
      'Invalid analysis ID',
    );
    assert(
      typeof analysis.category === 'string' && analysis.category,
      'Missing CodeQL category',
    );
    assert(
      typeof analysis.analysis_key === 'string' && analysis.analysis_key,
      'Missing CodeQL configuration key',
    );
    const key = `${analysis.analysis_key}\0${analysis.category}`;
    if (!latest.has(key) || latest.get(key).id < analysis.id)
      latest.set(key, analysis);
  }
  if (
    !requiredCategories.every(category =>
      [...latest.values()].some(analysis => analysis.category === category),
    )
  )
    return undefined;
  return [...latest.values()];
}

export function verifyCodeql(analysis, sarif, commit) {
  assert.equal(analysis.commit_sha, commit, 'CodeQL source revision mismatch');
  assert.equal(analysis.ref, 'refs/heads/main');
  assert.equal(analysis.tool?.name, 'CodeQL');
  assert(
    !analysis.error && !analysis.warning,
    'CodeQL analysis failed or reported incomplete coverage',
  );
  assert(analysis.rules_count > 0, 'CodeQL did not run rules');
  assert.equal(sarif.version, '2.1.0', 'Invalid CodeQL SARIF');
  assert(
    Array.isArray(sarif.runs) && sarif.runs.length > 0,
    'Missing CodeQL runs',
  );
  let findings = 0;
  for (const run of sarif.runs) {
    assert.equal(run.tool?.driver?.name, 'CodeQL');
    assert(
      !run.invocations?.some(
        invocation => invocation.executionSuccessful === false,
      ),
      'CodeQL execution failed',
    );
    assert(
      run.results === undefined || Array.isArray(run.results),
      'Invalid CodeQL results',
    );
    findings += run.results?.length ?? 0;
  }
  assert.equal(
    findings,
    analysis.results_count,
    'Incomplete CodeQL result set',
  );
  assert.equal(
    findings,
    0,
    'CodeQL findings block publication (all severities)',
  );
}

export function verifyAudit(output, status) {
  assert.equal(status, 0, 'Dependency audit failed or reported findings');
  assert.equal(typeof output, 'string', 'Missing dependency audit output');
  // Yarn 4.12.0 emits no JSON records for a clean audit. The exit status and
  // retained output file still prove that the audit command ran successfully.
  if (!output.trim()) return;
  const records = output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
  assert(
    records.every(
      record =>
        record.type === 'info' && record.data === 'No audit suggestions',
    ),
    'Unexpected dependency audit result',
  );
}

/** Revalidate the security handoff without giving the publisher scanning credentials. */
export function verifySecurityEvidence(directory, report) {
  const folder = join(directory, 'security');
  const evidence = readJson(join(folder, 'report.json'));
  assert.equal(
    evidence.commit,
    report.commit,
    'Security source revision mismatch',
  );
  assert.equal(evidence.policy, 'block-all-findings');
  assert.deepEqual(
    evidence.packages,
    report.packages,
    'Security artifact hashes mismatch',
  );
  assert.equal(evidence.auditExitCode, 0);
  assert(Array.isArray(evidence.files), 'Missing security file inventory');
  const names = new Set();
  for (const file of evidence.files) {
    assert(
      /^(?:codeql-\d+\.(?:metadata|sarif)\.json|yarn-audit\.ndjson|consumer\.yarn\.lock)$/.test(
        file.name,
      ),
      'Unsafe security evidence path',
    );
    assert(!names.has(file.name), 'Duplicate security evidence file');
    names.add(file.name);
    assert.equal(
      digest(join(folder, file.name)),
      file.sha256,
      'Security evidence changed',
    );
  }
  assert(
    names.has('yarn-audit.ndjson') && names.has('consumer.yarn.lock'),
    'Missing dependency evidence',
  );
  const analyses = [...names]
    .filter(name => name.endsWith('.metadata.json'))
    .map(name => readJson(join(folder, name)));
  const selected = selectCodeqlAnalyses(analyses, report.commit);
  assert(
    selected && selected.length === analyses.length,
    'Missing or inconsistent CodeQL evidence',
  );
  for (const analysis of selected) {
    const file = `codeql-${analysis.id}.sarif.json`;
    assert(names.has(file), 'Missing CodeQL SARIF evidence');
    verifyCodeql(analysis, readJson(join(folder, file)), report.commit);
  }
  verifyAudit(
    readFileSync(join(folder, 'yarn-audit.ndjson'), 'utf8'),
    evidence.auditExitCode,
  );
}

export async function collectSecurityEvidence(directory, commit, token) {
  assert.match(commit ?? '', /^[a-f0-9]{40}$/, 'Invalid release revision');
  assert(token, 'CodeQL read token required');
  const report = readJson(join(directory, 'report.json'));
  assert.equal(report.commit, commit);
  assert.equal(report.includesUncommittedChanges, false);
  for (const candidate of report.packages)
    verifyArchiveDigest(directory, candidate);
  const folder = join(directory, 'security');
  mkdirSync(folder, { recursive: true });
  rmSync(join(folder, 'report.json'), { force: true });
  const files = [];
  const record = (name, value, includeInHandoff = true) => {
    writeFileSync(join(folder, name), `${JSON.stringify(value, null, 2)}\n`);
    if (includeInHandoff) files.push(name);
  };
  async function api(path, sarif = false) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/code-scanning/${path}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: sarif
            ? 'application/sarif+json'
            : 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      },
    );
    assert.equal(
      response.status,
      200,
      `CodeQL API unavailable (${response.status})`,
    );
    return response.json();
  }
  let selected;
  // CodeQL default setup runs separately on main. Never substitute another SHA.
  for (let attempt = 0; attempt < 60; attempt++) {
    const analyses = await api(
      'analyses?ref=refs%2Fheads%2Fmain&tool_name=CodeQL&per_page=100',
    );
    record('codeql-latest.metadata.json', analyses, false);
    selected = selectCodeqlAnalyses(analyses, commit);
    if (selected) break;
    await new Promise(done => setTimeout(done, 10_000));
  }
  assert(selected, 'Missing CodeQL analyses for the release SHA');
  let sastError;
  for (const analysis of selected) {
    const sarif = await api(`analyses/${analysis.id}`, true);
    record(`codeql-${analysis.id}.metadata.json`, analysis);
    record(`codeql-${analysis.id}.sarif.json`, sarif);
    try {
      verifyCodeql(analysis, sarif, commit);
    } catch (error) {
      sastError ??= error;
    }
  }
  const consumer = join(directory, 'consumer');
  copyFileSync(join(consumer, 'yarn.lock'), join(folder, 'consumer.yarn.lock'));
  files.push('consumer.yarn.lock');
  const audit = spawnSync(
    'corepack',
    [
      'yarn',
      'npm',
      'audit',
      '--recursive',
      '--environment',
      'production',
      '--severity',
      'info',
      '--no-deprecations',
      '--json',
    ],
    {
      cwd: consumer,
      encoding: 'utf8',
      timeout: 300_000,
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        GH_TOKEN: '',
        GITHUB_TOKEN: '',
        YARN_ENABLE_SCRIPTS: 'false',
      },
    },
  );
  writeFileSync(join(folder, 'yarn-audit.ndjson'), audit.stdout ?? '');
  writeFileSync(join(folder, 'yarn-audit.stderr.log'), audit.stderr ?? '');
  files.push('yarn-audit.ndjson');
  let scaError;
  try {
    assert(!audit.error, 'Dependency audit could not run');
    verifyAudit(audit.stdout, audit.status);
  } catch (error) {
    scaError = error;
  }
  record(
    'scan-status.json',
    {
      commit,
      sast: sastError?.message ?? 'passed',
      sca: scaError?.message ?? 'passed',
    },
    false,
  );
  if (sastError || scaError)
    throw new Error(
      [sastError?.message, scaError?.message].filter(Boolean).join('; '),
    );
  writeFileSync(
    join(folder, 'report.json'),
    `${JSON.stringify(
      {
        commit,
        policy: 'block-all-findings',
        packages: report.packages,
        auditExitCode: audit.status,
        files: files.map(name => ({
          name,
          sha256: digest(join(folder, name)),
        })),
      },
      null,
      2,
    )}\n`,
  );
  verifySecurityEvidence(directory, report);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await collectSecurityEvidence(
    resolve(process.env.SDK_VALIDATION_DIR),
    process.env.GITHUB_SHA,
    process.env.GH_TOKEN,
  );
  console.log('SAST and SCA gates passed with zero reported findings');
}
