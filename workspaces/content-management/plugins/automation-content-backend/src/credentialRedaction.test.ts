/** @jest-environment node */
/**
 * Credential redaction across the whole HTTP surface (AAP-96687).
 *
 * router.test.ts proves individual handlers behave; these tests hold the
 * security boundary itself. Whichever route serves a response, and whatever
 * registry-controlled string or failure detail that response carries, no
 * configured credential — password, token, basic-auth wire form, or a
 * password embedded in the registry URL — leaves the API. The route table
 * is extracted from the router source, so a route added without a case
 * here fails the suite rather than silently escaping the boundary.
 *
 * The sibling suites cover the layers below: CredentialRedactor.test.ts
 * (the utility), ContentStore.test.ts and OCIClient.test.ts (discovery and
 * the client), and the catalog module's credentialRedaction.test.ts
 * (entity publication).
 */
import express from 'express';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContentStore, IndexedArtifact, IndexedItem } from './ContentStore';
import { createRouter } from './router';
import {
  fakeRegistryCredentials,
  redactorForConnections,
} from '@ansible/automation-content-common';

const EE_LABEL = 'ansible-execution-environment';
const EE_TYPE = 'execution-environment';

/** One distinct credential per channel the configuration offers. */
const FAKE_CREDENTIALS = fakeRegistryCredentials();
const SECRET = FAKE_CREDENTIALS.password; // basic-auth password
const BASIC_WIRE_FORM = Buffer.from(`ci:${SECRET}`, 'utf8').toString('base64');
const TOKEN = FAKE_CREDENTIALS.token; // configured bearer token
const URL_PASSWORD = FAKE_CREDENTIALS.urlPasswordEncoded;
const URL_PASSWORD_DECODED = FAKE_CREDENTIALS.urlPasswordDecoded;

const ALL_CREDENTIALS = [
  SECRET,
  BASIC_WIRE_FORM,
  TOKEN,
  URL_PASSWORD,
  URL_PASSWORD_DECODED,
];

/** The one assertion every case boils down to, stated once. */
function expectCredentialFree(text: string) {
  for (const credential of ALL_CREDENTIALS) {
    expect(text).not.toContain(credential);
  }
}

function connections() {
  return [
    {
      name: 'basic-reg',
      url: `https://ci:${SECRET}@mock.registry`,
      auth: { type: 'basic' as const, username: 'ci', password: SECRET },
      repositories: ['demo/ee'],
    },
    {
      name: 'token-reg',
      url: 'https://mock.registry',
      auth: { type: 'bearer' as const, token: TOKEN },
      repositories: ['demo/ee'],
    },
    {
      name: 'urlpw-reg',
      url: `https://ci:${URL_PASSWORD}@mock.registry`,
      auth: { type: 'anonymous' as const },
      repositories: ['demo/ee'],
    },
  ];
}

const REF = 'basic-reg/demo/ee@sha256:abc';

