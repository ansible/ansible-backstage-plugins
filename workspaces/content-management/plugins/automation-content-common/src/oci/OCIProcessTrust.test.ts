/**
 * @jest-environment node
 *
 * Process-level trust, proven in a subprocess (AAP-96688).
 *
 * `NODE_EXTRA_CA_CERTS` is read once, at process startup, so no in-process
 * test can install a root the client's default-trust branch would see: by
 * the time a test runs, Node's default store is already fixed. These tests
 * therefore bundle the real `OCIClient` — from this package's own source —
 * with esbuild into a self-contained script, write the certificate fixtures
 * to disk, and spawn it with `NODE_EXTRA_CA_CERTS` pointing at the CA that
 * plays "a root the process trusts". The scenarios it runs prove:
 *
 * - a certificate the process itself trusts verifies with no `ca` configured
 * - a certificate nobody trusts is still refused
 * - an unrelated connection bundle does not restrict process trust (no pinning)
 * - a registry trusted through its connection bundle can redirect to, and
 *   exchange a bearer token with, a host trusted only by the process — the
 *   compatibility trap additive trust exists to close
 *
 * The node environment is required because the bundled client loads undici,
 * which depends on web globals jsdom does not provide.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { CoverageMapData } from 'istanbul-lib-coverage';
import {
  subprocessCoveragePlugin,
  SUBPROCESS_COVERAGE_BANNER,
  mergeSubprocessCoverage,
} from '../testing/subprocessCoverage';
import { generateStandaloneCa } from '../testing/tlsCertificates';
import type {
  TrustScenarioInput,
  TrustScenarioVerdict,
} from '../testing/trustScenario';

jest.setTimeout(120_000);

const execFileAsync = promisify(execFile);

// Import lazily so esbuild sees Node's globals rather than jsdom's.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const esbuild = require('esbuild') as typeof import('esbuild');

const coverage = (
  globalThis as typeof globalThis & { __coverage__?: CoverageMapData }
).__coverage__;

let workDir: string;
let bundlePath: string;
let inputPath: string;
let extraCaFile: string;
let scenarioInput: TrustScenarioInput;

beforeAll(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'oci-process-trust-'));

  // Three independent CAs, one per role: the connection's bundle, a root the
  // process will trust through NODE_EXTRA_CA_CERTS, and one nobody trusts.
  const bundle = generateStandaloneCa('connection bundle test CA');
  const processCa = generateStandaloneCa('process trust test CA');
  const elsewhere = generateStandaloneCa('unrelated test CA');

  scenarioInput = {
    bundle: { ca: bundle.ca, server: bundle.server },
    process: { ca: processCa.ca, server: processCa.server },
    elsewhere: { ca: elsewhere.ca, server: elsewhere.server },
  };
  inputPath = path.join(workDir, 'input.json');
  writeFileSync(inputPath, JSON.stringify(scenarioInput));

  // The CA the subprocess must treat as a process root. Node reads this file
  // at startup — which is exactly why the scenarios run in a subprocess.
  extraCaFile = path.join(workDir, 'extra-ca.pem');
  writeFileSync(extraCaFile, processCa.ca);

  bundlePath = path.join(workDir, 'scenario.cjs');
  const entry = path.resolve(__dirname, '../testing/trustScenario.ts');
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: bundlePath,
    logLevel: 'silent',
    plugins: coverage ? [subprocessCoveragePlugin(entry)] : [],
    banner: coverage ? { js: SUBPROCESS_COVERAGE_BANNER } : undefined,
  });
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * Run one scenario and return its verdict.
 *
 * A failing scenario exits non-zero, which rejects the exec — the verdict is
 * then recovered from stdout so the assertion names the scenario's own
 * reason rather than a bare exit code.
 */
