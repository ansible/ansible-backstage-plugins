/**
 * Behavioural checks for the credential-boundary lint guards (AAP-96687).
 *
 * A clean lint run proves the existing code complies; it cannot prove the
 * guards would catch anything. These tests lint small, deliberately
 * violating snippets against the real package ESLint configurations — the
 * same config chain `yarn lint` resolves — and assert the specific guard
 * diagnostic fires at error severity, while legitimate spellings stay clean
 * and test files keep the freedom to seed a subprocess with `{ ...process.env }`.
 *
 * Run: yarn test:credential-guards
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { ESLint } = require('eslint');

const repoRoot = path.resolve(__dirname, '..');

/** The packages the credential boundary protects. */
const PACKAGES = [
  'workspaces/content-management/plugins/automation-content-common',
  'workspaces/content-management/plugins/automation-content-backend',
  'workspaces/content-management/plugins/catalog-backend-module-automation-content',
].map(dir => path.join(repoRoot, dir));

// One shared engine. Config resolution happens through the real .eslintrc.js
// chain of each package, driven by the synthetic probe path below — so a
// package that stops wiring in the shared policy fails these tests too.
const eslint = new ESLint({ cwd: repoRoot, cache: false });

async function guardMessages(pkg, code, { testFile = false } = {}) {
  const filePath = path.join(
    pkg,
    testFile ? 'src/guard-probe.test.ts' : 'src/guard-probe.ts',
  );
  const [result] = await eslint.lintText(code, { filePath });

  // A parse failure silences every guard, so surface it rather than pass.
  const fatal = result.messages.filter(message => message.fatal);
  assert.deepEqual(
    fatal,
    [],
    `snippet must parse against the package config: ${code}`,
  );

  return result.messages.filter(
    message => message.ruleId === 'no-restricted-syntax',
  );
}

async function expectViolation(pkg, code, marker, options) {
  const violations = await guardMessages(pkg, code, options);
  assert.ok(
    violations.some(
      violation =>
        violation.severity === 2 && violation.message.includes(marker),
    ),
    `expected an error-severity "${marker}" violation for: ${code}\nGot: ${JSON.stringify(
      violations,
    )}`,
  );
}

async function expectClean(pkg, code, options) {
  const violations = await guardMessages(pkg, code, options);
  assert.deepEqual(violations, [], `expected no guard violations for: ${code}`);
}

/** Every spelling that loads a Kubernetes/OpenShift cluster client. */
const CLUSTER_CLIENT_LOADS = [
  "import { KubeConfig } from '@kubernetes/client-node';",
  "import * as client from '@kubernetes/client-node';",
  "import type { KubeConfig } from '@kubernetes/client-node';",
  "import '@kubernetes/client-node';",
  "import { CoreV1Api } from '@kubernetes/client-node/dist/gen';",
  "export { KubeConfig } from '@kubernetes/client-node';",
  "export * from '@kubernetes/client-node';",
  "const client = require('@kubernetes/client-node');",
  "const client = await import('@kubernetes/client-node');",
  "import client = require('@kubernetes/client-node');",
  "import { fetcher } from '@backstage/plugin-kubernetes-node';",
  "const client = require('kubernetes-client');",
  "const client = require('openshift-rest-client');",
];

/** Taking the whole environment object as a value, in its many shapes. */
const WHOLE_ENV_VALUES = [
  'const keys = Object.keys(process.env);',
  'const entries = Object.entries(process.env);',
  'const snapshot = { ...process.env };',
  'const merged = Object.assign({}, process.env);',
  'const serialized = JSON.stringify(process.env);',
  'logger.info(process.env);',
  'for (const name in process.env) {}',
  'for (const value of process.env) {}',
  'const environment = process.env;',
  'const { HOME } = process.env;',
  'const wrapped = { env: process.env };',
  'function snapshot() { return process.env; }',
  'const list = [process.env];',
  'const fallback = process.env || {};',
  'const text = `${process.env}`;',
  'const typed = process.env as NodeJS.ProcessEnv;',
  'const asserted = <Record<string, string>>process.env;',
  'const nonNull = process.env!;',
  'const chained = (0, process.env);',
  'const scoped = process["env"];',
  'class Holder { env = process.env; }',
  'function f(x = process.env) {}',
  'const arrow = () => process.env;',
  'const shared = new Env(process.env);',
  'const picked = cond ? process.env : {};',
  'const { env } = process;',
  'const { env: alias } = process;',
  '({ env } = process);',
  'const { ["env"]: computed } = process;',
  "const { ['env']: singleQuoted } = process;",
  'const checked = process.env satisfies Record<string, string | undefined>;',
  'Object.keys(globalThis.process.env);',
  "Object.keys(require('node:process').env);",
];

/** Reading the environment through a computed key. */
const COMPUTED_ENV_READS = [
  'const value = process.env[name];',
  'const value = process.env[`PREFIX_${name}`];',
  'const value = process["env"][name];',
];

/** Importing the environment object instead of reading named variables. */
const PROCESS_MODULE_IMPORTS = [
  "import { env as environment } from 'node:process';",
  "import * as nodeProcess from 'process';",
  "import process from 'node:process'; Object.keys(process.env);",
];

/** Named reads the boundary exists to allow. */
const LEGITIMATE_READS = [
  'const nodeEnv = process.env.NODE_ENV;',
  "const home = process.env['HOME'];",
  'const optional = process.env?.HOME;',
  'const chosen = { NODE_ENV: process.env.NODE_ENV };',
  'logger.info(process.env.NODE_ENV);',
  'const nested = f(g(process.env.NAME));',
  'const coverage = process.env.OCI_SCENARIO_COVERAGE;',
  "process.env.DEBUG = '1';",
];

const CLUSTER_MARKER = 'must not load Kubernetes/OpenShift clients';

for (const pkg of PACKAGES) {
  const name = path.relative(repoRoot, pkg);

  test(`cluster clients cannot be loaded (${name})`, async () => {
    for (const code of CLUSTER_CLIENT_LOADS) {
      await expectViolation(pkg, code, CLUSTER_MARKER);
    }
  });

  test(`the whole process.env object is not a value (${name})`, async () => {
    for (const code of WHOLE_ENV_VALUES) {
      await expectViolation(pkg, code, 'whole process.env object');
    }
  });

  test(`computed env reads are rejected (${name})`, async () => {
    for (const code of COMPUTED_ENV_READS) {
      await expectViolation(pkg, code, 'Computed process.env access');
    }
  });

  test(`the env object cannot be imported (${name})`, async () => {
    for (const code of PROCESS_MODULE_IMPORTS) {
      await expectViolation(
        pkg,
        code,
        'environment object from the process module',
      );
    }
  });

  test(`named reads stay allowed (${name})`, async () => {
    for (const code of LEGITIMATE_READS) {
      await expectClean(pkg, code);
    }
  });

  test(`test files keep subprocess seeding (${name})`, async () => {
    await expectClean(pkg, 'const env = { ...process.env };', {
      testFile: true,
    });
    await expectClean(pkg, 'const environment = process.env;', {
      testFile: true,
    });
  });

  test(`cluster clients are blocked in test files too (${name})`, async () => {
    await expectViolation(
      pkg,
      "const kube = require('@kubernetes/client-node');",
      CLUSTER_MARKER,
      { testFile: true },
    );
  });
}
