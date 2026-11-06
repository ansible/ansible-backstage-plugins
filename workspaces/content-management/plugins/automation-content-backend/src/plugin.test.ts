/**
 * @jest-environment node
 *
 * The sign-in barrier at the plugin boundary (#977).
 *
 * router.test.ts exercises the handlers behind a permissive stub; these tests
 * prove the wiring that only exists at the plugin level: plugin.ts mounts the
 * router under the platform's default credentials policy, with GET /health as
 * the single unauthenticated exception (#958). An anonymous POST /sync must be
 * turned away before any registry work starts — caught by a loopback registry
 * the sync would otherwise hit — while a signed-in caller reaches it.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import {
  mockCredentials,
  mockServices,
  startTestBackend,
} from '@backstage/backend-test-utils';
import { MockRegistry } from '@ansible/automation-content-common';
import { automationContentPlugin } from './plugin';
import { AuthorizeResult } from '@backstage/plugin-permission-common';

/** Servers and backends started by a test, closed even when the test fails. */
const teardown: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(teardown.splice(0).map(close => close()));
});

/**
 * Serve a MockRegistry over a loopback HTTP socket, using the same thin
 * adapter ContentIndexTransport.test.ts uses for HTTPS: request → FetchLike →
 * response. The registry is empty on purpose — these tests are about the
 * barrier, not discovery, which has its own coverage.
 */
async function serveRegistry() {
  // The registry needs the final port for its advertised links, and the
  // server needs the registry — hence a holder assigned once the port is
  // known.
  const state: { registry?: MockRegistry } = {};
  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const port = (server.address() as AddressInfo).port;
      const url = `http://127.0.0.1:${port}${req.url}`;
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
    { repositories: {}, auth: 'anonymous' },
    `http://127.0.0.1:${port}`,
  );

  teardown.push(
    () =>
      new Promise<void>(resolve => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  );
  return { registry: state.registry!, url: `http://127.0.0.1:${port}` };
}

/** A test backend whose credential-less requests stay credential-less. */
async function startBackend(registryUrl: string, allowed = true) {
  const backend = await startTestBackend({
    features: [
      automationContentPlugin,
      mockServices.permissions.factory({
        result: allowed ? AuthorizeResult.ALLOW : AuthorizeResult.DENY,
      }),
      // The mock httpAuth treats anonymous requests as the default mock user,
      // which would make the barrier invisible; `none` is the honest default
      // for a request that arrives carrying no credentials at all.
      mockServices.httpAuth.factory({
        defaultCredentials: mockCredentials.none(),
      }),
      mockServices.rootConfig.factory({
        data: {
          catalog: {
            providers: {
              automationContent: {
                registries: [
                  {
                    name: 'e2e',
                    url: registryUrl,
                    // A plain HTTP loopback socket, not TLS.
                    insecure: true,
                  },
                ],
              },
            },
          },
        },
      }),
    ],
  });
  teardown.push(() => backend.stop());
  return backend;
}

describe('the sign-in barrier at the plugin boundary', () => {
  it.each(['/sync', '/registries/e2e/sync', '/registries/e2e/poll'])(
    'rejects service credentials on %s without registry work',
    async path => {
      const served = await serveRegistry();
      const backend = await startBackend(served.url);
      const response = await request(backend.server)
        .post(`/api/automation-content${path}`)
        .set('Authorization', mockCredentials.service.header());
      expect(response.status).toBe(403);
      expect(served.registry.requests).toHaveLength(0);
    },
  );

  it('allows the signed-in Guest identity without catalog lookup', async () => {
    const served = await serveRegistry();
    const backend = await startBackend(served.url);
    const response = await request(backend.server)
      .post('/api/automation-content/sync')
      .set('Authorization', mockCredentials.user.header('user:default/guest'));
    expect(response.status).toBe(200);
    expect(served.registry.requests.length).toBeGreaterThan(0);
  });

  it('keeps read routes permission-gated for signed-in users', async () => {
    const served = await serveRegistry();
    const backend = await startBackend(served.url, false);
    const response = await request(backend.server)
      .get('/api/automation-content/registries')
      .set('Authorization', mockCredentials.user.header());
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Forbidden: ansible.content.view permission required',
    });
    expect(served.registry.requests).toHaveLength(0);
  });

  it('turns an anonymous global sync away before any registry work starts', async () => {
    const served = await serveRegistry();
    const backend = await startBackend(served.url);

    const res = await request(backend.server).post(
      '/api/automation-content/sync',
    );

    expect(res.status).toBe(401);
    // The barrier, not the router, is the enforcement point: no capability
    // probe, no catalog listing, no registry request at all.
    expect(served.registry.requests.length).toBe(0);
  });

  it('lets an ordinary permitted user run the global sync once signed in', async () => {
    const served = await serveRegistry();
    const backend = await startBackend(served.url);

    const res = await request(backend.server)
      .post('/api/automation-content/sync')
      .set('Authorization', mockCredentials.user.header());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(served.registry.requests.length).toBeGreaterThan(0);
  });

  it('keeps the liveness probe reachable without credentials', async () => {
    const served = await serveRegistry();
    const backend = await startBackend(served.url);

    const res = await request(backend.server).get(
      '/api/automation-content/health',
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    // The probe must not touch the registry either — it answers a bare
    // status, nothing more.
    expect(served.registry.requests.length).toBe(0);
  });
});
