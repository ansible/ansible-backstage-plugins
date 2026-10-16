import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(
  new URL('./check-dependency-pins.sh', import.meta.url),
);
const dependency = '@backstage/plugin-catalog-backend';

function check(manifests, lockfile) {
  const directory = mkdtempSync(join(tmpdir(), 'dependency-pins-test-'));
  try {
    for (const [path, range] of Object.entries(manifests)) {
      const target = join(directory, path, 'package.json');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(
        target,
        JSON.stringify({ dependencies: { [dependency]: range } }),
      );
    }
    writeFileSync(join(directory, 'yarn.lock'), lockfile);
    return spawnSync('bash', [script], { cwd: directory, encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('finds workspace dependencies in either position of a grouped lock key', () => {
  const result = check(
    {
      'workspaces/portal-core/packages/backend': '^3.6.1',
      'workspaces/apme/plugins/catalog': '3.8.1',
    },
    `"${dependency}@npm:3.8.1, ${dependency}@npm:^3.6.1":\n  version: 3.8.1\n`,
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.match(/OK:/g)?.length, 2);
});

test('ignores generated and installed manifests', () => {
  const result = check(
    {
      'workspaces/aap/plugins/catalog': '^3.6.1',
      'workspaces/aap/plugins/catalog/dist-dynamic': '1.0.0',
      'workspaces/aap/plugins/catalog/dist': '1.0.0',
      'workspaces/aap/plugins/catalog/node_modules/other': '1.0.0',
    },
    `"${dependency}@npm:^3.6.1":\n  version: 3.8.1\n`,
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.match(/OK:/g)?.length, 1);
});

test('rejects a missing declaration', () => {
  const result = check({}, '');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /not found in any package.json/);
});

test('does not accept an unrelated or substring-matching descriptor', () => {
  const result = check(
    { 'workspaces/aap/plugins/catalog': '^3.6.1' },
    `"${dependency}@npm:^3.6.10":\n  version: 3.8.1\n`,
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout, /not found in yarn.lock/);
});

test('rejects a downgrade even when another range has a higher resolution', () => {
  const result = check(
    { 'workspaces/portal-core/packages/backend': '^3.5.0' },
    `"${dependency}@npm:^3.5.0":\n  version: 3.5.9\n\n"${dependency}@npm:^3.6.1":\n  version: 3.8.1\n`,
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout, /minimum required is 3.6.0/);
});

test('accepts the minimum required version', () => {
  const result = check(
    { 'workspaces/portal-core/packages/backend': '^3.6.0' },
    `"${dependency}@npm:^3.6.0":\n  version: "3.6.0"\n`,
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
