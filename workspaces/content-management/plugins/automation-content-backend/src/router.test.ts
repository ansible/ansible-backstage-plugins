import express from 'express';
import request from 'supertest';
import { ContentStore, IndexedArtifact, IndexedItem } from './ContentStore';
import { createRouter, RECONCILE_FAILURE_SUMMARY } from './router';

const logger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {},
  child: () => logger,
} as never;

function stubDB(overrides: Partial<ContentStore> = {}): ContentStore {
  return {
    listRegistries: () => [],
    getRegistry: () => undefined,
    reconcileStateFor: () => undefined,
    driftStateFor: () => undefined,
    get refreshedAt() {
      return undefined;
    },
    get cacheStats() {
      return { hits: 0, misses: 0, entries: 0 };
    },
    listArtifacts: async () => [],
    getArtifact: async () => undefined,
    listItems: async () => [],
    itemsIn: async () => [],
    findItems: async () => [],
    listCollections: async () => [],
    countsFor: () => undefined,
    refreshRegistry: async () => ({ discovered: 0, ok: true }),
    refreshAll: async () => ({ artifacts: 0, items: 0 }),
    pollRegistry: async () => ({
      changed: false,
      refreshed: false,
      details: [],
      requests: 0,
    }),
    pollAll: async () => ({ checked: 0, refreshed: 0, requests: 0 }),
    ...overrides,
  } as ContentStore;
}

async function appWith(db?: ContentStore) {
  const app = express();
  app.use(
    await createRouter({
      db: db ?? stubDB(),
      logger,
      httpAuth: {
        credentials: () =>
          Promise.resolve({
            principal: { type: 'user', userEntityRef: 'user:default/test' },
          }),
      } as never,
    }),
  );
  return app;
}

const DEFAULT_ARTIFACT: IndexedArtifact = {
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
  } as never,
  manifest: { collections: [], generatedBy: {}, complete: true } as never,
};

function seedDB(items: Array<Record<string, unknown>>): ContentStore {
  const seededItems: IndexedItem[] = items.map(item => ({
    key: `${DEFAULT_ARTIFACT.ref}::${item.fqcn}`,
    fqcn: item.fqcn as string,
    name: item.name as string,
    type: item.type as string,
    collection: 'cisco.ios',
    collectionVersion: '1.0.0',
    artifactRef: DEFAULT_ARTIFACT.ref,
    ...item,
  })) as IndexedItem[];

  return stubDB({
    listArtifacts: async () => [DEFAULT_ARTIFACT],
    getArtifact: async (ref: string) =>
      ref === DEFAULT_ARTIFACT.ref ? DEFAULT_ARTIFACT : undefined,
    listItems: async () => seededItems,
    itemsIn: async (artifactRef: string) =>
      seededItems.filter(i => i.artifactRef === artifactRef),
    findItems: async (fqcn: string, artifactRef?: string) => {
      let result = seededItems.filter(i => i.fqcn === fqcn);
      if (artifactRef)
        result = result.filter(i => i.artifactRef === artifactRef);
      return result;
    },
  });
}

function seedArtifacts(count: number): ContentIndex {
  const index = new ContentIndex([], {
    info: () => {},
    warn: () => {},
    debug: () => {},
  });
  const artifacts = Array.from({ length: count }, (_, i) => ({
    ref: `reg/repo-${i}@sha256:${i}`,
    type: 'execution-environment',
    registry: 'reg',
    repository: `repo-${i}`,
    digest: `sha256:${i}`,
    tags: ['latest'],
    pullReference: `reg/repo-${i}@sha256:${i}`,
    contentsKnown: true,
    classification: {
      type: 'execution-environment',
      signals: [],
      readsContentManifest: true,
    },
    manifest: { collections: [], generatedBy: {}, complete: true },
  }));
  (index as unknown as { artifacts: unknown[] }).artifacts = artifacts;
  (index as unknown as { items: Map<string, unknown> }).items = new Map();
  return index;
}

