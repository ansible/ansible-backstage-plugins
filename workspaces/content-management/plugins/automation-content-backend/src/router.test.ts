import express from 'express';
import { inspect } from 'node:util';
import request from 'supertest';
import { CredentialRedactor } from '@ansible/automation-content-common';
import knexFactory from 'knex';
import { defaultContentTypes } from '@ansible/plugin-catalog-backend-module-automation-content';
import {
  type ArtifactListOptions,
  ContentStore,
  IndexedArtifact,
  IndexedItem,
  ArtifactSyncNotFoundError,
} from './ContentStore';
import {
  createRouter,
  RECONCILE_FAILURE_SUMMARY,
  STORE_REFRESH_TASK_ID,
} from './router';
import {
  mockCredentials,
  mockServices,
  mockErrorHandler,
} from '@backstage/backend-test-utils';
import { automationContentSyncPermission } from '@ansible/automation-content-common/permissions';
import { AuthorizeResult } from '@backstage/plugin-permission-common';

const warn = jest.fn();
const info = jest.fn();
const logger = {
  info,
  warn,
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
    listArtifactSummaries: async (type, options) =>
      overrides.listArtifacts?.(type, options) ?? [],
    listArtifactsPaginated: async () => ({ items: [], totalCount: 0 }),
    getArtifact: async () => undefined,
    listItems: async () => [],
    itemsIn: async () => [],
    findItems: async () => [],
    listCollections: async () => [],
    countsFor: () => undefined,
    reconcileStateOf: () => undefined,
    repositoryTags: async () => [],
    syncArtifact: async () => ({
      status: 'completed' as const,
      ref: 'reg/repo@sha256:abc',
      tag: 'latest' as const,
      retainedPrevious: false,
    }),
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
  httpAuth = mockServices.httpAuth(),
  allowed = true,
  authorize = jest
    .fn()
    .mockResolvedValue([
      { result: allowed ? AuthorizeResult.ALLOW : AuthorizeResult.DENY },
    ]),
  scheduler = stubScheduler(),
) {
  const app = express();
  app.use(
    await createRouter({
      db: db ?? stubDB(),
      logger,
      permissions: { authorize } as never,
      httpAuth: httpAuth as never,
      scheduler,
    }),
  );
  app.use(mockErrorHandler());
  return app;
}

it.each([
  '/registries',
  '/content',
  '/content/reg/repo@sha256:abc/contents',
  '/content/reg/repo@sha256:abc',
  '/execution-environments',
  '/execution-environments/reg/repo@sha256:abc/contents',
  '/execution-environments/reg/repo@sha256:abc',
  '/collections',
  '/collections/cisco/ios',
  '/content-items',
  '/content-items/cisco.ios.ios_acls',
  '/plugins',
  '/plugins/cisco.ios.ios_acls',
])('denies reads on %s without ansible.content.view', async path => {
  const app = await appWith(seedDB([]), undefined, false);
  const response = await request(app).get(path).expect(403);
  expect(response.body).toEqual({
    error: 'Forbidden: ansible.content.view permission required',
  });
});

it('denies resolution and validation without ansible.content.view', async () => {
  const app = await appWith(seedDB([]), undefined, false);
  await request(app)
    .post('/resolve/requirements')
    .send({ collections: [] })
    .expect(403);
  await request(app).post('/config/validate').send({}).expect(403);
  await request(app).get('/health').expect(200);
});

it('fails closed with fixed copy when the view permission service is unavailable', async () => {
  warn.mockClear();
  const sensitiveMarker = 'https://user:secret-view-marker@internal.example';
  const authorize = jest.fn().mockImplementation(async () => {
    throw new Error(sensitiveMarker);
  });
  const index = seedDB([]);
  const listArtifacts = jest.spyOn(index, 'listArtifacts');
  const syncArtifact = jest.spyOn(index, 'syncArtifact');
  const response = await request(
    await appWith(index, undefined, true, authorize),
  )
    .get('/content')
    .expect(403);
  expect(response.body).toEqual({
    error: 'Forbidden: ansible.content.view permission required',
  });
  expect(warn.mock.calls).toEqual([['Unable to authorize content view']]);
  expect(inspect(warn.mock.calls)).not.toContain(sensitiveMarker);
  expect(inspect(response.body)).not.toContain(sensitiveMarker);
  expect(listArtifacts).not.toHaveBeenCalled();
  expect(syncArtifact).not.toHaveBeenCalled();
});

