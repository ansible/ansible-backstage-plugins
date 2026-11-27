import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/sdk-package-publish.yml', import.meta.url),
  'utf8',
);

test('the pre-checkout shell gate rejects differently cased and disallowed refs', () => {
  const block = workflow
    .split('- name: Validate release branch\n')[1]
    .split('      - name:')[0];
  const script = block
    .split('run: |\n')[1]
    .split('\n')
    .map(line => line.replace(/^ {10}/, ''))
    .join('\n');
  assert(
    workflow.indexOf('Validate release branch') <
      workflow.indexOf('uses: actions/checkout'),
  );
  for (const [ref, allowed] of [
    ['refs/heads/main', true],
    ['refs/heads/release-1', true],
    ['refs/heads/Main', false],
    ['refs/heads/Release-1', false],
    ['refs/heads/release-', false],
    ['refs/heads/release-1/nested', false],
    ['refs/tags/release-1', false],
    ['refs/heads/feature', false],
  ]) {
    const result = spawnSync('bash', ['-c', script], {
      env: { GITHUB_REF: ref },
      encoding: 'utf8',
    });
    assert.equal(result.status === 0, allowed, `${ref}: ${result.stderr}`);
  }
});

test('public diagnostics are sanitized and reruns retain distinct evidence', () => {
  const diagnostics = workflow
    .split('- name: Retain security diagnostics')[1]
    .split('- name: Verify complete release set')[0];
  assert.match(
    diagnostics,
    /name: sdk-security-diagnostics-\$\{\{ github.run_attempt \}\}/,
  );
  assert.deepEqual(
    [
      ...diagnostics.matchAll(
        /\$\{\{ runner.temp \}\}\/sdk-release\/security\/(\S+)/g,
      ),
    ].map(match => match[1]),
    [
      'scan-status.json',
      'consumer.yarn.lock',
      'yarn-audit.ndjson',
      'dependency-audit.summary.json',
    ],
  );
  assert.match(
    workflow,
    /name: sdk-npm-preview-\$\{\{ github.run_attempt \}\}/,
  );
  assert.match(
    workflow,
    /artifact-ids: \$\{\{ needs.build.outputs.artifact-id \}\}/,
  );
});

test('signed evidence must be uploaded successfully before any registry write', () => {
  const upload = workflow.indexOf('- name: Upload signed release evidence');
  const publish = workflow.indexOf(
    '- name: Publish exact archives through npm OIDC',
  );
  assert(
    upload >
      workflow.indexOf('- name: Sign archive, SBOM and report provenance'),
  );
  assert(publish > upload);
  assert.doesNotMatch(workflow.slice(upload, publish), /if: always/);
  assert.doesNotMatch(workflow.slice(publish), /if: always/);
  assert.match(workflow.slice(upload, publish), /if-no-files-found: error/);
});

test('bootstrap preparation retains review, scans and attestations while skipping publication', () => {
  assert.match(
    workflow,
    /prepare_bootstrap:\n\s+description:.*\n\s+required: false\n\s+type: boolean\n\s+default: false/,
  );
  const publisher = workflow.split('\n  publish:\n')[1];
  assert.match(publisher, /environment: npm-preview/);
  const publishStep = publisher.split(
    '- name: Publish exact archives through npm OIDC',
  )[1];
  assert.match(publishStep, /if: \$\{\{ !inputs.prepare_bootstrap \}\}/);
  assert.match(publishStep, /publish\.mjs" --publish/);
  const protectedSteps = publisher.slice(
    0,
    publisher.indexOf('- name: Publish exact archives through npm OIDC'),
  );
  assert.match(protectedSteps, /Revalidate approved archive bytes/);
  assert.match(protectedSteps, /Sign archive, SBOM and report provenance/);
  assert.match(protectedSteps, /Upload signed release evidence/);
  assert.doesNotMatch(protectedSteps, /prepare_bootstrap/);
});