/** Seed a ContentStore-shaped database boundary entirely in memory. */
function seededStore(_logs: string[] = []): ContentStore {
  const registryConnections = connections();
  const redactor = redactorForConnections(registryConnections);
  const artifact: IndexedArtifact = {
    ref: REF,
    type: EE_TYPE,
    registry: 'basic-reg',
    repository: 'demo/ee',
    digest: 'sha256:abc',
    tags: ['v1'],
    pullReference: 'mock.registry/demo/ee:sha256:abc',
    contentsKnown: true,
    classification: {
      type: EE_TYPE,
      confidence: 'certain',
      signals: [`label ${EE_LABEL}=true`, `config blob mentions ${SECRET}`],
      readsContentManifest: true,
    },
    manifest: {
      schemaVersion: '1.0.0',
      collections: [
        {
          namespace: 'demo',
          name: 'net',
          version: '1.0.0',
          description: `networking collection built with ${SECRET}`,
          plugins: [],
          roles: [],
          playbooks: [],
          edaPlugins: [],
          rulebooks: [],
        },
      ],
      generatedBy: {
        tool: 'ansible-builder',
        version: '1.2',
        ansibleCore: '2.16',
      },
      generatedAt: '2026-01-01T00:00:00Z',
      complete: true,
    },
  } as IndexedArtifact;
  const items = new Map<string, IndexedItem>([
    [
      `${REF}::demo.net.vlans`,
      {
        key: `${REF}::demo.net.vlans`,
        artifactRef: REF,
        fqcn: 'demo.net.vlans',
        name: 'vlans',
        type: 'module',
        collection: 'demo.net',
        collectionVersion: '1.0.0',
        detail: {
          description: `documentation mentioning ${SECRET}`,
          author: [],
        },
      },
    ],
  ]);
  const states = registryConnections.map(connection => ({ connection }));
  const failureFor = (name: string) => {
    if (name === 'basic-reg')
      return `fetch failed: authorization rejected for ${SECRET}`;
    if (name === 'token-reg') return `token exchange rejected ${TOKEN}`;
    return `proxy auth failed for ${URL_PASSWORD_DECODED}`;
  };
  const store = {
    redactor,
    items,
    listRegistries: () => states,
    getRegistry: (name: string) => states.find(s => s.connection.name === name),
    reconcileStateFor: (name: string) => ({
      at: '2026-01-01T00:00:00.000Z',
      ok: false,
      error: redactor.redact(failureFor(name)),
      artifacts: 1,
    }),
    driftStateFor: () => ({
      at: '2026-01-01T00:00:00.000Z',
      changed: false,
      details: [redactor.redact(failureFor('basic-reg'))],
      requests: 1,
    }),
    refreshedAt: undefined,
    cacheStats: { hits: 0, misses: 0, entries: 0 },
    listArtifacts: async (type?: string) =>
      !type || type === artifact.type ? [artifact] : [],
    listArtifactsPaginated: async (opts?: { type?: string }) => {
      const filtered =
        !opts?.type || opts.type === artifact.type ? [artifact] : [];
      return { items: filtered, totalCount: filtered.length };
    },
    getArtifact: async (ref: string) => (ref === REF ? artifact : undefined),
    listItems: async () => [...items.values()],
    itemsIn: async (ref: string) =>
      [...items.values()].filter(item => item.artifactRef === ref),
    findItems: async (fqcn: string, artifactRef?: string) =>
      [...items.values()].filter(
        item =>
          item.fqcn === fqcn &&
          (artifactRef === undefined || item.artifactRef === artifactRef),
      ),
    listCollections: async () => [
      {
        ...artifact.manifest!.collections[0],
        fqcn: 'demo.net',
        providedBy: [REF],
      },
    ],
    countsFor: () => ({ collections: 1, plugins: 1 }),
    repositoryTags: async () => [],
    reconcileStateForArtifact: () => ({
      at: '2026-01-01T00:00:00.000Z',
      ok: false,
      error: redactor.redact(failureFor('basic-reg')),
      artifacts: 1,
    }),
    syncArtifact: async () => ({
      status: 'completed',
      ref: REF,
      tag: 'latest',
      retainedPrevious: false,
    }),
    refreshRegistry: async (name: string) => ({
      discovered: 0,
      ok: false,
      error: redactor.redactErrorText(new Error(failureFor(name))),
    }),
    pollRegistry: async () => ({
      changed: false,
      refreshed: false,
      details: [redactor.redact(failureFor('basic-reg'))],
      requests: 1,
    }),
  } as unknown as ContentStore;
  return store;
}