it('fails closed before authorization or registry access when credentials fail', async () => {
  const credentials = jest
    .fn()
    .mockRejectedValue(new Error('private identity error'));
  const authorize = jest.fn();
  const index = seedDB([]);
  const listArtifacts = jest.spyOn(index, 'listArtifacts');
  const syncArtifact = jest.spyOn(index, 'syncArtifact');
  const app = await appWith(
    index,
    mockServices.httpAuth.mock({ credentials }),
    true,
    authorize,
  );
  const response = await request(app).get('/content').expect(403);
  expect(response.body).toEqual({
    error: 'Forbidden: ansible.content.view permission required',
  });
  expect(authorize).not.toHaveBeenCalled();
  expect(listArtifacts).not.toHaveBeenCalled();
  expect(syncArtifact).not.toHaveBeenCalled();
});

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
  signing: { state: 'not-signed', evidence: ['no cosign signature referrer'] },
  manifest: { collections: [], generatedBy: {}, complete: true } as never,
};

describe('GET /repositories/:registry/:repository/tags', () => {
  function taggedIndex(artifacts: unknown[]) {
    return stubDB({
      getRegistry: (name: string) =>
        name === 'reg' ? ({ connection: { name: 'reg' } } as never) : undefined,
      listArtifacts: async () => artifacts as never,
      repositoryTags: async (
        _registry: string,
        repository: string,
      ): Promise<Array<{ tag: string; digest: string; ref: string }>> =>
        (
          artifacts as Array<{
            repository: string;
            tags: string[];
            digest: string;
            ref: string;
          }>
        )
          .filter(a => a.repository === repository)
          .flatMap(a =>
            a.tags.map(tag => ({ tag, digest: a.digest, ref: a.ref })),
          ),
    });
  }

  const artifact = (over: {
    digest: string;
    repository: string;
    tags: string[];
  }) => ({
    ref: `reg/${over.repository}@${over.digest}`,
    type: 'execution-environment',
    registry: 'reg',
    repository: over.repository,
    digest: over.digest,
    tags: over.tags,
    pullReference: `reg/${over.repository}@${over.digest}`,
    contentsKnown: false,
    classification: {
      type: 'execution-environment',
      confidence: 'certain',
      signals: [],
    },
  });

  it('flattens tags across a repository digests', async () => {
    const index = taggedIndex([
      artifact({ digest: 'sha256:abc', repository: 'repo', tags: ['latest'] }),
      artifact({ digest: 'sha256:def', repository: 'repo', tags: ['3.0'] }),
    ]);
    const response = await request(await appWith(index))
      .get('/repositories/reg/repo/tags')
      .expect(200);
    expect(response.body).toEqual({
      registry: 'reg',
      repository: 'repo',
      tags: [
        { tag: 'latest', digest: 'sha256:abc', ref: 'reg/repo@sha256:abc' },
        { tag: '3.0', digest: 'sha256:def', ref: 'reg/repo@sha256:def' },
      ],
    });
  });

  it('serves repositories with slashes in the path', async () => {
    const index = taggedIndex([
      artifact({
        digest: 'sha256:abc',
        repository: 'demo/repo',
        tags: ['latest', '3.0'],
      }),
    ]);
    const response = await request(await appWith(index))
      .get('/repositories/reg/demo/repo/tags')
      .expect(200);
    expect(response.body.repository).toBe('demo/repo');
    expect(response.body.tags).toHaveLength(2);
  });

  it('returns an empty tag list for a known registry and unknown repository', async () => {
    const index = taggedIndex([
      artifact({ digest: 'sha256:abc', repository: 'repo', tags: ['latest'] }),
    ]);
    const response = await request(await appWith(index))
      .get('/repositories/reg/no-such-repo/tags')
      .expect(200);
    expect(response.body).toEqual({
      registry: 'reg',
      repository: 'no-such-repo',
      tags: [],
    });
  });

  it('rejects an unknown registry with a typed error', async () => {
    const index = taggedIndex([]);
    const response = await request(await appWith(index))
      .get('/repositories/nope/repo/tags')
      .expect(404);
    expect(response.body.code).toBe('REGISTRY_NOT_FOUND');
  });
});

/**
 * Seed the store without touching a registry. These tests cover the HTTP
 * contract; discovery has its own coverage.
 */
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

function seedArtifacts(count: number): ContentStore {
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
  })) as unknown as IndexedArtifact[];
  return stubDB({
    listArtifacts: async () => artifacts,
    listArtifactsPaginated: async (
      opts: { limit?: number; offset?: number } = {},
    ) => ({
      items: artifacts.slice(
        opts.offset ?? 0,
        (opts.offset ?? 0) + (opts.limit ?? artifacts.length),
      ),
      totalCount: artifacts.length,
    }),
    getArtifact: async (ref: string) =>
      artifacts.find(a => a.ref === ref) as IndexedArtifact,
    listItems: async () => [],
    itemsIn: async () => [],
    findItems: async () => [],
  });
}

