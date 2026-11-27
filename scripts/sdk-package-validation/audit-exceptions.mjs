import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const hash = value => createHash('sha256').update(value).digest('hex');
const severities = new Set(['info', 'low', 'moderate', 'high', 'critical']);
const advisoryPattern =
  /^GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}$/;
const versionPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export const emptyAuditExceptions = () => ({
  schemaVersion: 1,
  consumerLockSha256: null,
  exceptions: [],
});

export const loadAuditExceptions = () =>
  JSON.parse(
    readFileSync(new URL('audit-exceptions.json', import.meta.url), 'utf8'),
  );

function keys(value, expected, label) {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    `Invalid ${label}`,
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `Invalid ${label} fields`,
  );
}

function day(value) {
  assert(
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value),
    'Invalid exception date',
  );
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  assert(
    Number.isFinite(timestamp) &&
      new Date(timestamp).toISOString().slice(0, 10) === value,
    'Invalid exception date',
  );
  return timestamp;
}

function versions(values) {
  assert(
    Array.isArray(values) && values.length > 0,
    'Missing affected versions',
  );
  assert(
    values.every(
      value => typeof value === 'string' && versionPattern.test(value),
    ),
    'Exceptions require exact package versions',
  );
  assert.equal(
    new Set(values).size,
    values.length,
    'Duplicate affected version',
  );
  return [...values].sort();
}

function validateExceptions(policy, lockSha256, now) {
  keys(
    policy,
    ['schemaVersion', 'consumerLockSha256', 'exceptions'],
    'audit exception policy',
  );
  assert.equal(policy.schemaVersion, 1, 'Unsupported audit exception policy');
  assert(Array.isArray(policy.exceptions), 'Missing audit exceptions');
  assert(Number.isFinite(now), 'Invalid exception verification time');
  if (!policy.exceptions.length) {
    assert.equal(
      policy.consumerLockSha256,
      null,
      'Empty exceptions must not pin a consumer graph',
    );
    return new Map();
  }
  assert.match(
    policy.consumerLockSha256,
    /^[a-f0-9]{64}$/,
    'Missing reviewed consumer graph digest',
  );
  assert.equal(
    lockSha256,
    policy.consumerLockSha256,
    'Audit exceptions do not cover this consumer graph',
  );
  const result = new Map();
  for (const entry of policy.exceptions) {
    keys(
      entry,
      [
        'advisory',
        'package',
        'versions',
        'severity',
        'disposition',
        'owner',
        'createdOn',
        'expiresOn',
        'rationale',
        'evidence',
      ],
      'audit exception',
    );
    assert.match(entry.advisory, advisoryPattern, 'Invalid exception advisory');
    assert(
      typeof entry.package === 'string' &&
        /^(?:@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(entry.package),
      'Invalid exception package',
    );
    versions(entry.versions);
    assert(severities.has(entry.severity), 'Invalid exception severity');
    assert(
      ['not-affected', 'risk-accepted'].includes(entry.disposition),
      'Invalid exception disposition',
    );
    assert(
      typeof entry.owner === 'string' &&
        /^@[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)?$/.test(entry.owner),
      'Missing exception owner',
    );
    const created = day(entry.createdOn);
    const expires = day(entry.expiresOn);
    assert(created <= now, 'Exception creation date is in the future');
    assert(
      expires > created && expires - created <= 30 * 24 * 60 * 60 * 1000,
      'Exception lifetime must be at most 30 days',
    );
    assert(now < expires, 'Audit exception expired');
    assert(
      typeof entry.rationale === 'string' &&
        entry.rationale.trim().length >= 40,
      'Missing exception rationale',
    );
    assert(
      Array.isArray(entry.evidence) && entry.evidence.length > 0,
      'Missing exception evidence',
    );
    for (const reference of entry.evidence) {
      const url = new URL(reference);
      assert(
        url.protocol === 'https:' &&
          !url.username &&
          !url.password &&
          url.hostname.includes('.'),
        'Invalid exception evidence URL',
      );
    }
    const key = `${entry.package}\0${entry.advisory}`;
    assert(!result.has(key), 'Duplicate audit exception');
    result.set(key, entry);
  }
  return result;
}

function parseAudit(output, status) {
  assert([0, 1].includes(status), 'Dependency audit failed');
  assert.equal(typeof output, 'string', 'Missing dependency audit output');
  const records = output.trim()
    ? output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line))
    : [];
  if (
    !records.length ||
    records.every(
      record =>
        record.type === 'info' && record.data === 'No audit suggestions',
    )
  ) {
    assert.equal(
      status,
      0,
      'Dependency audit failed without a complete finding report',
    );
    return [];
  }
  assert.equal(
    status,
    1,
    'Dependency audit findings have an inconsistent exit status',
  );
  const seen = new Set();
  return records.map(record => {
    const children = record.children;
    assert(
      typeof record.value === 'string' &&
        children &&
        Number.isSafeInteger(children.ID) &&
        children.ID > 0,
      'Dependency audit failed or returned malformed findings',
    );
    assert(
      typeof children.Issue === 'string' &&
        children.Issue.length > 0 &&
        severities.has(children.Severity),
      'Invalid audit finding metadata',
    );
    assert(
      typeof children['Vulnerable Versions'] === 'string' &&
        children['Vulnerable Versions'].length > 0,
      'Missing vulnerable version range',
    );
    assert(
      Array.isArray(children.Dependents) &&
        children.Dependents.length > 0 &&
        children.Dependents.every(
          value => typeof value === 'string' && value.length > 0,
        ),
      'Missing audit dependency paths',
    );
    const url = new URL(children.URL);
    assert(
      url.origin === 'https://github.com' &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password &&
        url.pathname.startsWith('/advisories/'),
      'Invalid audit advisory URL',
    );
    const advisory = url.pathname.slice('/advisories/'.length);
    assert.match(
      advisory,
      advisoryPattern,
      'Invalid audit advisory identifier',
    );
    const affected = versions(children['Tree Versions']);
    const key = `${record.value}\0${advisory}\0${affected.join(',')}`;
    assert(!seen.has(key), 'Duplicate audit finding');
    seen.add(key);
    return {
      package: record.value,
      advisory,
      versions: affected,
      severity: children.Severity,
    };
  });
}