/** Mount the real router over a seeded store, capturing its log lines. */
async function appWith(store: ContentStore, logs: string[] = []) {
  const app = express();
  app.use(
    await createRouter({
      db: store,
      logger: {
        info: (m: string) => logs.push(m),
        warn: (m: string) => logs.push(m),
        debug: (m: string) => logs.push(m),
        child: () => undefined,
      } as never,
      // The router's routes sit behind the plugin's sign-in barrier (#977),
      // which these tests bypass on purpose — plugin.test.ts covers the
      // barrier itself. This stub only satisfies RouterOptions.
      httpAuth: {
        credentials: () =>
          Promise.resolve({
            principal: { type: 'user', userEntityRef: 'user:default/test' },
          }),
      } as never,
      // Reads and syncs are authorized; the gating itself has coverage in
      // router.test.ts.
      permissions: {
        authorize: async () => [{ result: 'ALLOW' as const }],
      } as never,
    }),
  );
  return app;
}

/** One route, the request that reaches it, and the proof it was reached. */
interface RouteCase {
  route: string;
  run: (app: express.Express) => request.Test;
  check: (res: request.Response) => void;
}

const CASES: RouteCase[] = [
  {
    route: 'GET /health',
    run: app => request(app).get('/health'),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    },
  },
  {
    route: 'GET /repositories/:registry/:repository/tags',
    run: app => request(app).get('/repositories/basic-reg/demo/ee/tags'),
    check: res => {
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('secret');
    },
  },
  {
    route: 'GET /registries',
    run: app => request(app).get('/registries'),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(3);
      // Whatever userinfo the configured URLs carried, the served form is
      // the public one.
      expect(res.body.items.map((item: { url: string }) => item.url)).toEqual([
        'https://mock.registry',
        'https://mock.registry',
        'https://mock.registry',
      ]);
    },
  },
  {
    route: 'POST /artifacts/:ref/sync',
    run: app => request(app).post(`/artifacts/${encodeURIComponent(REF)}/sync`),
    check: res => {
      expect(res.status).toBe(202);
      // A clean sync outcome carries no diagnostic text at all; the redactor
      // boundary is still exercised because every JSON response passes
      // through it on the way out.
      expect(JSON.stringify(res.body)).not.toContain('secret');
    },
  },
  {
    route: 'POST /sync',
    run: app => request(app).post('/sync'),
    check: res => {
      expect(res.status).toBe(207);
      expect(res.body.status).toBe('partial');
      expect(res.body.registries).toHaveLength(3);
      for (const outcome of res.body.registries) {
        expect(outcome.ok).toBe(false);
        expect(outcome.error).toContain('[REDACTED]');
      }
    },
  },
  {
    route: 'POST /registries/:name/poll',
    run: app => request(app).post('/registries/basic-reg/poll'),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.changed).toBe(false);
      expect(res.body.details.join('\n')).toContain('[REDACTED]');
    },
  },
  {
    route: 'POST /registries/:name/sync',
    run: app => request(app).post('/registries/basic-reg/sync'),
    check: res => {
      expect(res.status).toBe(202);
      expect(res.body.status).toBe('failed');
      expect(res.body.error).toContain('[REDACTED]');
    },
  },
  {
    route: 'GET /content',
    run: app => request(app).get('/content'),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items[0].classification.signals.join(' ')).toContain(
        '[REDACTED]',
      );
    },
  },
  {
    route: 'GET /content/:ref(*)/contents',
    run: app => request(app).get(`/content/${REF}/contents`),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.collections[0].fqcn).toBe('demo.net');
    },
  },
  {
    route: 'GET /content/:ref(*)',
    run: app => request(app).get(`/content/${REF}`),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.ref).toBe(REF);
      expect(res.body.classification.signals.join(' ')).toContain('[REDACTED]');
    },
  },
  {
    route: 'GET /execution-environments',
    run: app => request(app).get('/execution-environments'),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThan(0);
    },
  },
  {
    route: 'GET /execution-environments/:ref(*)/contents',
    run: app => request(app).get(`/execution-environments/${REF}/contents`),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.collections[0].fqcn).toBe('demo.net');
    },
  },
  {
    route: 'GET /execution-environments/:ref(*)',
    run: app => request(app).get(`/execution-environments/${REF}`),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.pullReference).toContain('demo/ee');
    },
  },
  {
    route: 'GET /collections',
    run: app => request(app).get('/collections'),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.items[0].fqcn).toBe('demo.net');
      expect(res.body.items[0].description).toContain('[REDACTED]');
    },
  },
  {
    route: 'GET /collections/:namespace/:name',
    run: app => request(app).get('/collections/demo/net'),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.description).toContain('[REDACTED]');
      expect(res.body.versions[0].version).toBe('1.0.0');
    },
  },
  {
    route: 'GET /content-items',
    run: app => request(app).get('/content-items'),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.totalItems).toBeGreaterThan(0);
    },
  },
  {
    route: 'GET /content-items/:fqcn',
    run: app => request(app).get('/content-items/demo.net.vlans'),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.description).toEqual([
        'documentation mentioning [REDACTED]',
      ]);
    },
  },
  {
    route: 'GET /plugins',
    run: app => request(app).get('/plugins'),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.totalItems).toBeGreaterThan(0);
    },
  },
  {
    route: 'GET /plugins/:fqcn',
    run: app => request(app).get('/plugins/demo.net.vlans'),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.fqcn).toBe('demo.net.vlans');
    },
  },
  {
    route: 'POST /resolve/requirements',
    run: app =>
      request(app)
        .post('/resolve/requirements')
        .send({ collections: ['demo.net'] }),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.satisfiedBy[0].ref).toBe(REF);
      expect(res.body.satisfiedBy[0].matched[0].fqcn).toBe('demo.net');
    },
  },
  {
    route: 'POST /config/validate',
    // A registry named after the credential: the echoed duplicate-name
    // diagnostic is the last place it must not appear verbatim.
    run: app =>
      request(app)
        .post('/config/validate')
        .send({
          apiVersion: 'content.ansible.com/v1',
          kind: 'ContentConfiguration',
          registries: [
            { name: SECRET, url: 'https://mock.registry' },
            { name: SECRET, url: 'https://mock.registry' },
          ],
        }),
    check: res => {
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(JSON.stringify(res.body.errors)).toContain('[REDACTED]');
    },
  },
];