describe('GET /content repository grouping', () => {
  const older = {
    ...DEFAULT_ARTIFACT,
    tags: ['10.0', 'latest'],
    tagTimestamps: { '10.0': '2026-01-01' },
  };
  const newer = {
    ...DEFAULT_ARTIFACT,
    ref: `${DEFAULT_ARTIFACT.ref}-new`,
    digest: 'sha256:new',
    tags: ['2.0'],
    tagTimestamps: { '2.0': '2026-02-01' },
  };

  it.each(['', '&sort=repository'])(
    'groups before pagination and sorting (%s)',
    async sort => {
      const others = Array.from({ length: 10 }, (_, i) => ({
        ...older,
        ref: `other-${i}`,
        repository: `other-${i}`,
      }));
      const db = stubDB({
        listArtifacts: async () => [older, newer, ...others],
      });
      const getArtifact = jest.spyOn(db, 'getArtifact');
      const listArtifacts = jest.spyOn(db, 'listArtifacts');
      const app = await appWith(db);
      const first = await request(app)
        .get(`/content?per_page=10${sort}`)
        .expect(200);
      const second = await request(app)
        .get(`/content?per_page=10&page=2${sort}`)
        .expect(200);
      expect(first.body.totalItems).toBe(11);
      expect(second.body.items).toHaveLength(1);
      const rows = [...first.body.items, ...second.body.items];
      const row = rows.find(a => a.ref === newer.ref);
      expect(row.tags).toEqual(['2.0', '10.0', 'latest']);
      expect(rows.some(a => a.ref === older.ref)).toBe(false);
      expect(getArtifact).toHaveBeenCalledTimes(11);
      expect(listArtifacts).not.toHaveBeenCalled();
    },
  );

  it.each(['search=old', 'search=old&registry=reg&contentsKnown=true'])(
    'returns the representative when another digest matches %s',
    async query => {
      const listArtifacts = jest.fn(async (_type, options) =>
        options?.search ? [older] : [older, newer],
      );
      const response = await request(await appWith(stubDB({ listArtifacts })))
        .get(`/content?${query}`)
        .expect(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].ref).toBe(newer.ref);
      expect(listArtifacts).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ search: 'old' }),
      );
      expect(listArtifacts).toHaveBeenLastCalledWith(undefined, {
        repositories: [
          { registry: older.registry, repository: older.repository },
        ],
      });
      expect(listArtifacts).not.toHaveBeenCalledWith();
    },
  );
});