async function invokeScenario(args: string[]) {
  const coveragePath = path.join(workDir, 'coverage.json');
  const spawn = () =>
    execFileAsync(process.execPath, [bundlePath, ...args], {
      env: {
        ...process.env,
        NODE_EXTRA_CA_CERTS: extraCaFile,
        OCI_SCENARIO_COVERAGE: coveragePath,
      },
      timeout: 60_000,
    });
  const { stdout, code } = await spawn()
    .then(result => ({ stdout: result.stdout, code: 0 }))
    .catch(error => {
      const out = (error as { stdout?: string }).stdout;
      if (out) return { stdout: out, code: (error as { code: number }).code };
      throw error;
    });
  if (coverage) mergeSubprocessCoverage(coveragePath, coverage);
  return { verdict: JSON.parse(stdout) as TrustScenarioVerdict, code };
}

async function runScenario(name: string): Promise<TrustScenarioVerdict> {
  const { verdict, code } = await invokeScenario([name, inputPath]);
  expect(code).toBe(0);
  return verdict;
}

describe('the default trust store is the process\u2019s', () => {
  it('verifies a certificate the process itself trusts', async () => {
    const verdict = await runScenario('process-trusted');

    expect(verdict.ok).toBe(true);
    expect(verdict.error).toBeUndefined();
    expect(verdict.evidence?.hits).toBeGreaterThan(0);
  });

  it('refuses a certificate nobody trusts', async () => {
    const verdict = await runScenario('process-untrusted');

    expect(verdict.ok).toBe(true);
    expect(String(verdict.evidence?.failure)).toMatch(
      /certificate|verify|self-signed|unable/i,
    );
  });
});

describe('connection trust and process trust compose', () => {
  it('accepts a process-trusted registry outside the configured bundle', async () => {
    const verdict = await runScenario('process-trusted-with-bundle');

    expect(verdict.ok).toBe(true);
    expect(verdict.error).toBeUndefined();
    expect(verdict.evidence?.hits).toBeGreaterThan(0);
  });

  it('follows a redirect from a bundled registry to a process-trusted host', async () => {
    const verdict = await runScenario('mixed-redirect');

    expect(verdict.ok).toBe(true);
    expect(verdict.evidence?.sourceHits).toBeGreaterThan(0);
    expect(verdict.evidence?.targetHits).toBeGreaterThan(0);
  });

  it('exchanges a bearer token with a process-trusted auth realm', async () => {
    const verdict = await runScenario('bearer-realm');

    expect(verdict.ok).toBe(true);
    expect(verdict.evidence?.tokenRequests).toBeGreaterThan(0);
  });
});

describe('scenario CLI failures', () => {
  it.each([
    { args: [] },
    { args: ['unknown', 'input.json'] },
    { args: ['process-trusted'] },
  ])('rejects missing or unknown arguments $args', async ({ args }) => {
    const { verdict, code } = await invokeScenario(args);
    expect(code).toBe(1);
    expect(verdict).toEqual({
      ok: false,
      error: expect.stringContaining('usage:'),
    });
  });

  it('reports an unreadable fixture', async () => {
    const { verdict, code } = await invokeScenario([
      'process-trusted',
      path.join(workDir, 'missing.json'),
    ]);
    expect(code).toBe(1);
    expect(verdict.ok).toBe(false);
    expect(verdict.error).toContain('ENOENT');
  });

  it('reports malformed fixture JSON', async () => {
    const invalid = path.join(workDir, 'invalid.json');
    writeFileSync(invalid, '{');
    const { verdict, code } = await invokeScenario([
      'process-trusted',
      invalid,
    ]);
    expect(code).toBe(1);
    expect(verdict.error).toContain('SyntaxError');
  });

  it('fails if the supposedly untrusted certificate is accepted', async () => {
    const invalid = path.join(workDir, 'trusted-elsewhere.json');
    writeFileSync(
      invalid,
      JSON.stringify({
        ...scenarioInput,
        elsewhere: scenarioInput.process,
      }),
    );
    const { verdict, code } = await invokeScenario([
      'process-untrusted',
      invalid,
    ]);
    expect(code).toBe(1);
    expect(verdict.error).toContain('expected the request to fail');
  });
});