describe('GET /content pagination', () => {
  it('returns paginated results with all links', async () => {
    const index = seedArtifacts(15);
    const res = await request(await appWith(index)).get('/content');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
    expect(res.body.totalItems).toBe(15);
    expect(res.body.items).toHaveLength(10);
    expect(res.body.next).toBe('?page=2');
    expect(res.body.previous).toBeNull();
    expect(res.body.firstPage).toBe('?page=1');
    expect(res.body.lastPage).toBe('?page=2');
  });

  it('returns previous link and null next on the last page', async () => {
    const index = seedArtifacts(15);
    const res = await request(await appWith(index)).get('/content?page=2');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.items).toHaveLength(5);
    expect(res.body.next).toBeNull();
    expect(res.body.previous).toBe('?page=1');
  });

  it.each([
    { per_page: 10, expectedSize: 10 },
    { per_page: 20, expectedSize: 20 },
    { per_page: 50, expectedSize: 50 },
    { per_page: 99, expectedSize: 10 },
  ])(
    'per_page=$per_page returns $expectedSize items',
    async ({ per_page, expectedSize }) => {
      const index = seedArtifacts(55);
      const res = await request(await appWith(index)).get(
        `/content?per_page=${per_page}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.pageSize).toBe(expectedSize);
      expect(res.body.items).toHaveLength(expectedSize);
    },
  );

  it('preserves filter params in pagination links', async () => {
    const index = seedArtifacts(15);
    const res = await request(await appWith(index)).get(
      '/content?type=execution-environment',
    );

    expect(res.body.next).toContain('type=execution-environment');
    expect(res.body.next).toContain('page=2');
  });

  it('applies pagination to the /execution-environments alias', async () => {
    const index = seedArtifacts(15);
    const res = await request(await appWith(index)).get(
      '/execution-environments',
    );

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.items).toHaveLength(10);
    expect(res.body.totalItems).toBe(15);
    expect(res.body.next).toContain('page=2');
  });
});

describe('documentation field normalisation', () => {
  it('coerces a string description to an array', async () => {
    const db = seedDB([
      {
        fqcn: 'cisco.ios.ios_acls',
        name: 'ios_acls',
        type: 'module',
        detail: { description: 'Resource module to configure ACLs.' },
      },
    ]);
    const res = await request(await appWith(db)).get(
      '/content-items/cisco.ios.ios_acls',
    );

    expect(res.status).toBe(200);
    expect(res.body.description).toEqual([
      'Resource module to configure ACLs.',
    ]);
  });

  it('coerces a string author to an array', async () => {
    const db = seedDB([
      {
        fqcn: 'ansible.netcommon.parse_cli',
        name: 'parse_cli',
        type: 'filter',
        detail: { author: 'Ansible Network Team' },
      },
    ]);
    const res = await request(await appWith(db)).get(
      '/content-items/ansible.netcommon.parse_cli',
    );

    expect(res.body.author).toEqual(['Ansible Network Team']);
  });

  it('leaves genuine arrays untouched', async () => {
    const db = seedDB([
      {
        fqcn: 'cisco.ios.ios_vlans',
        name: 'ios_vlans',
        type: 'module',
        detail: { description: ['line one', 'line two'], author: ['A', 'B'] },
      },
    ]);
    const res = await request(await appWith(db)).get(
      '/content-items/cisco.ios.ios_vlans',
    );

    expect(res.body.description).toEqual(['line one', 'line two']);
    expect(res.body.author).toEqual(['A', 'B']);
  });

  it('omits the field entirely when absent, rather than emitting null', async () => {
    const db = seedDB([
      { fqcn: 'cisco.ios.ios', name: 'ios', type: 'cliconf', detail: {} },
    ]);
    const res = await request(await appWith(db)).get(
      '/content-items/cisco.ios.ios',
    );

    expect('description' in res.body).toBe(false);
    expect(res.body.fqcn).toBe('cisco.ios.ios');
  });

  it('always returns providedBy as an array', async () => {
    const db = seedDB([
      {
        fqcn: 'cisco.ios.ios_vlans',
        name: 'ios_vlans',
        type: 'module',
        detail: {},
      },
    ]);
    const res = await request(await appWith(db)).get(
      '/content-items/cisco.ios.ios_vlans',
    );

    expect(Array.isArray(res.body.providedBy)).toBe(true);
    expect(res.body.providedBy).toContain('reg/repo@sha256:abc');
  });
});

describe('GET /health', () => {
  it('returns an ok status for a liveness check', async () => {
    const res = await request(await appWith()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('diagnostics are summarised on the registry listing', () => {
  const corporateConnection = {
    name: 'corporate',
    url: 'https://registry.corp.example.com',
    auth: { type: 'anonymous' },
  };

  const reconcileError =
    `repository listing failed: fetch failed: Hostname/IP does not match ` +
    `certificate's altnames: Hostname: registry.corp.example.com. is not ` +
    `in cert's altnames: DNS:secret-host.internal`;

  function dbWithFailedReconcile(
    overrides: Partial<ContentStore> = {},
  ): ContentStore {
    return stubDB({
      listRegistries: () => [{ connection: corporateConnection as never }],
      getRegistry: (name: string) =>
        name === 'corporate'
          ? { connection: corporateConnection as never }
          : undefined,
      reconcileStateFor: () => ({
        at: '2026-10-22T00:00:00.000Z',
        ok: false,
        error: reconcileError,
        artifacts: 2,
      }),
      driftStateFor: () => ({
        at: '2026-10-22T00:00:00.000Z',
        changed: false,
        details: ['check failed: connection refused from 10.1.2.3'],
        requests: 3,
      }),
      ...overrides,
    });
  }

  it('replaces the reconcile error with the fixed summary on /registries', async () => {
    const db = dbWithFailedReconcile();
    const res = await request(await appWith(db)).get('/registries');

    expect(res.status).toBe(200);
    const corporate = res.body.items.find(
      (item: { name: string }) => item.name === 'corporate',
    );
    expect(corporate.lastReconcileOk).toBe(false);
    expect(corporate.lastReconciledAt).toBe('2026-10-22T00:00:00.000Z');
    expect(corporate.lastReconcileError).toBe(RECONCILE_FAILURE_SUMMARY);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('secret-host.internal');
    expect(body).not.toContain('altnames');
    expect(body).not.toContain('10.1.2.3');
  });

  it('keeps the detailed cause on the per-registry sync response', async () => {
    const db = dbWithFailedReconcile({
      refreshRegistry: async () => ({
        discovered: 0,
        ok: false,
        error: 'fetch failed: certificate has expired',
      }),
    });
    const res = await request(await appWith(db)).post(
      '/registries/corporate/sync',
    );

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('failed');
    expect(res.body.error).toContain('certificate has expired');
  });

  it('keeps the detailed cause on the global sync response', async () => {
    const detail = 'certificate altnames: DNS:secret-host.internal (10.1.2.3)';
    const db = dbWithFailedReconcile({
      refreshRegistry: async () => ({
        discovered: 0,
        ok: false,
        error: detail,
      }),
    });

    const res = await request(await appWith(db)).post('/sync');

    expect(res.status).toBe(207);
    expect(res.body.status).toBe('partial');
    const outcome = res.body.registries[0];
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain(detail);
  });

  it('completes a global sync of healthy registries', async () => {
    const db = dbWithFailedReconcile({
      refreshRegistry: async () => ({
        ok: true,
        discovered: 3,
      }),
    });

    const res = await request(await appWith(db)).post('/sync');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.registries).toEqual([
      { registry: 'corporate', ok: true, discovered: 3 },
    ]);
  });
});

describe('GET /registries', () => {
  it.each([undefined, { at: '2026-10-31', ok: true, artifacts: 0 }])(
    'omits failure diagnostics when reconciliation is %p',
    async reconcile => {
      const mockConnection = {
        name: 'mock',
        url: 'https://mock.registry',
        auth: { type: 'anonymous' },
      };
      const db = stubDB({
        listRegistries: () => [{ connection: mockConnection as never }],
        reconcileStateFor: () => reconcile as never,
        driftStateFor: () => undefined,
      });
      const res = await request(await appWith(db)).get('/registries');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).not.toHaveProperty('lastReconcileError');
      expect(res.body.items[0].lastReconcileOk).toBe(reconcile?.ok);
    },
  );
  it('returns empty items when none are configured', async () => {
    const res = await request(await appWith()).get('/registries');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('POST poll returns 404 for an unknown registry', async () => {
    const res = await request(await appWith()).post('/registries/reg/poll');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('REGISTRY_NOT_FOUND');
  });
});

describe('config validation', () => {
  /** A minimal, valid registry entry to hang conflicts off. */
  function registry(overrides: Record<string, unknown> = {}) {
    return {
      name: 'mock',
      url: 'https://mock.registry',
      repositories: ['demo/ee'],
      ...overrides,
    };
  }

  function document(registries: unknown[]) {
    return {
      apiVersion: 'content.ansible.com/v1',
      kind: 'ContentConfiguration',
      registries,
    };
  }

  it('accepts a registry that configures a CA bundle alone', async () => {
    const res = await request(await appWith())
      .post('/config/validate')
      .send(document([registry({ caFile: '/etc/pki/mock-ca.pem' })]));

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(
      res.body.errors.filter(
        (error: { path: string }) => error.path === 'registries[0].caFile',
      ),
    ).toEqual([]);
  });

  it('reports missing registry names and URLs at their field paths', async () => {
    const res = await request(await appWith())
      .post('/config/validate')
      .send(document([registry({ name: undefined, url: undefined })]));
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toEqual([
      { path: 'registries[0].name', message: 'Required' },
      {
        path: 'registries[0].url',
        message: 'Required and must be a string',
      },
    ]);
  });

  it('rejects duplicate registry names', async () => {
    const res = await request(await appWith())
      .post('/config/validate')
      .send(document([registry(), registry()]));
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toEqual([
      { path: 'registries[1].name', message: 'Duplicate registry name: mock' },
    ]);
  });

  it('warns that realm rewriting changes the credential destination', async () => {
    const res = await request(await appWith())
      .post('/config/validate')
      .send(document([registry({ rewriteAuthRealmHost: true })]));
    expect(res.body.valid).toBe(true);
    expect(res.body.warnings).toEqual([
      {
        path: 'registries[0].rewriteAuthRealmHost',
        message: expect.stringContaining(
          'Credentials will be sent to the configured host',
        ),
      },
    ]);
  });

  it('rejects registry URLs without a scheme', async () => {
    const res = await request(await appWith())
      .post('/config/validate')
      .send(document([registry({ url: 'mock.registry' })]));
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toEqual([
      {
        path: 'registries[0].url',
        message: 'Invalid: is not a valid absolute URL',
      },
    ]);
  });

  it('survives hostile non-string apiVersion and kind values', async () => {
    // This endpoint exists to judge malformed documents, so its error
    // paths must survive whatever a caller sends. An object whose
    // `toString` is null would otherwise crash the handler with a 500
    // instead of a validation result.
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: { toString: null },
        kind: { toString: null },
        registries: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({ path: 'apiVersion' }),
    );
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({ path: 'kind' }),
    );
  });

  it.each([{ namespaces: [] }, { namespaces: ['team'] }])(
    'validates namespaces $namespaces without configured repositories',
    async ({ namespaces }) => {
      const res = await request(await appWith())
        .post('/config/validate')
        .send(document([registry({ repositories: [], namespaces })]));
      expect(res.body.valid).toBe(true);
      expect(res.body.warnings).toHaveLength(namespaces.length ? 0 : 1);
    },
  );

  it('rejects caFile combined with the insecure opt-out, at the caFile path', async () => {
    const res = await request(await appWith())
      .post('/config/validate')
      .send(
        document([
          registry({ caFile: '/etc/pki/mock-ca.pem', insecure: true }),
        ]),
      );

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual({
      path: 'registries[0].caFile',
      message: expect.stringMatching(/caFile.*insecure|insecure.*caFile/),
    });
  });

  it.each(['y', 'yes', 'true', '1', 'on', ' ON ', ' YeS ', 1])(
    'rejects caFile combined with insecure=%p, matching startup coercion',
    async insecure => {
      const res = await request(await appWith())
        .post('/config/validate')
        .send(document([registry({ caFile: '/etc/pki/ca.pem', insecure })]));

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.errors).toContainEqual(
        expect.objectContaining({ path: 'registries[0].caFile' }),
      );
      expect(res.body.warnings).toContainEqual(
        expect.objectContaining({ path: 'registries[0].insecure' }),
      );
    },
  );

  it.each([false, 'n', 'no', 'false', '0', 'off', ' OFF ', 0, null])(
    'accepts caFile combined with insecure=%p',
    async insecure => {
      const res = await request(await appWith())
        .post('/config/validate')
        .send(document([registry({ caFile: '/etc/pki/ca.pem', insecure })]));

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.warnings).toEqual([]);
    },
  );

  it.each(['maybe', '', 2, {}, []])(
    'reports invalid insecure=%p at its field path',
    async insecure => {
      const res = await request(await appWith())
        .post('/config/validate')
        .send(document([registry({ insecure })]));

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.errors).toContainEqual(
        expect.objectContaining({ path: 'registries[0].insecure' }),
      );
      expect(res.body.warnings).toEqual([]);
    },
  );

  it.each([null, [], 'registry', 1, true])(
    'reports malformed registry entry %p and continues validating',
    async entry => {
      const res = await request(await appWith())
        .post('/config/validate')
        .send(document([entry, registry({ insecure: 'maybe' })]));

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.errors).toEqual([
        { path: 'registries[0]', message: 'Must be an object' },
        expect.objectContaining({ path: 'registries[1].insecure' }),
      ]);
    },
  );
});