describe('GET /content sorting', () => {
  it.each([
    '/content?type=execution-environment',
    '/execution-environments?search=old',
  ])(
    'keeps a type-matching representative with repository-wide tags on %s',
    async path => {
      const ee = {
        ...DEFAULT_ARTIFACT,
        tags: ['old'],
        tagTimestamps: { old: '2025-01-01' },
      };
      const image = {
        ...ee,
        ref: 'new-image',
        type: 'oci-image',
        tags: ['new'],
        tagTimestamps: { new: '2026-01-01' },
      };
      const response = await request(
        await appWith(
          stubDB({
            listArtifactSummaries: async type => (type ? [ee] : [ee, image]),
          }),
        ),
      )
        .get(path)
        .expect(200);
      expect(response.body.items[0]).toMatchObject({
        ref: ee.ref,
        type: 'execution-environment',
        tags: ['new', 'old'],
      });
    },
  );
  it.each(['/content', '/execution-environments'])(
    'rejects search longer than 256 characters on %s before querying the store',
    async path => {
      const listArtifacts = jest.fn().mockResolvedValue([]);
      const listArtifactsPaginated = jest
        .fn()
        .mockResolvedValue({ items: [], totalCount: 0 });
      const app = await appWith(
        stubDB({ listArtifacts, listArtifactsPaginated }),
      );
      const response = await request(app)
        .get(path)
        .query({ search: 'a'.repeat(257) })
        .expect(400);
      expect(response.body.code).toBe('INVALID_SEARCH');
      expect(listArtifacts).not.toHaveBeenCalled();
      expect(listArtifactsPaginated).not.toHaveBeenCalled();
      await request(app)
        .get(path)
        .query({ search: 'a'.repeat(256) })
        .expect(200);
      expect(listArtifactsPaginated).not.toHaveBeenCalled();
      expect(listArtifacts).toHaveBeenCalled();
    },
  );

  it.each(['sort=repository', 'collection=ns.example'])(
    'passes combined search filters to the store for %s',
    async branch => {
      const listArtifacts = jest.fn().mockResolvedValue([]);
      const app = await appWith(stubDB({ listArtifacts }));
      for (const contentsKnown of ['true', 'false']) {
        listArtifacts.mockClear();
        await request(app)
          .get(
            `/content?${branch}&search=example&registry=reg&contentsKnown=${contentsKnown}`,
          )
          .expect(200);
        expect(listArtifacts).toHaveBeenNthCalledWith(1, undefined, {
          search: 'example',
          registry: 'reg',
          contentsKnown: contentsKnown === 'true',
          collection: branch.startsWith('collection=')
            ? 'ns.example'
            : undefined,
        });
        expect(listArtifacts).toHaveBeenLastCalledWith(undefined, {
          repositories: [],
        });
      }
    },
  );

  it.each([
    'repository',
    'registry',
    'sourceType',
    'lastReconciledAt',
  ] as const)(
    'sorts %s ascending and descending after grouping duplicate repositories',
    async sort => {
      const index = seedArtifacts(3);
      const artifacts = await index.listArtifacts();
      artifacts.forEach((artifact, i) => {
        artifact.repository = i === 0 ? 'z' : 'a';
        artifact.registry = i === 0 ? 'z' : 'a';
        if (sort === 'sourceType' && i !== 0) artifact.registry = '';
      });
      jest
        .spyOn(index, 'reconcileStateOf')
        .mockImplementation((artifact?: IndexedArtifact) => ({
          at:
            artifact?.ref === artifacts[0].ref
              ? '2026-02-01T00:00:00Z'
              : '2026-01-01T00:00:00Z',
          ok: true,
          artifacts: 1,
        }));
      const app = await appWith(index);
      for (const order of ['asc', 'desc']) {
        const res = await request(app)
          .get(`/content?sort=${sort}&order=${order}`)
          .expect(200);
        const expected =
          order === 'asc'
            ? [artifacts[1], artifacts[0]]
            : [artifacts[0], artifacts[1]];
        expect(res.body.items.map((item: { ref: string }) => item.ref)).toEqual(
          expected.map(a => a.ref),
        );
      }
    },
  );

  it('sorts the full result before pagination and keeps the original default order', async () => {
    const index = seedArtifacts(15);
    (await index.listArtifacts()).forEach((a, i) => {
      a.repository = String(15 - i).padStart(2, '0');
    });
    const app = await appWith(index);
    const first = await request(app)
      .get('/content?sort=repository')
      .expect(200);
    const second = await request(app)
      .get('/content?sort=repository&page=2')
      .expect(200);
    expect(
      [...first.body.items, ...second.body.items].map(
        (a: { repository: string }) => a.repository,
      ),
    ).toEqual(
      Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, '0')),
    );
    expect(first.body.next).toContain('sort=repository');
    const original = await request(app).get('/content').expect(200);
    expect(original.body.items[0].repository).toBe('15');
    const alias = await request(app)
      .get('/execution-environments?sort=repository')
      .expect(200);
    expect(alias.body.items).toEqual(first.body.items);
  });

  it.each([
    ['sort=unknown', 'INVALID_SORT'],
    ['sort=', 'INVALID_SORT'],
    ['sort=registry&sort=repository', 'INVALID_SORT'],
    ['order=up', 'INVALID_ORDER'],
    ['order=', 'INVALID_ORDER'],
    ['order=asc&order=desc', 'INVALID_ORDER'],
  ])('rejects invalid query %s', async (query, code) => {
    const res = await request(await appWith(seedArtifacts(1)))
      .get(`/content?${query}`)
      .expect(400);
    expect(res.body.code).toBe(code);
  });

  it('derives collection entry types and preserves unknown contents', async () => {
    const index = seedArtifacts(1);
    const artifact = (await index.listArtifacts())[0];
    artifact.manifest!.collections.push({
      namespace: 'ns',
      name: 'example',
      version: '1',
      plugins: [],
      roles: [],
      playbooks: [],
      edaPlugins: [],
      rulebooks: [],
    });
    const app = await appWith(index);
    const known = await request(app)
      .get(`/content/${artifact.ref}/contents`)
      .expect(200);
    expect(known.body.collections[0]).toMatchObject({
      type: 'collection',
      fqcn: 'ns.example',
    });
    artifact.manifest = undefined;
    artifact.contentsKnown = false;
    const unknown = await request(app)
      .get(`/content/${artifact.ref}/contents`)
      .expect(200);
    expect(unknown.body).toMatchObject({
      enumeration: { status: 'unknown' },
      collections: [],
      items: [],
    });
  });
});

