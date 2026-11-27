import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyAuditExceptions, verifyAudit } from './audit-exceptions.mjs';

const lockSha256 = 'a'.repeat(64);
const now = Date.parse('2026-11-27T12:00:00Z');
const entry = () => ({
  advisory: 'GHSA-x7hr-w5r2-h6wg',
  package: 'prismjs',
  versions: ['1.27.0'],
  severity: 'moderate',
  disposition: 'risk-accepted',
  owner: '@ansible/automation-portal-engineers',
  createdOn: '2026-11-27',
  expiresOn: '2026-12-11',
  rationale:
    'Temporary preview risk acceptance while the upstream dependency correction is reviewed.',
  evidence: ['https://github.com/wooorm/refractor/pull/82'],
});
const policy = () => ({
  schemaVersion: 1,
  consumerLockSha256: lockSha256,
  exceptions: [entry()],
});
const record = () => ({
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
});
const assess = (
  exceptions = policy(),
  finding = record(),
  status = 1,
  options = {},
) =>
  verifyAudit(JSON.stringify(finding), status, {
    exceptions,
    lockSha256,
    now,
    ...options,
  });

test('retains reviewed findings and binds the decision to the exact policy and consumer graph', () => {
  const result = assess();
  assert.equal(result.reportedFindings, 1);
  assert.equal(result.acceptedFindings, 1);
  assert.equal(result.blockingFindings, 0);
  assert.equal(result.consumerLockSha256, lockSha256);
  assert.equal(result.exceptions[0].disposition, 'risk-accepted');
  assert.match(result.exceptionPolicySha256, /^[a-f0-9]{64}$/);
  const changed = policy();
  changed.exceptions[0].rationale += ' Additional reviewed context.';
  assert.notEqual(
    assess(changed).exceptionPolicySha256,
    result.exceptionPolicySha256,
  );
  const nonApplicable = policy();
  nonApplicable.exceptions[0].disposition = 'not-affected';
  assert.equal(assess(nonApplicable).exceptions[0].disposition, 'not-affected');
});

test('unknown advisories, versions, severities and consumer graphs cannot reuse an exception', () => {
  assert.throws(() => assess(emptyAuditExceptions()), /findings block/);
  const unknown = record();
  unknown.children.URL = 'https://github.com/advisories/GHSA-337j-9hxr-rhxg';
  assert.throws(() => assess(policy(), unknown), /findings block/);
  const version = record();
  version.children['Tree Versions'] = ['1.28.0'];
  assert.throws(() => assess(policy(), version), /this version/);
  const severity = record();
  severity.children.Severity = 'high';
  assert.throws(() => assess(policy(), severity), /severity changed/);
  assert.throws(
    () => assess(policy(), record(), 1, { lockSha256: 'b'.repeat(64) }),
    /consumer graph/,
  );
});

test('expired, future, excessive, duplicate and incomplete exception decisions fail closed', () => {
  for (const [field, value] of [
    ['expiresOn', '2026-11-27'],
    ['expiresOn', '2027-01-01'],
    ['createdOn', '2026-11-28'],
    ['createdOn', '2026-02-30'],
    ['owner', ''],
    ['rationale', 'TODO'],
    ['evidence', []],
    ['evidence', ['http://example.com/report']],
    ['evidence', ['https://user:password@example.com/report']],
    ['versions', ['*']],
    ['versions', ['1.27.0', '1.27.0']],
    ['disposition', 'ignored'],
  ]) {
    const invalid = policy();
    invalid.exceptions[0][field] = value;
    assert.throws(() => assess(invalid), `${field}=${value}`);
  }
  assert.throws(
    () =>
      assess(policy(), record(), 1, {
        now: Date.parse('2026-12-11T00:00:00Z'),
      }),
    /expired/,
  );
  const duplicate = policy();
  duplicate.exceptions.push(entry());
  assert.throws(() => assess(duplicate), /Duplicate/);
  const typo = policy();
  typo.exceptions[0].ignoreAll = true;
  assert.throws(() => assess(typo), /fields/);
});

test('scanner failures, malformed reports and inconsistent exit statuses cannot be waived', () => {
  for (const status of [null, 2, -1, 127])
    assert.throws(() => assess(policy(), record(), status), /audit failed/);
  assert.throws(() => assess(policy(), record(), 0), /inconsistent/);
  for (const output of [
    '',
    '{}',
    'not json',
    JSON.stringify({ type: 'error', data: 'scanner unavailable' }),
  ]) {
    assert.throws(() =>
      verifyAudit(output, 1, { exceptions: policy(), lockSha256, now }),
    );
  }
  const missingPaths = record();
  delete missingPaths.children.Dependents;
  assert.throws(() => assess(policy(), missingPaths), /dependency paths/);
  const duplicate = `${JSON.stringify(record())}\n${JSON.stringify(record())}`;
  assert.throws(
    () => verifyAudit(duplicate, 1, { exceptions: policy(), lockSha256, now }),
    /Duplicate/,
  );
  const forged = record();
  forged.children.URL =
    'https://github.com.example.org/advisories/GHSA-x7hr-w5r2-h6wg';
  assert.throws(() => assess(policy(), forged), /advisory URL/);
});

test('clean scans require no stale exception decisions', () => {
  assert.equal(verifyAudit('', 0).reportedFindings, 0);
  assert.equal(
    verifyAudit(
      JSON.stringify({ type: 'info', data: 'No audit suggestions' }),
      0,
    ).acceptedFindings,
    0,
  );
  assert.throws(
    () => verifyAudit('', 0, { exceptions: policy(), lockSha256, now }),
    /unused/,
  );
  const extraVersion = policy();
  extraVersion.exceptions[0].versions.push('1.28.0');
  assert.throws(() => assess(extraVersion), /versions changed/);
});
