import express from 'express';
import request from 'supertest';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { CredentialRedactor } from '@ansible/automation-content-common';
import {
  type ArtifactListOptions,
  ContentStore,
  IndexedArtifact,
  IndexedItem,
} from './ContentStore';
import {
  createRouter,
  RECONCILE_FAILURE_SUMMARY,
  STORE_REFRESH_TASK_ID,
  registryRefreshTaskId,
} from './router';

const logger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {},
  child: () => logger,
} as never;

function stubDB(overrides: Partial<ContentStore> = {}): ContentStore {
  return {
    redactor: new CredentialRedactor(),
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
    listArtifactsPaginated: async () => ({ items: [], totalCount: 0 }),
    getArtifact: async () => undefined,
    listItems: async () => [],
    itemsIn: async () => [],
    findItems: async () => [],
    listCollections: async () => [],
    countsFor: () => undefined,
    lastSuccessfulReconcileAt: () => undefined,
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

function stubScheduler(overrides: Record<string, unknown> = {}) {
  return {
    triggerTask: async () => {},
    cancelTask: async () => {},
    scheduleTask: async () => {},
    createScheduledTaskRunner: () => ({ run: async () => {} }),
    getScheduledTasks: async () => [],
    ...overrides,
  } as never;
}

async function appWith(
  db?: ContentStore,
  scheduler?: ReturnType<typeof stubScheduler>,
  authorize: (
    requests: Array<{ permission: { name: string } }>,
  ) => Promise<Array<{ result: AuthorizeResult }>> = async () => [
    { result: AuthorizeResult.ALLOW },
  ],
  audit: NonNullable<Parameters<typeof createRouter>[0]['auditor']> = {
    createEvent: async () => ({
      success: async () => {},
      fail: async () => {},
    }),
  },
) {
  const app = express();
  app.use(
    await createRouter({
      manualSyncEnabled: true,
      auditor: audit,
      db: db ?? stubDB(),
      logger,
      httpAuth: {
        credentials: () =>
          Promise.resolve({
            principal: { type: 'user', userEntityRef: 'user:default/test' },
          }),
      } as never,
      scheduler: scheduler ?? stubScheduler(),
      permissions: { authorize } as never,
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
    listArtifactsPaginated: async () => ({
      items: [DEFAULT_ARTIFACT],
      totalCount: 1,
    }),
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

describe('EE read authorization', () => {
  const denied = async () => [{ result: AuthorizeResult.DENY }];

  it.each([
    ['get', '/execution-environments'],
    ['get', '/execution-environments/reg/repo@sha256:abc'],
    ['get', '/execution-environments/reg/repo@sha256:abc/contents'],
    ['get', '/content?type=execution-environment'],
    ['post', '/resolve/requirements'],
  ] as const)(
    'denies %s %s before exposing protected EE data',
    async (method, path) => {
      const app = await appWith(seedDB([]), undefined, denied);
      await request(app)[method](path).expect(403);
    },
  );

  it('responds to a policy outage without returning protected EE data', async () => {
    const app = await appWith(seedDB([]), undefined, async () => {
      throw new Error('private policy backend');
    });
    const response = await request(app)
      .get('/execution-environments')
      .expect(503);
    expect(response.text).not.toContain('private policy backend');
  });

  it.each(['', '/contents'])(
    'uses the absent-artifact response for denied generic detail %s',
    async suffix => {
      const app = await appWith(seedDB([]), undefined, denied);
      const hidden = await request(app)
        .get(`/content/reg/repo@sha256:abc${suffix}`)
        .expect(404);
      const absent = await request(app)
        .get(`/content/missing${suffix}`)
        .expect(404);
      expect(hidden.body).toEqual(absent.body);
    },
  );

  it('filters mixed item and artifact projections before results are counted', async () => {
    const eeItem = {
      key: 'ee',
      fqcn: 'demo.example.module',
      artifactRef: DEFAULT_ARTIFACT.ref,
    } as IndexedItem;
    const ordinaryArtifact = {
      ...DEFAULT_ARTIFACT,
      type: 'oci-image',
      ref: 'reg/repo@sha256:def',
    };
    const ordinaryItem = {
      ...eeItem,
      key: 'ordinary',
      artifactRef: ordinaryArtifact.ref,
    };
    const visibleItems = (excludeType?: string) =>
      excludeType === 'execution-environment'
        ? [ordinaryItem]
        : [eeItem, ordinaryItem];
    const db = stubDB({
      listArtifactsPaginated: async options => {
        const items =
          options.excludeType === 'execution-environment'
            ? [ordinaryArtifact]
            : [DEFAULT_ARTIFACT, ordinaryArtifact];
        return { items, totalCount: items.length };
      },
      listItems: async excludeType => visibleItems(excludeType),
      findItems: async (_fqcn, scope, excludeType) =>
        visibleItems(excludeType).filter(
          item => !scope || item.artifactRef === scope,
        ),
      listCollections: async excludeType => [
        {
          namespace: 'demo',
          name: 'example',
          fqcn: 'demo.example',
          version: '1.0.0',
          plugins: [],
          roles: [],
          playbooks: [],
          edaPlugins: [],
          rulebooks: [],
          providedBy: visibleItems(excludeType).map(item => item.artifactRef),
        },
      ],
    });
    const app = await appWith(db, undefined, denied);
    const artifacts = await request(app).get('/content').expect(200);
    expect(artifacts.body.totalItems).toBe(1);
    expect(artifacts.body.items[0].ref).toBe(ordinaryArtifact.ref);
    for (const path of ['/content-items', '/plugins']) {
      const items = await request(app).get(path).expect(200);
      expect(items.body.totalItems).toBe(1);
      expect(items.body.items[0].in).toBe(ordinaryArtifact.ref);
      const detail = await request(app)
        .get(`${path}/demo.example.module`)
        .expect(200);
      expect(detail.body.providedBy).toEqual([ordinaryArtifact.ref]);
      await request(app)
        .get(`${path}/demo.example.module`)
        .query({ in: DEFAULT_ARTIFACT.ref })
        .expect(404);
    }
    const collections = await request(app).get('/collections').expect(200);
    expect(collections.body.items[0].providedBy).toEqual([
      ordinaryArtifact.ref,
    ]);
    const collection = await request(app)
      .get('/collections/demo/example')
      .expect(200);
    expect(collection.body.versions[0].providedBy).toEqual([
      ordinaryArtifact.ref,
    ]);
  });

  it('refuses a non-EE artifact through the EE detail alias even for an allowed reader', async () => {
    const db = stubDB({
      getArtifact: async () => ({ ...DEFAULT_ARTIFACT, type: 'oci-image' }),
    });
    await request(await appWith(db))
      .get('/execution-environments/reg/repo@sha256:abc')
      .expect(404);
  });
});

describe('EE repository discovery routes', () => {
  const queryPath = '/execution-environment-repositories/query';
  const detailsPath = '/execution-environment-repositories/by-name';
  const favoriteRef = `component:default/ee-repo-${'a'.repeat(48)}`;

  it('rejects unsupported query parameters and bounds pagination and favorites', async () => {
    const app = await appWith();
    for (const input of [
      { page: 0 },
      { pageSize: 100 },
      { sort: 'unknown' },
      { order: 'other' },
      { query: 'q'.repeat(257) },
      { favoriteEntityRefs: ['component:default/digest-record'] },
      { favoriteEntityRefs: Array.from({ length: 1001 }, () => favoriteRef) },
      { unsupported: true },
    ]) {
      await request(app).post(queryPath).send(input).expect(400);
    }
    await request(app)
      .post(queryPath)
      .send({ query: 'q'.repeat(256 * 1024) })
      .expect(413);
  });

  it('requires EE view for the repository query and details', async () => {
    const app = await appWith(stubDB(), undefined, async () => [
      { result: AuthorizeResult.DENY },
    ]);
    await request(app).post(queryPath).send({}).expect(403);
    await request(app).get(`${detailsPath}/reg/team%2Fimages`).expect(403);
  });

  it('preserves encoded repository identity and returns an absent repository as 404', async () => {
    const details = {
      registry: 'reg',
      repository: 'team/images',
      entityRef: favoriteRef,
      representativeRef: 'reg/team/images@sha256:abc',
      tags: [],
      digests: [
        { digest: 'sha256:abc', artifactRef: 'reg/team/images@sha256:abc' },
      ],
    };
    const db = stubDB({
      getEERepository: async (registry, repository) =>
        registry === 'reg' && repository === 'team/images'
          ? details
          : undefined,
    });
    const app = await appWith(db);
    const response = await request(app)
      .get(`${detailsPath}/reg/team%2Fimages`)
      .expect(200);
    expect(response.body).toEqual(details);
    await request(app).get(`${detailsPath}/reg/absent`).expect(404);
  });

  it('accepts only supported inventory source types and statuses', async () => {
    const queryEERepositories = jest.fn(async () => ({
      page: 1,
      pageSize: 10,
      totalItems: 0,
      items: [],
    }));
    const app = await appWith(stubDB({ queryEERepositories }));
    await request(app)
      .post(queryPath)
      .send({ sourceType: 'external-registry', status: 'stale' })
      .expect(200);
    expect(queryEERepositories).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      sourceType: 'external-registry',
      status: 'stale',
    });
    await request(app)
      .post(queryPath)
      .send({ sourceType: 'local' })
      .expect(400);
    await request(app).post(queryPath).send({ status: 'signed' }).expect(400);
  });

  it('forwards complete valid favorite refs and accepts an explicitly empty set', async () => {
    const db = stubDB({
      queryEERepositories: async query => ({
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 10,
        totalItems: query.favoriteEntityRefs?.length ?? 0,
        items: [],
      }),
    });
    const app = await appWith(db);
    await request(app)
      .post(queryPath)
      .send({ page: 2, pageSize: 20, favoriteEntityRefs: [favoriteRef] })
      .expect(200, { page: 2, pageSize: 20, totalItems: 1, items: [] });
    await request(app)
      .post(queryPath)
      .send({ favoriteEntityRefs: [] })
      .expect(200, { page: 1, pageSize: 10, totalItems: 0, items: [] });
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

describe('GET /content pagination', () => {
  function makeArtifact(n: number): IndexedArtifact {
    return {
      ref: `reg/repo-${n}@sha256:${String(n).padStart(3, '0')}`,
      type: 'execution-environment',
      registry: 'reg',
      repository: `repo-${n}`,
      digest: `sha256:${String(n).padStart(3, '0')}`,
      tags: ['latest'],
      pullReference: `reg/repo-${n}:latest`,
      contentsKnown: true,
      classification: {
        type: 'execution-environment',
        confidence: 'certain',
        signals: [],
      } as never,
      manifest: { collections: [], generatedBy: {}, complete: true } as never,
    };
  }

  const allArtifacts = Array.from({ length: 25 }, (_, i) => makeArtifact(i));

  function paginatedDB(artifacts = allArtifacts): ContentStore {
    return stubDB({
      listArtifacts: async () => artifacts,
      listArtifactsPaginated: async (
        opts: ArtifactListOptions & { limit: number; offset: number },
      ) => {
        const matches = artifacts.filter(
          artifact => !opts.type || artifact.type === opts.type,
        );
        return {
          items: matches.slice(opts.offset, opts.offset + opts.limit),
          totalCount: matches.length,
        };
      },
    });
  }

  it('returns the first page with default parameters', async () => {
    const res = await request(await appWith(paginatedDB())).get('/content');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
    expect(res.body.totalItems).toBe(25);
    expect(res.body.items).toHaveLength(10);
    expect(res.body.previous).toBeNull();
    expect(res.body.next).toBe('?page=2');
    expect(res.body.firstPage).toBe('?page=1');
    expect(res.body.lastPage).toBe('?page=3');
  });

  it('returns a middle page with next and previous links', async () => {
    const res = await request(await appWith(paginatedDB())).get(
      '/content?page=2',
    );

    expect(res.body.page).toBe(2);
    expect(res.body.items).toHaveLength(10);
    expect(res.body.previous).toBe('?page=1');
    expect(res.body.next).toBe('?page=3');
  });

  it('returns the last page with no next link', async () => {
    const res = await request(await appWith(paginatedDB())).get(
      '/content?page=3',
    );

    expect(res.body.page).toBe(3);
    expect(res.body.items).toHaveLength(5);
    expect(res.body.next).toBeNull();
    expect(res.body.previous).toBe('?page=2');
  });

  it('accepts per_page=20', async () => {
    const res = await request(await appWith(paginatedDB())).get(
      '/content?per_page=20',
    );

    expect(res.body.pageSize).toBe(20);
    expect(res.body.items).toHaveLength(20);
    expect(res.body.lastPage).toBe('?per_page=20&page=2');
  });

  it('accepts per_page=50', async () => {
    const res = await request(await appWith(paginatedDB())).get(
      '/content?per_page=50',
    );

    expect(res.body.pageSize).toBe(50);
    expect(res.body.items).toHaveLength(25);
    expect(res.body.next).toBeNull();
    expect(res.body.lastPage).toBe('?per_page=50&page=1');
  });

  it('falls back to 10 for invalid per_page values', async () => {
    const res = await request(await appWith(paginatedDB())).get(
      '/content?per_page=15',
    );

    expect(res.body.pageSize).toBe(10);
  });

  it('clamps page to 1 for non-positive values', async () => {
    const res = await request(await appWith(paginatedDB())).get(
      '/content?page=0',
    );

    expect(res.body.page).toBe(1);
  });

  it('filters mixed content before paginating the EE alias', async () => {
    const otherArtifact = { ...makeArtifact(99), type: 'oci-image' };
    const app = await appWith(paginatedDB([otherArtifact, ...allArtifacts]));
    const res = await request(app).get(
      '/execution-environments?per_page=20&page=2',
    );

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(20);
    expect(res.body.totalItems).toBe(25);
    expect(res.body.items.map((item: IndexedArtifact) => item.ref)).toEqual(
      allArtifacts.slice(20).map(artifact => artifact.ref),
    );
    expect(res.body.next).toBeNull();
  });

  it('preserves query parameters in pagination links', async () => {
    const res = await request(await appWith(paginatedDB())).get(
      '/content?type=execution-environment&registry=reg&per_page=10',
    );

    expect(res.body.next).toBe(
      '?type=execution-environment&registry=reg&per_page=10&page=2',
    );
    expect(res.body.firstPage).toBe(
      '?type=execution-environment&registry=reg&per_page=10&page=1',
    );
  });

  it('returns page 1 and lastPage 1 when there are no results', async () => {
    const res = await request(await appWith()).get('/content');

    expect(res.body.page).toBe(1);
    expect(res.body.totalItems).toBe(0);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.next).toBeNull();
    expect(res.body.previous).toBeNull();
    expect(res.body.lastPage).toBe('?page=1');
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

  it('triggers a scheduled registry refresh and returns 202', async () => {
    const db = dbWithFailedReconcile();
    const triggered: string[] = [];
    const scheduler = stubScheduler({
      triggerTask: async (id: string) => {
        triggered.push(id);
      },
    });

    const res = await request(await appWith(db, scheduler)).post(
      '/registries/corporate/sync',
    );

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('scheduled');
    expect(res.body.taskId).toBe(registryRefreshTaskId('corporate'));
    expect(res.body.triggeredAt).toBeDefined();
    expect(triggered).toEqual([registryRefreshTaskId('corporate')]);
  });

  it('returns the reconciliation failure when asked to wait for the result', async () => {
    const refreshRegistry = jest.fn(async () => ({ ok: false, discovered: 2 }));
    const triggerTask = jest.fn(async () => {});
    const db = dbWithFailedReconcile({ refreshRegistry });
    const res = await request(
      await appWith(db, stubScheduler({ triggerTask })),
    ).post('/registries/corporate/sync?wait=true');

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('failed');
    expect(res.body.error).toBe('Refresh failed.');
    expect(refreshRegistry).toHaveBeenCalledWith('corporate', false);
    expect(triggerTask).not.toHaveBeenCalled();
  });

  it('does not cancel an existing registry refresh when scheduling', async () => {
    const db = dbWithFailedReconcile();
    const calls: string[] = [];
    const scheduler = stubScheduler({
      cancelTask: async (id: string) => {
        calls.push(`cancel:${id}`);
      },
      triggerTask: async (id: string) => {
        calls.push(`trigger:${id}`);
      },
    });

    await request(await appWith(db, scheduler)).post(
      '/registries/corporate/sync',
    );

    expect(calls).toEqual([`trigger:${registryRefreshTaskId('corporate')}`]);
  });

  it('returns 409 when the registry refresh task cannot be triggered', async () => {
    const db = dbWithFailedReconcile();
    const scheduler = stubScheduler({
      triggerTask: async () => {
        const err = new Error('Conflict');
        err.name = 'ConflictError';
        throw err;
      },
    });

    const res = await request(await appWith(db, scheduler)).post(
      '/registries/corporate/sync',
    );

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('conflict');
    expect(res.body.taskId).toBe(registryRefreshTaskId('corporate'));
  });

  it('triggers a scheduled refresh and returns 202', async () => {
    const triggered: string[] = [];
    const scheduler = stubScheduler({
      triggerTask: async (id: string) => {
        triggered.push(id);
      },
    });

    const res = await request(await appWith(undefined, scheduler)).post(
      '/sync',
    );

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('scheduled');
    expect(res.body.taskId).toBe(STORE_REFRESH_TASK_ID);
    expect(res.body.triggeredAt).toBeDefined();
    expect(triggered).toEqual([STORE_REFRESH_TASK_ID]);
  });

  it('schedules a refresh without cancelling existing work', async () => {
    const calls: string[] = [];
    const scheduler = stubScheduler({
      cancelTask: async (id: string) => {
        calls.push(`cancel:${id}`);
      },
      triggerTask: async (id: string) => {
        calls.push(`trigger:${id}`);
      },
    });

    await request(await appWith(undefined, scheduler)).post('/sync');

    expect(calls).toEqual([`trigger:${STORE_REFRESH_TASK_ID}`]);
  });

  it('returns 409 when the refresh task cannot be triggered', async () => {
    const scheduler = stubScheduler({
      triggerTask: async () => {
        const err = new Error('Conflict');
        err.name = 'ConflictError';
        throw err;
      },
    });

    const res = await request(await appWith(undefined, scheduler)).post(
      '/sync',
    );

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('conflict');
    expect(res.body.taskId).toBe(STORE_REFRESH_TASK_ID);
  });
});

describe('repository refresh audit boundaries', () => {
  const body = { registry: 'reg', repository: 'org/image' };
  const result = {
    ...body,
    status: 'completed' as const,
    addedTags: 0,
    movedTags: 1,
    removedTags: 0,
    retainedPrevious: false as const,
    lastSuccessfulReconcileAt: '2026-11-12T12:00:00Z',
  };

  it('does not run the refresh if audit creation fails', async () => {
    const refreshEERepository = jest.fn(async () => ({ result, changes: [] }));
    const audit = {
      createEvent: async () => {
        throw new Error('sink error');
      },
    };
    const app = await appWith(
      stubDB({ refreshEERepository }),
      undefined,
      undefined,
      audit,
    );
    await request(app)
      .post('/execution-environment-repositories/sync')
      .send(body)
      .expect(503)
      .expect(({ body: response }) => {
        expect(response.code).toBe('AUDIT_UNAVAILABLE');
      });
    expect(refreshEERepository).not.toHaveBeenCalled();
  });

  it('reports a committed write accurately when its audit completion fails', async () => {
    const changes = [
      {
        repository: 'org/image',
        tag: 'private-fixture-tag',
        before: 'sha256:old',
        after: 'sha256:new',
      },
    ];
    const refreshEERepository = jest.fn(async () => ({ result, changes }));
    const success = jest.fn(async (_entry: unknown) => {
      throw new Error('sink error');
    });
    const createEvent = jest.fn(async (_entry?: unknown) => ({
      success,
      fail: async () => {},
    }));
    const app = await appWith(
      stubDB({ refreshEERepository }),
      undefined,
      undefined,
      { createEvent },
    );
    const response = await request(app)
      .post('/execution-environment-repositories/sync')
      .send(body);
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      code: 'committed-audit-unconfirmed',
      retainedPrevious: false,
    });
    expect(refreshEERepository).toHaveBeenCalledWith(
      body.registry,
      body.repository,
    );
    const event = JSON.stringify(createEvent.mock.calls[0]);
    expect(event).toContain('user:default/test');
    expect(event).toContain('correlationId');
    expect(event).not.toContain(body.repository);
    const completion = JSON.stringify(success.mock.calls[0]);
    expect(completion).toContain('before');
    expect(completion).toContain('after');
    expect(completion).not.toContain('private-fixture-tag');
  });
});

describe('GET /registries', () => {
  it('denies registry access before reading the registry configuration', async () => {
    const listRegistries = jest.fn(() => []);
    const app = await appWith(
      stubDB({ listRegistries }),
      undefined,
      async () => [{ result: AuthorizeResult.DENY }],
    );

    const res = await request(app).get('/registries');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(listRegistries).not.toHaveBeenCalled();
  });

  it('allows EE viewers to list registries without granting sync', async () => {
    const listRegistries = jest.fn(() => [
      { connection: { name: 'mock', url: 'https://mock.registry' } as never },
    ]);
    const triggerTask = jest.fn(async () => {});
    const app = await appWith(
      stubDB({ listRegistries }),
      stubScheduler({ triggerTask }),
      async ([{ permission }]) => [
        {
          result:
            permission.name === 'ansible.execution-environments.view'
              ? AuthorizeResult.ALLOW
              : AuthorizeResult.DENY,
        },
      ],
    );

    const listing = await request(app).get('/registries');
    expect(listing.status).toBe(200);
    expect(listing.body.items).toMatchObject([{ name: 'mock' }]);

    const sync = await request(app).post('/registries/mock/sync');
    expect(sync.status).toBe(403);
    expect(triggerTask).not.toHaveBeenCalled();
  });

  it('returns 503 when the permission service is unavailable', async () => {
    const listRegistries = jest.fn(() => []);
    const app = await appWith(
      stubDB({ listRegistries }),
      undefined,
      async () => {
        throw new Error('Permission service unavailable');
      },
    );

    const res = await request(app).get('/registries');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AUTHORIZATION_UNAVAILABLE');
    expect(listRegistries).not.toHaveBeenCalled();
  });

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
    const res = await request(await appWith(stubDB()))
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
  function seedWithRegistry(): ContentStore {
    const connection = {
      name: 'reg',
      url: 'https://reg.example',
      auth: { type: 'anonymous' },
    };
    return stubDB({
      listRegistries: () => [{ connection: connection as never }],
      getRegistry: (name: string) =>
        name === 'reg' ? { connection: connection as never } : undefined,
    });
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
    const res = await request(await appWith(stubDB()))
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
    const res = await request(await appWith(stubDB()))
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
    const res = await request(await appWith(stubDB()))
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
      const res = await request(await appWith(stubDB()))
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
    const res = await request(await appWith(stubDB()))
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
    const res = await request(await appWith(stubDB()))
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
    const res = await request(await appWith(stubDB()))
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
    const res = await request(await appWith(stubDB()))
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
    const res = await request(await appWith(stubDB()))
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
    const res = await request(await appWith(stubDB()))
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
