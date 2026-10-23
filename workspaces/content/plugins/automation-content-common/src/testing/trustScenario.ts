/**
 * Subprocess entry for the process-trust scenarios (AAP-96688).
 *
 * `NODE_EXTRA_CA_CERTS` is read once, at process startup, so the only way to
 * prove the client honours a process-installed root is to run the client in a
 * process that had the root installed before it started. This module is that
 * process: `OCIProcessTrust.test.ts` bundles it — together with the real
 * `OCIClient` — into a self-contained script, writes a JSON payload of
 * certificate fixtures to disk, and spawns it with `NODE_EXTRA_CA_CERTS`
 * pointing at the CA playing "a root the process trusts". One scenario,
 * named on the command line, runs per invocation; its verdict is printed as
 * a single JSON line on stdout for the test to assert on.
 *
 * Test infrastructure only: deliberately not exported from the package
 * barrel, so it can never reach a published bundle.
 */
import { readFileSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { OCIClient } from '../oci/OCIClient';
import type { RegistryConnection } from '../oci/types';
import type { CertificatePair } from './tlsCertificates';

/** The fixture payload the parent test writes for the subprocess. */
export interface TrustScenarioInput {
  /** The CA playing the connection's `ca` bundle, with a server it signed. */
  bundle: { ca: string; server: CertificatePair };
  /** The CA playing a process-installed root, with a server it signed. */
  process: { ca: string; server: CertificatePair };
  /** A CA nobody trusts, with a server it signed — must always be refused. */
  elsewhere: { ca: string; server: CertificatePair };
}

/** The verdict a scenario prints as one JSON line on stdout. */
export interface TrustScenarioVerdict {
  ok: boolean;
  error?: string;
  evidence?: Record<string, unknown>;
}

interface ScenarioServer {
  url: string;
  /** Requests that reached the server; a client-side refusal never appears. */
  readonly requests: Array<{
    method: string;
    path: string;
    authorization?: string;
  }>;
  close(): Promise<void>;
}

/**
 * Start a loopback HTTPS server that records every request it serves.
 *
 * The same recording discipline as the in-process policy tests: refusals are
 * client-side, so the record proves the difference between "connected" and
 * "refused before any request left the process".
 */
async function serve(
  tls: CertificatePair,
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<ScenarioServer> {
  const requests: ScenarioServer['requests'] = [];
  const server = createHttpsServer(tls, (req, res) => {
    requests.push({
      method: (req.method ?? 'GET').toUpperCase(),
      path: req.url ?? '/',
      authorization: req.headers.authorization,
    });
    handler(req, res);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `https://127.0.0.1:${port}`,
    get requests() {
      return requests;
    },
    // The client holds keep-alive sockets that outlive the scenario, and
    // close() alone would wait for them forever.
    close: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** Serve the OCI version-check endpoint, as a permissive registry would. */
function serveV2(req: IncomingMessage, res: ServerResponse): void {
  if (req.url === '/v2/' || req.url === '/v2') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end('{}');
}

function connection(
  url: string,
  overrides: Partial<RegistryConnection> = {},
): RegistryConnection {
  // No `ca` default here: each scenario states exactly what it trusts, which
  // is the variable under test.
  return {
    name: 'process-trust',
    url,
    auth: { type: 'anonymous' },
    ...overrides,
  };
}

/** The text of a failed request, including undici's underlying TLS cause. */
async function failureOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return String((error as { cause?: unknown }).cause ?? error);
  }
  throw new Error('expected the request to fail');
}

/**
 * A certificate the process itself trusts verifies with no `ca` configured —
 * the default-store branch of the client's trust policy, through the real
 * transport.
 */
async function processTrustedScenario(
  input: TrustScenarioInput,
): Promise<TrustScenarioVerdict> {
  const server = await serve(input.process.server, serveV2);
  const client = new OCIClient(connection(server.url));
  try {
    const ping = await client.ping();
    return ping.ok
      ? {
          ok: true,
          evidence: { status: ping.status, hits: server.requests.length },
        }
      : {
          ok: false,
          error: `expected the process-trusted server to verify; /v2/ answered ${ping.status}`,
        };
  } finally {
    await client.dispose();
    await server.close();
  }
}

/**
 * A certificate nobody trusts is still refused — the default-store branch
 * verifies, it does not merely exist.
 */
async function processUntrustedScenario(
  input: TrustScenarioInput,
): Promise<TrustScenarioVerdict> {
  const server = await serve(input.elsewhere.server, serveV2);
  const client = new OCIClient(connection(server.url));
  try {
    const failure = await failureOf(() => client.ping());
    return /certificate|verify|self-signed|unable/i.test(failure)
      ? { ok: true, evidence: { failure } }
      : { ok: false, error: `expected a TLS failure, got: ${failure}` };
  } finally {
    await client.dispose();
    await server.close();
  }
}

/**
 * The compatibility trap additive trust closes: a registry trusted through
 * its connection bundle redirects to a host trusted only by the process, and
 * the client follows the redirect — verifying against the default store —
 * instead of failing on the bundle's terms.
 */
async function mixedRedirectScenario(
  input: TrustScenarioInput,
): Promise<TrustScenarioVerdict> {
  const target = await serve(input.process.server, serveV2);
  const source = await serve(input.bundle.server, (_req, res) => {
    res.writeHead(302, { location: `${target.url}/v2/` });
    res.end();
  });
  const client = new OCIClient(connection(source.url, { ca: input.bundle.ca }));
  try {
    const ping = await client.ping();
    const followed =
      ping.ok && source.requests.length > 0 && target.requests.length > 0;
    return followed
      ? {
          ok: true,
          evidence: {
            status: ping.status,
            sourceHits: source.requests.length,
            targetHits: target.requests.length,
          },
        }
      : {
          ok: false,
          error:
            `expected the redirect to the process-trusted host to be followed; ` +
            `ping ok=${ping.ok}, source hits=${source.requests.length}, ` +
            `target hits=${target.requests.length}`,
        };
  } finally {
    await client.dispose();
    await source.close();
    await target.close();
  }
}

/**
 * The same trap on the authentication path: a registry trusted through its
 * bundle advertises a bearer realm on a host trusted only by the process.
 * The token exchange must verify against the default store and the request
 * complete with the issued token.
 */
async function bearerRealmScenario(
  input: TrustScenarioInput,
): Promise<TrustScenarioVerdict> {
  let tokenRequests = 0;
  const tokenServer = await serve(input.process.server, (req, res) => {
    if ((req.url ?? '').startsWith('/token')) {
      tokenRequests += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ token: 'issued-token', expires_in: 300 }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{}');
  });

  let authorized = false;
  const source = await serve(input.bundle.server, (req, res) => {
    if (req.headers.authorization === 'Bearer issued-token') {
      authorized = true;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
      return;
    }
    res.writeHead(401, {
      'www-authenticate': `Bearer realm="${tokenServer.url}/token",service="scenario"`,
    });
    res.end();
  });

  const client = new OCIClient(
    connection(source.url, {
      ca: input.bundle.ca,
      auth: { type: 'basic', username: 'user', password: 'pass' },
    }),
  );
  try {
    const res = await client.request('/v2/');
    const ok = res.status === 200 && authorized && tokenRequests > 0;
    return ok
      ? { ok: true, evidence: { status: res.status, tokenRequests } }
      : {
          ok: false,
          error:
            `expected the bearer flow across trust stores; status ${res.status}, ` +
            `authorized ${authorized}, token requests ${tokenRequests}`,
        };
  } finally {
    await client.dispose();
    await source.close();
    await tokenServer.close();
  }
}

const SCENARIOS: Record<
  string,
  (input: TrustScenarioInput) => Promise<TrustScenarioVerdict>
> = {
  'process-trusted': processTrustedScenario,
  'process-untrusted': processUntrustedScenario,
  'mixed-redirect': mixedRedirectScenario,
  'bearer-realm': bearerRealmScenario,
};

function report(verdict: TrustScenarioVerdict): void {
  process.stdout.write(`${JSON.stringify(verdict)}\n`);
  if (!verdict.ok) process.exitCode = 1;
}

async function main(): Promise<void> {
  const [scenario, inputPath] = process.argv.slice(2);
  const run = scenario ? SCENARIOS[scenario] : undefined;
  if (!run || !inputPath) {
    report({
      ok: false,
      error: `usage: scenario.cjs <${Object.keys(SCENARIOS).join(
        '|',
      )}> <input.json>`,
    });
    return;
  }
  const input = JSON.parse(
    readFileSync(inputPath, 'utf8'),
  ) as TrustScenarioInput;
  report(await run(input));
}

void main().catch(error => {
  report({ ok: false, error: String(error) });
});