describe('configuration boundary', () => {
  /**
   * An index holding a real configured registry, so mutation attempts target a
   * name that exists. Against an empty index, a future edit implementation
   * could answer 404 ("no such registry") and satisfy a weaker test.
   */
  function seedWithRegistry(): ContentIndex {
    return new ContentIndex(
      [
        {
          name: 'reg',
          url: 'https://reg.example',
          auth: { type: 'anonymous' },
        },
      ],
      { info: () => {}, warn: () => {}, debug: () => {} },
    );
  }

  /**
   * Registry endpoints are install-time configuration, and that is the SSRF trust
   * boundary: the API may inspect and re-read them, but must offer no way to create
   * or edit one. If a mutating route ever appears here, this test failing is the
   * reminder that it widens the boundary the security review approved.
   */
  it('offers no route that creates or edits a registry at runtime', async () => {
    const app = await appWith(seedWithRegistry());

    // The target registry exists — the assertions below cannot be satisfied
    // by a "no such registry" 404 from a future edit implementation.
    const before = await request(app).get('/registries');
    expect(before.body.items).toEqual([
      expect.objectContaining({ name: 'reg', url: 'https://reg.example' }),
    ]);

    const hostile = { name: 'evil', url: 'https://evil.example' };
    const created = await request(app).post('/registries').send(hostile);
    const replaced = await request(app).put('/registries/reg').send(hostile);
    const patched = await request(app).patch('/registries/reg').send(hostile);

    expect(created.status).toBe(404);
    expect(replaced.status).toBe(404);
    expect(patched.status).toBe(404);

    // Nothing changed: no new registry appeared, and the existing one kept its
    // configured endpoint.
    const after = await request(app).get('/registries');
    expect(after.body).toEqual(before.body);
  });

  it('flags a registry URL with a non-HTTP scheme', async () => {
    // A URL like ftp://quay.io is a real URL — just not one this plugin can
    // talk to. It has to be rejected up front, before any request is sent.
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [{ name: 'quay', url: 'ftp://quay.io' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: 'registries[0].url',
        message: expect.stringContaining('must start with http:// or https://'),
      }),
    );
  });

  it('flags a registry URL with no scheme at all', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [{ name: 'quay', url: 'quay.io' }],
      });

    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: 'registries[0].url',
        message: expect.stringContaining('is not a valid absolute URL'),
      }),
    );
  });

  /**
   * Parity with the loader: these strings previously sailed through this
   * endpoint as `valid: true` while preventing startup, because the two
   * boundaries used different rules.
   */
  it.each([
    'https://',
    'https://quay.io:99999',
    // A double slash inside the path: request building would read the joined
    // `//` as a host swap, so the client would refuse its own registry.
    'https://quay.io//v2',
  ])('rejects %s, which the loader also rejects at startup', async badUrl => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [{ name: 'quay', url: badUrl }],
      });

    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({ path: 'registries[0].url' }),
    );
  });

  /**
   * A URL ending in a bare `?` or `#` is a query or fragment someone never
   * finished typing. The shared rule rejects it, so this endpoint must too.
   */
  it.each(['https://quay.io?', 'https://quay.io#'])(
    'rejects %s — an unfinished query or fragment — like the loader',
    async badUrl => {
      const res = await request(await appWith(seed([])))
        .post('/config/validate')
        .send({
          apiVersion: 'content.ansible.com/v1',
          kind: 'ContentConfiguration',
          registries: [{ name: 'quay', url: badUrl }],
        });

      expect(res.body.valid).toBe(false);
      expect(res.body.errors).toContainEqual(
        expect.objectContaining({
          path: 'registries[0].url',
          message: expect.stringContaining(
            'must not include a query or fragment',
          ),
        }),
      );
    },
  );

  it('accepts an uppercase scheme, matching the loader (which canonicalizes it)', async () => {
    // The startup code accepts this URL and cleans it up — it lowercases the
    // HTTPS:// prefix — instead of rejecting it. This endpoint has to reach
    // the same verdict, or it would tell users their working configuration
    // is broken.
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [{ name: 'quay', url: 'HTTPS://QUAY.IO' }],
      });

    expect(res.body.valid).toBe(true);
    expect(res.body.errors).toEqual([]);
  });

  it('flags embedded credentials and query suffixes, like the loader', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [
          { name: 'a', url: 'https://user:pass@quay.io' },
          { name: 'b', url: 'https://quay.io?junk=true' },
        ],
      });

    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: 'registries[0].url',
        message: expect.stringContaining('must not embed credentials'),
      }),
    );
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: 'registries[1].url',
        message: expect.stringContaining(
          'must not include a query or fragment',
        ),
      }),
    );
  });

  it('reports a non-object registry entry as a validation error, not a crash', async () => {
    // Before this fix, a registry entry that wasn't a proper settings object
    // crashed the endpoint with a server error (500). Now it comes back as an
    // ordinary "this is wrong with your configuration" report.
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [null],
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: 'registries[0]',
        message: 'Must be an object',
      }),
    );
  });

  it('reports a non-string URL as a validation error, not a crash', async () => {
    // Same idea as the test above: `url: 123` is a mistake in the document,
    // and the endpoint's job is to say so, not to fail.
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [{ name: 'quay', url: 123 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: 'registries[0].url',
        message: 'Required and must be a string',
      }),
    );
  });

  it('reports duplicate registry names, which would be ambiguous endpoints', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [
          { name: 'quay', url: 'https://quay.io' },
          { name: 'quay', url: 'https://quay.example' },
        ],
      });

    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: 'registries[1].name',
        message: expect.stringContaining('Duplicate'),
      }),
    );
  });

  it('accepts a well-formed configuration and only warns about insecure registries', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [
          { name: 'local', url: 'http://localhost:5000', insecure: true },
          {
            name: 'quay',
            url: 'https://quay.io',
            repositories: ['ansible/ee'],
          },
        ],
      });

    expect(res.body.valid).toBe(true);
    expect(res.body.errors).toEqual([]);
    expect(res.body.warnings).toContainEqual(
      expect.objectContaining({
        path: 'registries[0].insecure',
        message: expect.stringContaining('Plain HTTP'),
      }),
    );
  });
});
