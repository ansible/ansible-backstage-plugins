/**
 * @jest-environment node
 *
 * The store — the client's real consumer — over real TLS (AAP-96688).
 *
 * OCITransportPolicy proves the transport policy where it is decided. These
 * tests prove what the consumer does when that policy succeeds or fails: a
 * verified registry populates the store through the real transport (no
 * injected fetch), and a registry whose certificate cannot be verified fails
 * the sync visibly — without emptying what was already stored.
 *
 * The registry itself is MockRegistry, the same fixture the hermetic tests
 * use, served over a loopback HTTPS socket so the full stack runs: config →
 * ContentStore → OCIClient → undici → TLS.
 */
import { createServer as createHttpsServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve as resolvePath } from 'node:path';
import knexFactory from 'knex';
import { defaultContentTypes } from '@ansible/plugin-catalog-backend-module-automation-content';
import {
  MockRegistry,
  type RegistryConnection,
  makeLabelledImage,
} from '@ansible/automation-content-common';
// Test-only entry point, kept outside the package's runtime barrel.
import { generateTlsTestFixtures } from '@ansible/automation-content-common/tlsCertificates';
import { ContentStore } from './ContentStore';

const EE_LABEL = 'ansible-execution-environment';

const FIXTURES = generateTlsTestFixtures();

/** Servers started by a test, closed even when the test fails. */
const servers: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()));
});

async function createTestDB() {
  const db = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });
  await db.migrate.latest({
    directory: resolvePath(__dirname, '..', 'migrations'),
  });
  return db;
}

function certificatePair(
  name:
    | 'trusted-server'
    | 'untrusted-server'
    | 'wrong-host-server'
    | 'expired-server',
): { cert: string; key: string } {
  const pairs = {
    'trusted-server': FIXTURES.trustedServer,
    'untrusted-server': FIXTURES.untrustedServer,
    'wrong-host-server': FIXTURES.wrongHostServer,
    'expired-server': FIXTURES.expiredServer,
  };
  const pair = pairs[name];
  if (!pair) throw new Error(`unknown certificate fixture: ${name}`);
  return pair;
}

/**
 * Serve a MockRegistry over a real loopback HTTPS socket.
 *
 * The adapter is deliberately thin: request → FetchLike → response. Everything
 * between — the client's dispatchers, its trust policy, TLS — is production code.
 */
async function serveRegistry(
  registryOptions: ConstructorParameters<typeof MockRegistry>[0],
  tls: { cert: string; key: string },
): Promise<{
  url: string;
  registry: MockRegistry;
  server: import('node:https').Server;
}> {
  // The registry needs the final port for its advertised bearer realm, and the
  // server needs the registry — hence a holder assigned once the port is known.
  const state: { registry?: MockRegistry } = {};
  const server = createHttpsServer(
    tls,
    async (req: IncomingMessage, res: ServerResponse) => {
      const port = (server.address() as AddressInfo).port;
      const url = `https://127.0.0.1:${port}${req.url}`;
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers[key] = value;
      }
      const upstream = await state.registry!.fetch(url, {
        method: req.method,
        headers,
      });
      const out: Record<string, string> = {};
      upstream.headers.forEach((value, key) => {
        out[key] = value;
      });
      res.writeHead(upstream.status, out);
      res.end(await upstream.text());
    },
  );
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  state.registry = new MockRegistry(
    registryOptions,
    `https://127.0.0.1:${port}`,
  );

  servers.push({
    close: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  });
  return {
    url: `https://127.0.0.1:${port}`,
    registry: state.registry!,
    server,
  };
}

function images() {
  return {
    'demo/network-ee': [makeLabelledImage('v1', { [EE_LABEL]: 'true' })],
  };
}

function connection(
  url: string,
  overrides: Partial<RegistryConnection> = {},
): RegistryConnection {
  return {
    name: 'live-tls',
    url,
    auth: { type: 'basic', username: 'user', password: 'pass' },
    repositories: ['demo/network-ee'],
    ca: FIXTURES.ca,
    ...overrides,
  };
}