describe('every route serves credential-free responses', () => {
  it.each(CASES)('$route', async ({ run, check }) => {
    const logs: string[] = [];
    const res = await run(await appWith(seededStore(logs), logs));

    check(res);
    // Stated inline rather than through the helper, so the case body's
    // assertions are visible where they happen — and to the linter.
    for (const credential of ALL_CREDENTIALS) {
      expect(res.text).not.toContain(credential);
    }
  });

  it('covers every route the router registers', () => {
    // Same extraction as api/scripts/check-drift.mjs, so a route added to
    // the router without a case above fails here rather than sailing
    // through unreviewed.
    const source = readFileSync(join(__dirname, 'router.ts'), 'utf8');
    const declared = [
      ...source.matchAll(
        /router\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g,
      ),
    ].map(([, method, path]) => `${method.toUpperCase()} ${path}`);

    expect(new Set(CASES.map(testcase => testcase.route))).toEqual(
      new Set(declared),
    );
  });
});

describe('a token exchanged at runtime', () => {
  it('redacts a runtime token from responses and logs the moment it exists', async () => {
    // The router reads the index's live redactor: a bearer token the
    // registry issues mid-flight must be recognised by later responses,
    // not just by the redactor object in isolation.
    const logs: string[] = [];
    const store = seededStore(logs);
    store.redactor.addRuntimeSecret('mock-token', 300_000, 'token-reg');
    (
      store as unknown as {
        refreshRegistry: () => Promise<{
          discovered: number;
          ok: boolean;
          error: string;
        }>;
      }
    ).refreshRegistry = async () => ({
      discovered: 0,
      ok: false,
      error: '401: Bearer mock-token rejected',
    });

    const res = await request(await appWith(store, logs)).post(
      '/registries/basic-reg/sync',
    );

    expect(res.status).toBe(202);
    expect(res.body.error).toContain('[REDACTED]');
    expectCredentialFree(res.text);
    expect(res.text).not.toContain('mock-token');
    expect(logs.join('\n')).not.toContain('mock-token');
  });
});

