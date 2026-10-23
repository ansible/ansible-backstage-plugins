import express from 'express';
import request from 'supertest';
import { ContentIndex } from './ContentIndex';
import { createRouter } from './router';

const logger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {},
  child: () => logger,
} as never;

async function appWith(index: ContentIndex, httpAuth?: unknown) {
  const app = express();
  app.use(
    await createRouter({
      index,
      logger,
      httpAuth: (httpAuth ?? {
        // Permissive by default: the credentials barrier, not the router, is
        // what these tests exercise elsewhere.
        credentials: () => Promise.resolve({}),
      }) as never,
    }),
  );
  // Mirrors the backend's root error handler, which maps a rejected
  // `httpAuth.credentials` call to a 401 rather than a 500.
  app.use(
    (
      _err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(401).json({ error: 'unauthenticated' });
    },
  );
  return app;
}

/**
 * Seed the index without touching a registry.
 *
 * The private fields are written directly because the point of these tests is the HTTP
 * contract, not discovery — which has its own coverage.
 */
function seed(items: Array<Record<string, unknown>>): ContentIndex {
  const index = new ContentIndex([], {
    info: () => {},
    warn: () => {},
    debug: () => {},
  });
  const artifact = {
    ref: 'reg/repo@sha256:abc',
    type: 'execution-environment',
    registry: 'reg',
    repository: 'repo',
    digest: 'sha256:abc',
    tags: ['latest'],
    pullReference: 'reg/repo@sha256:abc',
    contentsKnown: true,
    classification: {
      type: 'execution-environment',
      confidence: 'certain',
      signals: [],
    },
    manifest: { collections: [], generatedBy: {}, complete: true },
  };
  (index as unknown as { artifacts: unknown[] }).artifacts = [artifact];
  const map = new Map<string, unknown>();
  for (const item of items) {
    map.set(`${artifact.ref}::${item.fqcn}`, {
      key: `${artifact.ref}::${item.fqcn}`,
      artifactRef: artifact.ref,
      collection: 'cisco.ios',
      collectionVersion: '1.0.0',
      ...item,
    });
  }
  (index as unknown as { items: Map<string, unknown> }).items = map;
  return index;
}

describe('documentation field normalisation', () => {
  /**
   * ansible-doc emits `description`, `author` and `notes` as either a scalar or a list
   * depending on how each collection author wrote the YAML. The API declares arrays, so
   * it must deliver arrays — a consumer that trusts the contract crashed on this.
   */
  it('coerces a string description to an array', async () => {
    const index = seed([
      {
        fqcn: 'cisco.ios.ios_acls',
        name: 'ios_acls',
        type: 'module',
        detail: { description: 'Resource module to configure ACLs.' },
      },
    ]);
    const res = await request(await appWith(index)).get(
      '/content-items/cisco.ios.ios_acls',
    );

    expect(res.status).toBe(200);
    expect(res.body.description).toEqual([
      'Resource module to configure ACLs.',
    ]);
  });

  it('coerces a string author to an array', async () => {
    const index = seed([
      {
        fqcn: 'ansible.netcommon.parse_cli',
        name: 'parse_cli',
        type: 'filter',
        detail: { author: 'Ansible Network Team' },
      },
    ]);
    const res = await request(await appWith(index)).get(
      '/content-items/ansible.netcommon.parse_cli',
    );

    expect(res.body.author).toEqual(['Ansible Network Team']);
  });

  it('leaves genuine arrays untouched', async () => {
    const index = seed([
      {
        fqcn: 'cisco.ios.ios_vlans',
        name: 'ios_vlans',
        type: 'module',
        detail: { description: ['line one', 'line two'], author: ['A', 'B'] },
      },
    ]);
    const res = await request(await appWith(index)).get(
      '/content-items/cisco.ios.ios_vlans',
    );

    expect(res.body.description).toEqual(['line one', 'line two']);
    expect(res.body.author).toEqual(['A', 'B']);
  });

  it('omits the field entirely when absent, rather than emitting null', async () => {
    const index = seed([
      { fqcn: 'cisco.ios.ios', name: 'ios', type: 'cliconf', detail: {} },
    ]);
    const res = await request(await appWith(index)).get(
      '/content-items/cisco.ios.ios',
    );

    expect('description' in res.body).toBe(false);
    expect(res.body.fqcn).toBe('cisco.ios.ios');
  });

  it('always returns providedBy as an array', async () => {
    const index = seed([
      {
        fqcn: 'cisco.ios.ios_vlans',
        name: 'ios_vlans',
        type: 'module',
        detail: {},
      },
    ]);
    const res = await request(await appWith(index)).get(
      '/content-items/cisco.ios.ios_vlans',
    );

    expect(Array.isArray(res.body.providedBy)).toBe(true);
    expect(res.body.providedBy).toContain('reg/repo@sha256:abc');
  });
});

describe('GET /health', () => {
  it('returns an ok status for a liveness check', async () => {
    const index = seed([]);
    const res = await request(await appWith(index)).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('registry mutation authentication', () => {
  /**
   * The `/registries` prefix carries an unauthenticated policy so `GET /registries`
   * stays inspectable. Backstage matches policies as path prefixes with no method
   * awareness, so the mutating sub-routes must enforce credentials themselves.
   */
  it('rejects an unauthenticated poll of a registry', async () => {
    const index = seed([]);
    const httpAuth = {
      credentials: jest.fn().mockRejectedValue(new Error('unauthenticated')),
    };
    const res = await request(await appWith(index, httpAuth as never)).post(
      '/registries/reg/poll',
    );

    expect(res.status).toBe(401);
    expect(httpAuth.credentials).toHaveBeenCalledWith(expect.anything(), {
      allow: ['user', 'service'],
    });
  });

  it('rejects an unauthenticated sync of a registry', async () => {
    // Both mutating sub-routes must enforce credentials, not just poll — an
    // anonymous caller must not be able to trigger a full registry re-read.
    const index = seed([]);
    const httpAuth = {
      credentials: jest.fn().mockRejectedValue(new Error('unauthenticated')),
    };
    const res = await request(await appWith(index, httpAuth as never)).post(
      '/registries/reg/sync',
    );

    expect(res.status).toBe(401);
  });

  it('proceeds to the registry lookup once credentials are accepted', async () => {
    // Enforcement must not overreach: an authenticated caller still gets the
    // normal 404 for an unknown registry, not an auth error.
    const index = seed([]);
    const res = await request(await appWith(index)).post(
      '/registries/reg/poll',
    );

    // Authentication passed; the 404 is the "no such registry" answer.
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('REGISTRY_NOT_FOUND');
  });
});