describe.each(['/sync', '/registries/reg/sync', '/registries/reg/poll'])(
  'sync authorization on %s',
  path => {
    function syncIndex() {
      const index = stubDB({
        getRegistry: () => ({ connection: { name: 'reg' } }) as never,
        listRegistries: () => [{ connection: { name: 'reg' } }] as never,
      });
      const refresh = jest
        .spyOn(index, 'refreshRegistry')
        .mockResolvedValue({ ok: true, discovered: 0 });
      const poll = jest.spyOn(index, 'pollRegistry').mockResolvedValue({
        changed: false,
        refreshed: false,
        details: [],
        requests: 0,
      });
      return { index, refresh, poll };
    }

    it.each(['user:default/no-catalog-entity', 'user:default/guest'])(
      'allows permitted user %s without any catalog lookup or annotation',
      async userEntityRef => {
        const { index, refresh, poll } = syncIndex();
        const credentials = mockCredentials.user(userEntityRef);
        const httpAuth = mockServices.httpAuth({
          defaultCredentials: credentials,
        });
        jest.spyOn(httpAuth, 'credentials');
        const authorize = jest
          .fn()
          .mockResolvedValue([{ result: AuthorizeResult.ALLOW }]);
        const triggerTask = jest.fn();
        const scheduler = stubScheduler({ triggerTask });
        const response = await request(
          await appWith(index, httpAuth, true, authorize, scheduler),
        ).post(path);
        expect(response.status).toBe(
          path === '/registries/reg/poll' ? 200 : 202,
        );
        expect(httpAuth.credentials).toHaveBeenCalledWith(expect.anything(), {
          allow: ['user'],
        });
        expect(authorize).toHaveBeenCalledWith(
          [{ permission: automationContentSyncPermission }],
          { credentials },
        );
        expect(
          refresh.mock.calls.length +
            poll.mock.calls.length +
            triggerTask.mock.calls.length,
        ).toBe(1);
      },
    );

    it.each([
      {
        name: 'denied permission',
        decisions: [{ result: AuthorizeResult.DENY }],
        throws: false,
      },
      {
        name: 'conditional permission',
        decisions: [{ result: AuthorizeResult.CONDITIONAL }],
        throws: false,
      },
      { name: 'missing decision', decisions: [], throws: false },
      { name: 'unavailable permission service', decisions: [], throws: true },
    ])(
      'denies $name without privileged side effects or sensitive logging',
      async ({ decisions, throws }) => {
        warn.mockClear();
        const sensitiveMarker =
          'https://user:secret-auth-marker@internal.example';
        const authorize = jest.fn().mockImplementation(async () => {
          if (throws) throw new Error(sensitiveMarker);
          return decisions;
        });
        const { index, refresh, poll } = syncIndex();
        const triggerTask = jest.fn();
        const scheduler = stubScheduler({ triggerTask });
        const response = await request(
          await appWith(index, undefined, true, authorize, scheduler),
        )
          .post(path)
          .expect(403);
        expect(response.body).toEqual({
          error: 'Forbidden: ansible.content.sync permission required',
        });
        expect(refresh).not.toHaveBeenCalled();
        expect(poll).not.toHaveBeenCalled();
        expect(triggerTask).not.toHaveBeenCalled();
        expect(warn.mock.calls).toEqual(
          throws ? [['Unable to authorize content registry sync']] : [],
        );
        expect(inspect(warn.mock.calls)).not.toContain(sensitiveMarker);
        expect(inspect(response.body)).not.toContain(sensitiveMarker);
      },
    );

    it.each([
      { name: 'service', credentials: mockCredentials.service(), status: 403 },
      { name: 'anonymous', credentials: mockCredentials.none(), status: 401 },
    ])(
      'rejects $name credentials before permission evaluation',
      async ({ credentials, status }) => {
        const { index, refresh, poll } = syncIndex();
        const httpAuth = mockServices.httpAuth({
          defaultCredentials: credentials,
        });
        jest.spyOn(httpAuth, 'credentials');
        const authorize = jest
          .fn()
          .mockResolvedValue([{ result: AuthorizeResult.ALLOW }]);
        const response = await request(
          await appWith(index, httpAuth, true, authorize),
        ).post(path);
        expect(response.status).toBe(status);
        expect(httpAuth.credentials).toHaveBeenCalledWith(expect.anything(), {
          allow: ['user'],
        });
        expect(authorize).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
        expect(poll).not.toHaveBeenCalled();
      },
    );
  },
);

