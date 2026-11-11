import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/code-quality.yml', import.meta.url),
  'utf8',
);
const step = workflow
  .split('      - name: Wait for Node 22 coverage artifact\n')[1]
  .split('\n      - name: ')[0];
const script = step
  .split('        run: |\n')[1]
  .split('\n')
  .map(line => line.replace(/^ {10}/, ''))
  .join('\n');
const base = '/repos/ansible/ansible-backstage-plugins/actions';
const runsUrl = `${base}/workflows/pr.yml/runs?head_sha=expected&event=pull_request&per_page=100`;
const jobsUrl = id => `${base}/runs/${id}/jobs?filter=latest&per_page=100`;
const artifactsUrl = id => `${base}/runs/${id}/artifacts?per_page=100`;
const run = (id, extra = {}) => ({
  id,
  head_sha: 'expected',
  event: 'pull_request',
  ...extra,
});
const jobs = (conclusion = 'success') => ({
  jobs: [{ name: 'Test with Node.js 22', status: 'completed', conclusion }],
});
const artifact = (expired = false) => ({
  artifacts: [{ name: 'coverage-report-22', expired }],
});

function poll(responses, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'coverage-poll-'));
  try {
    const fixtures = join(directory, 'responses.json');
    const calls = join(directory, 'calls.json');
    const output = join(directory, 'output');
    writeFileSync(fixtures, JSON.stringify(responses));
    writeFileSync(output, '');
    writeFileSync(
      join(directory, 'gh'),
      `#!/usr/bin/env node
const fs = require('fs');
const url = process.argv.at(-1);
const fixtures = JSON.parse(fs.readFileSync(process.env.FIXTURES, 'utf8'));
const calls = fs.existsSync(process.env.CALLS) ? JSON.parse(fs.readFileSync(process.env.CALLS, 'utf8')) : [];
const count = calls.filter(call => call === url).length;
calls.push(url);
fs.writeFileSync(process.env.CALLS, JSON.stringify(calls));
if (!fixtures[url]) { console.error('Unexpected API request: ' + url); process.exit(1); }
const responses = fixtures[url];
console.log(JSON.stringify(responses[Math.min(count, responses.length - 1)]));
`,
      { mode: 0o755 },
    );
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      timeout: 15000,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        FIXTURES: fixtures,
        CALLS: calls,
        GITHUB_OUTPUT: output,
        GITHUB_REPOSITORY: 'ansible/ansible-backstage-plugins',
        GITHUB_EVENT_NAME: options.event ?? 'pull_request_target',
        HEAD_SHA: 'expected',
        COVERAGE_WAIT_SECONDS: options.timeout ?? '30',
        COVERAGE_POLL_INTERVAL_SECONDS: '0',
      },
    });
    assert.ifError(result.error);
    return {
      ...result,
      output: readFileSync(output, 'utf8'),
      calls: JSON.parse(readFileSync(calls, 'utf8')),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const status of ['in_progress', 'failure']) {
  test(`uses successful Node 22 coverage when the overall run is ${status}`, () => {
    const result = poll({
      [runsUrl]: [
        {
          workflow_runs: [
            run(1, { conclusion: status === 'failure' ? 'failure' : null }),
          ],
        },
      ],
      [jobsUrl(1)]: [jobs()],
      [artifactsUrl(1)]: [artifact()],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.output, 'run_id=1\n');
    assert.deepEqual(result.calls, [runsUrl, jobsUrl(1), artifactsUrl(1)]);
  });
}

test('ignores cancelled duplicates and selects the run with coverage', () => {
  const result = poll({
    [runsUrl]: [{ workflow_runs: [run(1), run(2)] }],
    [jobsUrl(2)]: [jobs('cancelled')],
    [jobsUrl(1)]: [jobs()],
    [artifactsUrl(1)]: [artifact()],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, 'run_id=1\n');
  assert.deepEqual(result.calls, [
    runsUrl,
    jobsUrl(2),
    jobsUrl(1),
    artifactsUrl(1),
  ]);
});

test('rejects unrelated commits, events, and expired coverage', () => {
  const result = poll({
    [runsUrl]: [
      {
        workflow_runs: [
          run(1),
          run(2),
          run(3, { head_sha: 'other' }),
          run(4, { event: 'push' }),
        ],
      },
    ],
    [jobsUrl(2)]: [jobs()],
    [artifactsUrl(2)]: [artifact(true)],
    [jobsUrl(1)]: [jobs()],
    [artifactsUrl(1)]: [artifact()],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, 'run_id=1\n');
  assert.equal(
    result.calls.some(url => url === jobsUrl(3) || url === jobsUrl(4)),
    false,
  );
});

test('waits for a workflow that has not registered yet', () => {
  const result = poll({
    [runsUrl]: [{ workflow_runs: [] }, { workflow_runs: [run(1)] }],
    [jobsUrl(1)]: [jobs()],
    [artifactsUrl(1)]: [artifact()],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.filter(url => url === runsUrl).length, 2);
});

test('waits for artifact availability and reads each endpoint once per poll', () => {
  const result = poll({
    [runsUrl]: [{ workflow_runs: [run(1)] }],
    [jobsUrl(1)]: [jobs()],
    [artifactsUrl(1)]: [{ artifacts: [] }, artifact()],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [
    runsUrl,
    jobsUrl(1),
    artifactsUrl(1),
    runsUrl,
    jobsUrl(1),
    artifactsUrl(1),
  ]);
});

test('fails clearly at the deadline while a coverage job remains queued', () => {
  const result = poll(
    {
      [runsUrl]: [{ workflow_runs: [run(1)] }],
      [jobsUrl(1)]: [
        {
          jobs: [
            {
              name: 'Test with Node.js 22',
              status: 'queued',
              conclusion: null,
            },
          ],
        },
      ],
    },
    { timeout: '0' },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Timed out waiting for Node 22 coverage/);
  assert.equal(result.output, '');
});

test('selects the push workflow for main pushes', () => {
  const url = `${base}/workflows/push.yml/runs?head_sha=expected&event=push&per_page=100`;
  const result = poll(
    {
      [url]: [{ workflow_runs: [run(1, { event: 'push' })] }],
      [jobsUrl(1)]: [jobs()],
      [artifactsUrl(1)]: [artifact()],
    },
    { event: 'push' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, 'run_id=1\n');
});

test('allows an hour for queued and slow upstream jobs', () => {
  assert.match(step, /COVERAGE_WAIT_SECONDS: 3600/);
  assert.match(step, /timeout-minutes: 65/);
});