const silent = { info: () => {}, debug: () => {}, warn: (_m: string) => {} };

describe('a verified registry populates the store through the real transport', () => {
  it('discovers content over HTTPS trusted via the connection CA', async () => {
    const warnings: string[] = [];
    const served = await serveRegistry(
      { repositories: images(), auth: 'bearer-challenge' },
      certificatePair('trusted-server'),
    );
    const db = await createTestDB();
    const store = new ContentStore(
      [connection(served.url)],
      db as never,
      { info: () => {}, debug: () => {}, warn: m => warnings.push(m) },
      defaultContentTypes(),
    );

    const outcome = await store.refreshRegistry('live-tls');

    expect(outcome.ok).toBe(true);
    expect(outcome.discovered).toBe(1);
    expect(await store.listArtifacts('execution-environment')).toHaveLength(1);
    expect(store.reconcileStateFor('live-tls')?.ok).toBe(true);
    // The bearer token was exchanged over the same verified transport.
    expect(served.registry.tokensIssued).toBeGreaterThan(0);
    // And nothing was warned about: this connection is ordinary.
    expect(warnings).toHaveLength(0);
  });

  it('admits an untrusted certificate only through the auditable opt-out', async () => {
    const warnings: string[] = [];
    const served = await serveRegistry(
      { repositories: images() },
      certificatePair('untrusted-server'),
    );
    const db = await createTestDB();
    const store = new ContentStore(
      [connection(served.url, { insecure: true, ca: undefined })],
      db as never,
      { info: () => {}, debug: () => {}, warn: m => warnings.push(m) },
      defaultContentTypes(),
    );

    const outcome = await store.refreshRegistry('live-tls');

    expect(outcome.ok).toBe(true);
    expect(await store.listArtifacts('execution-environment')).toHaveLength(1);
    expect(
      warnings.some(w => /insecure.*live-tls|live-tls.*insecure/.test(w)),
    ).toBe(true);
  });
});

describe('a registry that cannot be verified fails the sync, visibly', () => {
  it('reports the failure and stores nothing', async () => {
    const served = await serveRegistry(
      { repositories: images() },
      certificatePair('untrusted-server'),
    );
    // No CA configured: the default root store does not trust the test CA,
    // exactly as it would not trust a rogue or misissued certificate.
    const db = await createTestDB();
    const store = new ContentStore(
      [connection(served.url, { ca: undefined })],
      db as never,
      silent,
      defaultContentTypes(),
    );

    const outcome = await store.refreshRegistry('live-tls');

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/self-signed|certificate|verify/i);
    expect(await store.listArtifacts()).toHaveLength(0);
    const reconcile = store.reconcileStateFor('live-tls');
    expect(reconcile?.ok).toBe(false);
    expect(reconcile?.error).toMatch(/certificate|verify/i);
  });

  it('keeps previously stored content when the certificate stops verifying', async () => {
    const served = await serveRegistry(
      { repositories: images() },
      certificatePair('trusted-server'),
    );
    const db = await createTestDB();
    const store = new ContentStore(
      [connection(served.url)],
      db as never,
      silent,
      defaultContentTypes(),
    );

    const first = await store.refreshRegistry('live-tls');
    expect(first.ok).toBe(true);
    expect(await store.listArtifacts('execution-environment')).toHaveLength(1);

    // The registry's certificate rolls over to one the connection does not
    // trust. Live sockets are dropped so the next sync must re-handshake.
    const untrusted = certificatePair('untrusted-server');
    served.server.setSecureContext(untrusted);
    served.server.closeAllConnections?.();
    // Let the socket teardown reach the client's pool, so the next request
    // opens a fresh connection and negotiates against the new certificate.
    await new Promise(resolve => setTimeout(resolve, 200));

    const second = await store.refreshRegistry('live-tls');

    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/self-signed|certificate|verify/i);
    // The failed sync retained what it knew rather than emptying the store.
    expect(await store.listArtifacts('execution-environment')).toHaveLength(1);
    expect(second.discovered).toBe(1);
  });
});