describe('POST /artifacts/:ref/sync', () => {
  const ref = 'reg/team/repo@sha256:abc';
  const path = `/artifacts/${encodeURIComponent(ref)}/sync`;

  it.each(['completed', 'failed'] as const)(
    'returns the typed %s outcome with 202 and decodes the row ref',
    async status => {
      const index = seedDB([]);
      const result = {
        status,
        ref: status === 'completed' ? 'reg/team/repo@sha256:new' : ref,
        tag: 'latest' as const,
        retainedPrevious: status === 'failed',
      };
      const sync = jest.spyOn(index, 'syncArtifact').mockResolvedValue(result);
      const refresh = jest.spyOn(index, 'refreshRegistry');
      const response = await request(await appWith(index))
        .post(path)
        .expect(202);
      expect(response.body).toEqual(result);
      expect(sync).toHaveBeenCalledWith(ref);
      expect(refresh).not.toHaveBeenCalled();
    },
  );

  it.each(['ARTIFACT_NOT_FOUND', 'LATEST_TAG_NOT_FOUND'] as const)(
    'returns safe 404 code %s',
    async code => {
      const index = seedDB([]);
      jest
        .spyOn(index, 'syncArtifact')
        .mockRejectedValue(new ArtifactSyncNotFoundError(code));
      const response = await request(await appWith(index))
        .post(path)
        .expect(404);
      expect(response.body.code).toBe(code);
    },
  );

  it.each([
    {
      name: 'denied user',
      credentials: mockCredentials.user(),
      allowed: false,
      status: 403,
    },
    {
      name: 'service principal',
      credentials: mockCredentials.service(),
      allowed: true,
      status: 403,
    },
    {
      name: 'anonymous',
      credentials: mockCredentials.none(),
      allowed: true,
      status: 401,
    },
  ])(
    'rejects $name without index mutation',
    async ({ credentials, allowed, status }) => {
      const index = seedDB([]);
      const sync = jest.spyOn(index, 'syncArtifact');
      const refresh = jest.spyOn(index, 'refreshRegistry');
      const poll = jest.spyOn(index, 'pollRegistry');
      const response = await request(
        await appWith(
          index,
          mockServices.httpAuth({ defaultCredentials: credentials }),
          allowed,
        ),
      ).post(path);
      expect(response.status).toBe(status);
      expect(sync).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
      expect(poll).not.toHaveBeenCalled();
    },
  );
});

