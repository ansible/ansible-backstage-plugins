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
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  mockCredentials,
  mockServices,
  startTestBackend,
} from '@backstage/backend-test-utils';
import { MockRegistry } from '@ansible/automation-content-common';
import { automationContentPlugin } from './plugin';

/** Servers and backends started by a test, closed even when the test fails. */
const teardown: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(teardown.splice(0).map(close => close()));
});

/**
 * Serve a MockRegistry over a loopback HTTP socket, using the same thin
 * adapter the transport test uses for HTTPS: request → FetchLike →
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
async function startBackend(
  registryUrl: string,
  grantedPermissions: string[] = ['ansible.content.sync'],
  manualSyncEnabled = true,
) {
  const permissions = mockServices.permissions.mock();
  permissions.authorize.mockImplementation(async queries =>
    queries.map(query => ({
      result: grantedPermissions.includes(query.permission.name)
        ? AuthorizeResult.ALLOW
        : AuthorizeResult.DENY,
    })),
  );
  const backend = await startTestBackend({
    features: [
      automationContentPlugin,
      permissions.factory,
      // The mock httpAuth treats anonymous requests as the default mock user,
      // which would make the barrier invisible; `none` is the honest default
      // for a request that arrives carrying no credentials at all.
      mockServices.httpAuth.factory({
        defaultCredentials: mockCredentials.none(),
      }),
      mockServices.rootConfig.factory({
        data: {
          automationContent: { manualSync: { enabled: manualSyncEnabled } },
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

  it('lets a signed-in caller trigger a global sync', async () => {
    const served = await serveRegistry();
    const backend = await startBackend(served.url);

    const res = await request(backend.server)
      .post('/api/automation-content/sync')
      .set('Authorization', mockCredentials.user.header());

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('scheduled');
    expect(res.body.taskId).toBeDefined();
  });

  it('honors the deployed EE view grant without granting sync', async () => {
    const served = await serveRegistry();
    const backend = await startBackend(served.url, [
      'ansible.execution-environments.view',
    ]);
    await request(backend.server)
      .get('/api/automation-content/execution-environments')
      .set('Authorization', mockCredentials.user.header())
      .expect(200);
    await request(backend.server)
      .post('/api/automation-content/sync')
      .set('Authorization', mockCredentials.user.header())
      .expect(403);
    expect(served.registry.requests).toHaveLength(0);
  });

  it('rejects service-principal sync even when the permission service allows it', async () => {
    const served = await serveRegistry();
    const backend = await startBackend(served.url);
    await request(backend.server)
      .post('/api/automation-content/sync')
      .set('Authorization', mockCredentials.service.header())
      .expect(403);
    expect(served.registry.requests).toHaveLength(0);
  });

  it('keeps scheduler diagnostics available and task mutations unavailable to HTTP callers', async () => {
    const served = await serveRegistry();
    const backend = await startBackend(served.url);
    const api = '/api/automation-content/.backstage/scheduler/v1/tasks';
    const authorization = mockCredentials.user.header();
    const list = await request(backend.server)
      .get(api)
      .set('Authorization', authorization)
      .expect(200);
    const taskIds = [
      'content-management-store-refresh',
      'content-management-drift-poll',
    ];
    expect(
      list.body.tasks.map((task: { taskId: string }) => task.taskId),
    ).toEqual(expect.arrayContaining(taskIds));
    for (const id of taskIds) {
      for (const action of ['trigger', 'cancel']) {
        await request(backend.server)
          .post(`${api}/${id}/${action}`)
          .set('Authorization', authorization)
          .expect(404);
      }
    }
    expect(served.registry.requests).toHaveLength(0);
  });

  it('keeps manual refresh unavailable when the deployment switch is off', async () => {
    const served = await serveRegistry();
    const backend = await startBackend(
      served.url,
      ['ansible.content.sync'],
      false,
    );
    await request(backend.server)
      .post('/api/automation-content/sync')
      .set('Authorization', mockCredentials.user.header())
      .expect(503);
    expect(served.registry.requests).toHaveLength(0);
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