describe('log lines the sync path writes', () => {
  it('are redacted', async () => {
    const logs: string[] = [];
    const res = await request(await appWith(seededStore(logs), logs)).post(
      '/sync',
    );

    expect(res.status).toBe(207);
    expect(logs.length).toBeGreaterThan(0);
    expectCredentialFree(logs.join('\n'));
  });
});

describe('errors that escape a handler', () => {
  /**
   * The platform's error middleware serialises whatever it is handed. This
   * worst-case handler renders message, stack and cause — everything the
   * platform could possibly echo — so the test sees the most the error
   * could have leaked, not the least.
   */
  async function appWorstCase(index: ContentStore) {
    const app = await appWith(index);
    app.use(((
      err: Error & { status?: number; statusCode?: number },
      _req: unknown,
      res: {
        status: (code: number) => { send: (body: string) => unknown };
        send: (body: string) => unknown;
      },
      _next: unknown,
    ) => {
      const status = err.statusCode ?? err.status ?? 500;
      const cause = (err as { cause?: unknown }).cause;
      res
        .status(status)
        .send(
          `${err.message}\n${err.stack ?? ''}\n${
            cause === undefined ? '' : String(cause)
          }`,
        );
    }) as never);
    return app;
  }

  it('is redacted in place before the platform formats it', async () => {
    const index = seededStore();
    // A hostile index entry whose documentation explodes when read — the
    // unexpected handler fault the trailing middleware exists for. The
    // error quotes one credential in its message and another in its cause.
    const hostile = {
      key: `${REF}::demo.boom`,
      artifactRef: REF,
      fqcn: 'demo.boom',
      name: 'boom',
      type: 'module',
      collection: 'demo.net',
      collectionVersion: '1.0.0',
    };
    Object.defineProperty(hostile, 'detail', {
      get() {
        const error = new Error(`render failed for ${SECRET}`);
        (error as { cause?: unknown }).cause = new Error(
          `inner cause quotes ${TOKEN}`,
        );
        throw error;
      },
    });
    (index as unknown as { items: Map<string, unknown> }).items.set(
      `${REF}::demo.boom`,
      hostile,
    );

    const res = await request(await appWorstCase(index)).get(
      '/content-items/demo.boom',
    );

    expect(res.status).toBe(500);
    expect(res.text).toContain('[REDACTED]');
    expectCredentialFree(res.text);
  });

  it('redacts a JSON parse failure whose message quotes the request body', async () => {
    // Node's JSON.parse messages include a snippet of the offending input,
    // so a credential typed into a request body reaches the parser's error
    // message — and from there the platform's serialisation of it.
    const res = await request(await appWorstCase(seededStore()))
      .post('/config/validate')
      .set('Content-Type', 'application/json')
      .send(`{"a": ${SECRET}}`);

    expect(res.status).toBe(400);
    expectCredentialFree(res.text);
  });

  it('falls back to a clean error when the original message is read-only', async () => {
    const index = seededStore();
    const hostile = {
      key: `${REF}::demo.timeout`,
      artifactRef: REF,
      fqcn: 'demo.timeout',
      name: 'timeout',
      type: 'module',
      collection: 'demo.net',
      collectionVersion: '1.0.0',
    };
    Object.defineProperty(hostile, 'detail', {
      get() {
        throw new DOMException(
          `render timed out for ${SECRET}`,
          'TimeoutError',
        );
      },
    });
    (index as unknown as { items: Map<string, unknown> }).items.set(
      `${REF}::demo.timeout`,
      hostile,
    );

    const res = await request(await appWorstCase(index)).get(
      '/content-items/demo.timeout',
    );

    expect(res.status).toBe(500);
    expectCredentialFree(res.text);
    expect(res.text).toContain('[REDACTED]');
  });
});