describe('documentation field normalisation', () => {
  /**
   * ansible-doc emits `description`, `author` and `notes` as either a scalar or a list
   * depending on how each collection author wrote the YAML. The API declares arrays, so
   * it must deliver arrays — a consumer that trusts the contract crashed on this.
   */
  it('coerces a string description to an array', async () => {
    const index = seedDB([
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
    const index = seedDB([
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
    const index = seedDB([
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
    const index = seedDB([
      { fqcn: 'cisco.ios.ios', name: 'ios', type: 'cliconf', detail: {} },
    ]);
    const res = await request(await appWith(index)).get(
      '/content-items/cisco.ios.ios',
    );

    expect('description' in res.body).toBe(false);
    expect(res.body.fqcn).toBe('cisco.ios.ios');
  });

  it('always returns providedBy as an array', async () => {
    const index = seedDB([
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
    const index = seedDB([]);
    const res = await request(await appWith(index)).get('/health');

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
      signing: { state: 'not-signed', evidence: [] },
      manifest: { collections: [], generatedBy: {}, complete: true } as never,
    };
  }

  const allArtifacts = Array.from({ length: 25 }, (_, i) => makeArtifact(i));

  function paginatedDB(): ContentStore {
    return stubDB({
      listArtifacts: async () => allArtifacts,
      listArtifactsPaginated: async (
        opts: ArtifactListOptions & { limit: number; offset: number },
      ) => ({
        items: allArtifacts.slice(opts.offset, opts.offset + opts.limit),
        totalCount: allArtifacts.length,
      }),
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

  it('works through the /execution-environments alias', async () => {
    const res = await request(await appWith(paginatedDB())).get(
      '/execution-environments?per_page=20&page=2',
    );

    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(20);
    expect(res.body.items).toHaveLength(5);
    expect(res.body.totalItems).toBe(25);
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
  it('applies pagination to the /execution-environments alias', async () => {
    const res = await request(await appWith(paginatedDB())).get(
      '/execution-environments',
    );

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.items).toHaveLength(10);
    expect(res.body.totalItems).toBe(25);
    expect(res.body.next).toContain('page=2');
  });
});

describe('diagnostics are summarised on the registry listing', () => {
  /**
   * An index with one registry whose last reconciliation — and drift check —
   * failed the way a TLS rejection would: the error text quotes hostnames
   * from the certificate's subject alternative names.
   *
   * Every route except `GET /health` sits behind the sign-in barrier (#977),
   * and the fixed summary is all the listing reports — the raw cause goes to
   * the backend log and the sync responses. The private fields are written
   * directly because the point of these tests is the HTTP contract, not
   * discovery.
   */
  async function createTestDB() {
    const db = knexFactory({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    await db.schema.createTable('artifacts', table => {
      table.string('ref').primary();
      table.string('type').notNullable();
      table.string('registry').notNullable().index();
      table.string('repository').notNullable();
      table.string('digest').notNullable();
      table.text('tags').notNullable().defaultTo('[]');
      table.text('tag_timestamps').notNullable().defaultTo('{}');
      table.string('pull_reference').notNullable();
      table.boolean('contents_known').notNullable().defaultTo(false);
      table.text('classification').notNullable().defaultTo('{}');
      table.text('signing');
      table.text('manifest');
      table.timestamp('created_at').notNullable().defaultTo(db.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(db.fn.now());
    });
    await db.schema.createTable('items', table => {
      table.string('key').primary();
      table.string('fqcn').notNullable().index();
      table.string('name').notNullable();
      table.string('type').notNullable();
      table.string('collection').notNullable();
      table.string('collection_version').notNullable();
      table.string('short_description');
      table.string('version_added');
      table.boolean('deprecated').notNullable().defaultTo(false);
      table
        .string('artifact_ref')
        .notNullable()
        .references('ref')
        .inTable('artifacts')
        .onDelete('CASCADE');
      table.text('detail');
      table.timestamp('created_at').notNullable().defaultTo(db.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(db.fn.now());
    });
    return db;
  }

  /**
   * A real store over an in-memory database, so the sync paths exercise the
   * actual discovery and reconciliation machinery with an injectable fetch.
   */
  async function indexWithFailedReconcile(): Promise<ContentStore> {
    const store = new ContentStore(
      [
        {
          name: 'corporate',
          url: 'https://registry.corp.example.com',
          auth: { type: 'anonymous' },
        },
      ] as never,
      (await createTestDB()) as never,
      { info: () => {}, warn: () => {}, debug: () => {} },
      defaultContentTypes(),
    );
    const internals = store as unknown as {
      reconcile: Map<string, unknown>;
      drift: Map<string, unknown>;
    };
    internals.reconcile.set('corporate', {
      at: '2026-10-22T00:00:00.000Z',
      ok: false,
      error:
        `repository listing failed: fetch failed: Hostname/IP does not match ` +
        `certificate's altnames: Hostname: registry.corp.example.com. is not ` +
        `in cert's altnames: DNS:secret-host.internal`,
      artifacts: 2,
    });
    internals.drift.set('corporate', {
      at: '2026-10-22T00:00:00.000Z',
      changed: false,
      details: ['check failed: connection refused from 10.1.2.3'],
      requests: 3,
    });
    return store;
  }

  it('replaces the reconcile error with the fixed summary on /registries', async () => {
    const res = await request(
      await appWith(await indexWithFailedReconcile()),
    ).get('/registries');

    expect(res.status).toBe(200);
    const corporate = res.body.items.find(
      (item: { name: string }) => item.name === 'corporate',
    );
    // Status, timestamp, and counts stay; the cause does not.
    expect(corporate.lastReconcileOk).toBe(false);
    expect(corporate.lastReconciledAt).toBe('2026-10-22T00:00:00.000Z');
    expect(corporate.lastReconcileError).toBe(RECONCILE_FAILURE_SUMMARY);
    // No certificate subjects, SANs, or internal hostnames leak: the
    // registry's own URL is configuration this route serves on purpose;
    // everything beyond it is diagnostic detail.
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('secret-host.internal');
    expect(body).not.toContain('altnames');
    expect(body).not.toContain('10.1.2.3');
  });

  it('keeps the detailed cause on the per-registry sync response', async () => {
    info.mockClear();
    const index = await indexWithFailedReconcile();
    // A live sync of the same registry fails with a detailed cause, the way
    // a TLS rejection would: the caller explicitly asked for the refresh, so
    // the response must carry it.
    const clients = (
      index as unknown as { clients: Map<string, { fetchImpl: unknown }> }
    ).clients;
    (clients.get('corporate') as unknown as { fetchImpl: unknown }).fetchImpl =
      () => Promise.reject(new Error('fetch failed: certificate has expired'));

    const res = await request(await appWith(index)).post(
      '/registries/corporate/sync',
    );

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('failed');
    expect(res.body.error).toContain('certificate has expired');
    expect(info).toHaveBeenCalledWith('sync corporate: 0 artifacts, ok=false');
    expect(inspect(info.mock.calls)).not.toContain('certificate has expired');
  });

  it('triggers a scheduled refresh and returns 202', async () => {
    const triggered: string[] = [];
    const scheduler = stubScheduler({
      triggerTask: async (id: string) => {
        triggered.push(id);
      },
    });

    const res = await request(
      await appWith(undefined, undefined, true, undefined, scheduler),
    ).post('/sync');

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('scheduled');
    expect(res.body.taskId).toBe(STORE_REFRESH_TASK_ID);
    expect(res.body.triggeredAt).toBeDefined();
    expect(triggered).toEqual([STORE_REFRESH_TASK_ID]);
  });

  it('cancels a running refresh before triggering a new one', async () => {
    const calls: string[] = [];
    const scheduler = stubScheduler({
      cancelTask: async (id: string) => {
        calls.push(`cancel:${id}`);
      },
      triggerTask: async (id: string) => {
        calls.push(`trigger:${id}`);
      },
    });

    await request(
      await appWith(undefined, undefined, true, undefined, scheduler),
    ).post('/sync');

    expect(calls).toEqual([
      `cancel:${STORE_REFRESH_TASK_ID}`,
      `trigger:${STORE_REFRESH_TASK_ID}`,
    ]);
  });

  it('returns 409 when the refresh task cannot be triggered', async () => {
    const scheduler = stubScheduler({
      triggerTask: async () => {
        const err = new Error('Conflict');
        err.name = 'ConflictError';
        throw err;
      },
    });

    const res = await request(
      await appWith(undefined, undefined, true, undefined, scheduler),
    ).post('/sync');

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('conflict');
    expect(res.body.taskId).toBe(STORE_REFRESH_TASK_ID);
  });
});

describe('GET /registries', () => {
  it.each([undefined, { at: '2026-10-31', ok: true, artifacts: 0 }])(
    'omits failure diagnostics when reconciliation is %p',
    async reconcile => {
      const index = stubDB({
        getRegistry: () =>
          ({
            connection: {
              name: 'mock',
              url: 'https://mock.registry',
              auth: { type: 'anonymous' },
            },
          }) as never,
        listRegistries: () =>
          [
            {
              connection: {
                name: 'mock',
                url: 'https://mock.registry',
                auth: { type: 'anonymous' },
              },
            },
          ] as never,
        reconcileStateFor: () => reconcile as never,
      });
      const res = await request(await appWith(index)).get('/registries');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).not.toHaveProperty('lastReconcileError');
      expect(res.body.items[0].lastReconcileOk).toBe(reconcile?.ok);
    },
  );
  it('returns empty items when none are configured', async () => {
    const index = seedDB([]);
    const res = await request(await appWith(index)).get('/registries');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('POST poll returns 404 for an unknown registry', async () => {
    const index = seedDB([]);
    const res = await request(await appWith(index)).post(
      '/registries/reg/poll',
    );

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
    const index = seedDB([]);
    const res = await request(await appWith(index))
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
    const res = await request(await appWith(seedDB([])))
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
    const res = await request(await appWith(seedDB([])))
      .post('/config/validate')
      .send(document([registry(), registry()]));
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toEqual([
      { path: 'registries[1].name', message: 'Duplicate registry name: mock' },
    ]);
  });

  it('warns that realm rewriting changes the credential destination', async () => {
    const res = await request(await appWith(seedDB([])))
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
    const res = await request(await appWith(seedDB([])))
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
    const res = await request(await appWith(seedDB([])))
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
      const res = await request(await appWith(seedDB([])))
        .post('/config/validate')
        .send(document([registry({ repositories: [], namespaces })]));
      expect(res.body.valid).toBe(true);
      expect(res.body.warnings).toHaveLength(namespaces.length ? 0 : 1);
    },
  );

  it('rejects caFile combined with the insecure opt-out, at the caFile path', async () => {
    // The same refusal readRegistryConfigs makes at startup — CI must see it
    // before the process does, not as a boot failure after merge.
    const index = seedDB([]);
    const res = await request(await appWith(index))
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
      const res = await request(await appWith(seedDB([])))
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
      const res = await request(await appWith(seedDB([])))
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
      const res = await request(await appWith(seedDB([])))
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
      const res = await request(await appWith(seedDB([])))
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
    return stubDB({
      getRegistry: () =>
        ({
          connection: {
            name: 'reg',
            url: 'https://reg.example',
            auth: { type: 'anonymous' },
          },
        }) as never,
      listRegistries: () =>
        [
          {
            connection: {
              name: 'reg',
              url: 'https://reg.example',
              auth: { type: 'anonymous' },
            },
          },
        ] as never,
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
    const res = await request(await appWith(seedDB([])))
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
    const res = await request(await appWith(seedDB([])))
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
    const res = await request(await appWith(seedDB([])))
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
      const res = await request(await appWith(seedDB([])))
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
    const res = await request(await appWith(seedDB([])))
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
    const res = await request(await appWith(seedDB([])))
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
    const res = await request(await appWith(seedDB([])))
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
    const res = await request(await appWith(seedDB([])))
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
    const res = await request(await appWith(seedDB([])))
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
    const res = await request(await appWith(seedDB([])))
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