/** Findings remain in the evidence. Only exact, current, reviewed exceptions can pass. */
export function verifyAudit(
  output,
  status,
  { exceptions = emptyAuditExceptions(), lockSha256, now = Date.now() } = {},
) {
  const allowed = validateExceptions(exceptions, lockSha256, now);
  const findings = parseAudit(output, status);
  const used = new Map();
  for (const finding of findings) {
    const key = `${finding.package}\0${finding.advisory}`;
    const entry = allowed.get(key);
    assert(
      entry,
      `Dependency audit findings block publication: ${finding.package} ${finding.advisory}`,
    );
    assert.equal(
      finding.severity,
      entry.severity,
      'Audit exception severity changed',
    );
    const matched = used.get(key) ?? new Set();
    for (const version of finding.versions) {
      assert(
        entry.versions.includes(version),
        'Audit exception does not cover this version',
      );
      matched.add(version);
    }
    used.set(key, matched);
  }
  assert.equal(
    used.size,
    allowed.size,
    'Remove unused audit exceptions before release',
  );
  for (const [key, entry] of allowed) {
    assert.deepEqual(
      [...used.get(key)].sort(),
      versions(entry.versions),
      'Audit exception affected versions changed',
    );
  }
  return {
    reportedFindings: findings.length,
    acceptedFindings: findings.length,
    blockingFindings: 0,
    exceptionPolicySha256: hash(JSON.stringify(exceptions)),
    consumerLockSha256: lockSha256 ?? null,
    exceptions: [...allowed.values()]
      .map(
        ({
          advisory,
          package: name,
          versions: affected,
          severity,
          disposition,
          owner,
          expiresOn,
        }) => ({
          advisory,
          package: name,
          versions: versions(affected),
          severity,
          disposition,
          owner,
          expiresOn,
        }),
      )
      .sort((a, b) =>
        `${a.package}/${a.advisory}`.localeCompare(
          `${b.package}/${b.advisory}`,
        ),
      ),
  };
}
