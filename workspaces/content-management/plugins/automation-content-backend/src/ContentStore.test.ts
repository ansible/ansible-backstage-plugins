/**
 * @jest-environment node
 */
import knexFactory from 'knex';
import { defaultContentTypes } from '@ansible/plugin-catalog-backend-module-automation-content';
import { CONTENT_MANIFEST_ARTIFACT_TYPE } from '@ansible/content-model';
import {
  MockRegistry,
  MediaTypes,
  RegistryConnection,
  fakeRegistryCredentials,
  makeImage,
  makeLabelledImage,
  eeRepositoryEntityRef,
} from '@ansible/automation-content-common';
import {
  ContentStore,
  RegistryScanIncomplete,
  RegistryWriterBusy,
} from './ContentStore';

const silent = { info: () => {}, warn: () => {}, debug: () => {} };

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
    table.string('pull_reference').notNullable();
    table.boolean('contents_known').notNullable().defaultTo(false);
    table.text('classification').notNullable().defaultTo('{}');
    table.text('manifest');
    table.text('signing');
    table.text('tag_timestamps');
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

function connection(): RegistryConnection {
  return {
    name: 'mock',
    url: 'https://mock.registry',
    auth: { type: 'anonymous' },
    repositories: ['ansible/ee'],
  };
}

async function storeOver(registry: MockRegistry): Promise<ContentStore> {
  const db = await createTestDB();
  const store = new ContentStore(
    [connection()],
    db as never,
    silent,
    defaultContentTypes(),
  );
  const clients = (
    store as unknown as { clients: Map<string, { fetchImpl: unknown }> }
  ).clients;
  const client = clients.get('mock')!;
  (client as unknown as { fetchImpl: unknown }).fetchImpl = registry.fetch;
  return store;
}

const EE_LABEL = 'ansible-execution-environment';

describe('EE repository projection', () => {
  it('applies typed repository search and favorites before stable sorting and pagination', async () => {
    const db = await createTestDB();
    try {
      const otherRegistry = { ...connection(), name: 'second' };
      const store = new ContentStore(
        [connection(), otherRegistry],
        db as never,
        silent,
        undefined,
        new Map([
          ['mock', 'group:default/platform'],
          ['second', 'group:default/automation'],
        ]),
        new Map([['mock', new Map([['team/image-21', ['networking']]])]]),
      );
      const insert = (
        repository: string,
        index: number,
        tags: string[],
        registry = 'mock',
        type = 'execution-environment',
        manifest: string | null = null,
      ) => {
        const digest = `sha256:${String(index).padStart(64, '0')}`;
        return {
          ref: `${registry}/${repository}@${digest}`,
          registry,
          repository,
          digest,
          tags: JSON.stringify(tags),
          pull_reference: `mock.registry/${repository}@${digest}`,
          type,
          classification: '{}',
          manifest,
        };
      };
      const rows = Array.from({ length: 22 }, (_, i) =>
        insert(`team/image-${String(i).padStart(2, '0')}`, i, ['release']),
      );
      rows.push(
        {
          ...insert('team/image-21', 24, ['v2', 'v2-alias', 'latest']),
          manifest: JSON.stringify({ collections: [{ name: 'example' }] }),
        },
        insert('team/image-21', 25, ['ordinary-only'], 'mock', 'oci-image'),
        insert('team/image-21', 26, ['release'], 'second'),
        insert('team/tagless', 27, []),
      );
      await db('artifacts').insert(rows);
      const first = await store.queryEERepositories({ page: 1, pageSize: 10 });
      expect(first.totalItems).toBe(24);
      await expect(
        store.queryEERepositories({
          sourceType: 'external-registry',
          status: 'not-reconciled',
          registry: 'mock',
          page: 2,
          pageSize: 10,
        }),
      ).resolves.toMatchObject({
        totalItems: 23,
        items: Array.from({ length: 10 }, (_, i) => ({
          repository: `team/image-${i + 10}`,
          status: 'not-reconciled',
        })),
      });
      await expect(
        store.queryEERepositories({ status: 'available' }),
      ).resolves.toMatchObject({ totalItems: 0, items: [] });

      expect(first.items.map(item => item.repository)).toEqual(
        Array.from(
          { length: 10 },
          (_, i) => `team/image-${String(i).padStart(2, '0')}`,
        ),
      );
      const favorite = await store.queryEERepositories({
        page: 1,
        pageSize: 10,
        favoriteEntityRefs: [eeRepositoryEntityRef('mock', 'team/image-21')],
      });
      expect(favorite.totalItems).toBe(1);
      expect(favorite.items[0]).toMatchObject({
        registry: 'mock',
        repository: 'team/image-21',
        tagCount: 4,
        collectionCount: 1,
      });
      expect(first.facets).toEqual({
        tags: ['latest', 'release', 'v2', 'v2-alias'],
        descriptiveTags: ['networking'],
        owners: ['group:default/automation', 'group:default/platform'],
        totalImages: 24,
      });
      const filtered = await store.queryEERepositories({
        tag: 'v2-alias',
        descriptiveTag: 'networking',
        owner: 'group:default/platform',
        latestOnly: true,
      });
      expect(filtered.totalItems).toBe(1);
      expect(filtered.items[0].repository).toBe('team/image-21');
      expect(filtered.facets).toEqual(first.facets);
      expect(
        (await store.queryEERepositories({ descriptiveTag: 'v2-alias' }))
          .totalItems,
      ).toBe(0);
      expect(
        (
          await store.queryEERepositories({
            descriptiveTag: 'networking',
            tag: 'release',
          })
        ).items.map(item => item.registry),
      ).toEqual(['mock']);
      expect(
        (
          await store.queryEERepositories({
            tag: 'v2-alias',
            owner: 'group:default/automation',
          })
        ).totalItems,
      ).toBe(0);
      expect(
        (await store.queryEERepositories({ query: 'ordinary-only' }))
          .totalItems,
      ).toBe(0);
      expect(
        (await store.queryEERepositories({ query: 'v2-ALIAS' })).totalItems,
      ).toBe(1);
      const tied = await store.queryEERepositories({
        query: 'team/image-21',
        order: 'desc',
      });
      expect(tied.items.map(item => item.registry)).toEqual(['mock', 'second']);
      const detail = await store.getEERepository('mock', 'team/image-21');
      expect(detail?.tags.find(tag => tag.tag === 'v2')?.digest).toBe(
        detail?.tags.find(tag => tag.tag === 'v2-alias')?.digest,
      );
      expect(detail?.tags.map(tag => tag.tag)).not.toContain('ordinary-only');
      const tagless = await store.getEERepository('mock', 'team/tagless');
      expect(tagless?.tags).toEqual([]);
      expect(tagless?.digests).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });
});

describe('repository refresh', () => {
  it('updates the exact tag map, retains old data on failed inspection and allows an empty complete scan', async () => {
    const first = makeLabelledImage('v1', { [EE_LABEL]: 'true' });
    const repositories = { 'ansible/ee': [first] };
    const registry = new MockRegistry({ repositories });
    const store = await storeOver(registry);
    await store.refreshRegistry('mock');

    repositories['ansible/ee'] = [
      {
        ...makeLabelledImage('v1', { [EE_LABEL]: 'true' }),
        digest: `sha256:${'d'.repeat(64)}`,
      },
      makeLabelledImage('v2', { [EE_LABEL]: 'true' }),
    ];
    const refresh = store.refreshEERepository('mock', 'ansible/ee');
    await expect(store.pollRegistry('mock', false)).rejects.toBeInstanceOf(
      RegistryWriterBusy,
    );
    await expect(refresh).resolves.toMatchObject({
      result: {
        status: 'completed',
        addedTags: 1,
        movedTags: 1,
        removedTags: 0,
      },
    });

    const successfulAt = (await store.getEERepository('mock', 'ansible/ee'))
      ?.lastSuccessfulReconcileAt;
    expect(successfulAt).toBeTruthy();
    await expect(
      store.queryEERepositories({ status: 'available' }),
    ).resolves.toMatchObject({
      totalItems: 1,
      items: [{ status: 'available' }],
    });

    repositories['ansible/ee'] = [
      {
        ...makeLabelledImage('v3', { [EE_LABEL]: 'true' }),
        digest: 'sha256:invalid',
      },
    ];
    await expect(
      store.refreshEERepository('mock', 'ansible/ee'),
    ).rejects.toBeInstanceOf(RegistryScanIncomplete);
    expect(
      (await store.getEERepository('mock', 'ansible/ee'))?.tags.map(
        item => item.tag,
      ),
    ).toEqual(['v2', 'v1']);

    await expect(store.refreshRegistry('mock')).resolves.toMatchObject({
      ok: false,
    });
    await expect(
      store.getEERepository('mock', 'ansible/ee'),
    ).resolves.toMatchObject({
      stale: true,
      lastSuccessfulReconcileAt: successfulAt,
    });
    await expect(
      store.queryEERepositories({ status: 'stale' }),
    ).resolves.toMatchObject({ totalItems: 1, items: [{ status: 'stale' }] });
    await expect(
      store.queryEERepositories({ status: 'available' }),
    ).resolves.toMatchObject({ totalItems: 0, items: [] });

    repositories['ansible/ee'] = [];
    await expect(
      store.refreshEERepository('mock', 'ansible/ee'),
    ).resolves.toMatchObject({
      result: {
        status: 'completed',
        addedTags: 0,
        movedTags: 0,
        removedTags: 2,
      },
    });
    await expect(
      store.getEERepository('mock', 'ansible/ee'),
    ).resolves.toBeUndefined();
  });
});

describe('drift detection', () => {
  it('reports no change when the registry matches the store', async () => {
    const registry = new MockRegistry({
      repositories: {
        'ansible/ee': [makeLabelledImage('v1', { [EE_LABEL]: 'true' })],
      },
    });
    const store = await storeOver(registry);
    await store.refreshRegistry('mock');

    const drift = await store.detectDrift('mock');

    expect(drift.changed).toBe(false);
    expect(drift.details).toEqual([]);
  });

  it('detects a newly added tag', async () => {
    const v1 = makeLabelledImage('v1', { [EE_LABEL]: 'true' });
    const repositories = { 'ansible/ee': [v1] };
    const registry = new MockRegistry({ repositories });
    const store = await storeOver(registry);
    await store.refreshRegistry('mock');

    repositories['ansible/ee'].push(
      makeLabelledImage('v2', { [EE_LABEL]: 'true' }),
    );
    const drift = await store.detectDrift('mock');

    expect(drift.changed).toBe(true);
    expect(drift.details.join()).toContain('ansible/ee:v2 added');
  });

  it('detects a tag moved to different content', async () => {
    const v1 = makeLabelledImage('v1', { [EE_LABEL]: 'true' });
    const repositories = { 'ansible/ee': [v1] };
    const registry = new MockRegistry({ repositories });
    const store = await storeOver(registry);
    await store.refreshRegistry('mock');

    const moved = makeLabelledImage('v1', { [EE_LABEL]: 'true' });
    moved.digest = `sha256:${'9'.repeat(64)}`;
    repositories['ansible/ee'] = [moved];

    const drift = await store.detectDrift('mock');

    expect(drift.changed).toBe(true);
    expect(drift.details.join()).toMatch(/ansible\/ee:v1 moved/);
  });

  it('detects a removed tag', async () => {
    const repositories = {
      'ansible/ee': [
        makeLabelledImage('v1', { [EE_LABEL]: 'true' }),
        makeLabelledImage('v2', { [EE_LABEL]: 'true' }),
      ],
    };
    const registry = new MockRegistry({ repositories });
    const store = await storeOver(registry);
    await store.refreshRegistry('mock');

    repositories['ansible/ee'] = [repositories['ansible/ee'][0]];
    const drift = await store.detectDrift('mock');

    expect(drift.changed).toBe(true);
    expect(drift.details.join()).toContain('ansible/ee:v2 removed');
  });

  it('ignores referrer fallback tags, which are artifacts about images', async () => {
    const image = makeLabelledImage('v1', { [EE_LABEL]: 'true' });
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      referrersMode: 'tag-fallback',
    });
    const store = await storeOver(registry);
    await store.refreshRegistry('mock');

    const drift = await store.detectDrift('mock');
    expect(drift.details.join()).not.toContain('sha256-');
  });

  it('treats a failed check as "no change", not as everything being removed', async () => {
    const registry = new MockRegistry({
      repositories: {
        'ansible/ee': [makeLabelledImage('v1', { [EE_LABEL]: 'true' })],
      },
    });
    const store = await storeOver(registry);
    await store.refreshRegistry('mock');

    const clients = (store as unknown as { clients: Map<string, unknown> })
      .clients;
    (clients.get('mock') as { fetchImpl: unknown }).fetchImpl = () =>
      Promise.reject(new Error('connection refused'));

    const drift = await store.detectDrift('mock');

    expect(drift.changed).toBe(false);
    expect(drift.details.join()).toMatch(/check failed/);
  });

  it('refreshes only when drift is found', async () => {
    const repositories = {
      'ansible/ee': [makeLabelledImage('v1', { [EE_LABEL]: 'true' })],
    };
    const registry = new MockRegistry({ repositories });
    const store = await storeOver(registry);
    await store.refreshRegistry('mock');

    const quiet = await store.pollRegistry('mock');
    expect(quiet.refreshed).toBe(false);

    repositories['ansible/ee'].push(makeImage({ tag: 'v2' }));
    const noisy = await store.pollRegistry('mock');

    expect(noisy.changed).toBe(true);
    expect(noisy.refreshed).toBe(true);
    expect(await store.listArtifacts('oci-image')).toHaveLength(1);
  });
});

describe('digest cache', () => {
  it('avoids re-reading unchanged content on a second refresh', async () => {
    const registry = new MockRegistry({
      repositories: {
        'ansible/ee': [makeLabelledImage('v1', { [EE_LABEL]: 'true' })],
      },
    });
    const store = await storeOver(registry);

    await store.refreshRegistry('mock');
    const afterFirst = store.cacheStats.misses;

    registry.reset();
    await store.refreshRegistry('mock');

    expect(store.cacheStats.hits).toBeGreaterThan(0);
    expect(store.cacheStats.misses).toBe(afterFirst);
    expect(registry.countRequests('/blobs/')).toBe(0);
  });
});

describe('error cause traversal is bounded', () => {
  async function storeFailingWith(error: unknown): Promise<ContentStore> {
    const db = await createTestDB();
    const store = new ContentStore(
      [connection()],
      db as never,
      silent,
      defaultContentTypes(),
    );
    const clients = (
      store as unknown as { clients: Map<string, { fetchImpl: unknown }> }
    ).clients;
    (clients.get('mock') as unknown as { fetchImpl: unknown }).fetchImpl = () =>
      Promise.reject(error);
    return store;
  }

  it('unwraps a wrapped chain to the real message', async () => {
    const wrapped: Error & { cause?: unknown } = new Error('fetch failed');
    wrapped.cause = new Error('unable to get local issuer certificate');

    const outcome = await (
      await storeFailingWith(wrapped)
    ).refreshRegistry('mock');

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('fetch failed');
    expect(outcome.error).toContain('unable to get local issuer certificate');
    expect(outcome.error).not.toContain('truncated');
  });

  it('terminates on a self-referencing cause', async () => {
    const cyclic: Error & { cause?: unknown } = new Error('loop');
    cyclic.cause = cyclic;

    const outcome = await (
      await storeFailingWith(cyclic)
    ).refreshRegistry('mock');

    expect(outcome.error).toContain('loop');
    expect(outcome.error).toContain('truncated');
  });

  it('terminates on a two-object cause cycle', async () => {
    const alpha: Error & { cause?: unknown } = new Error('alpha');
    const beta: Error & { cause?: unknown } = new Error('beta');
    alpha.cause = beta;
    beta.cause = alpha;

    const outcome = await (
      await storeFailingWith(alpha)
    ).refreshRegistry('mock');

    expect(outcome.error).toContain('alpha');
    expect(outcome.error).toContain('beta');
    expect(outcome.error).toContain('truncated');
  });

  it('caps an excessively deep chain', async () => {
    const head: Error & { cause?: unknown } = new Error('depth-0');
    let tail = head;
    for (let depth = 1; depth < 50; depth++) {
      const next: Error & { cause?: unknown } = new Error(`depth-${depth}`);
      tail.cause = next;
      tail = next;
    }

    const outcome = await (
      await storeFailingWith(head)
    ).refreshRegistry('mock');

    expect(outcome.error).toContain('depth-0');
    expect(outcome.error).toContain('truncated');
    expect(outcome.error).not.toContain('depth-49');
  });

  it('describes a non-Error rejection value', async () => {
    const store = await storeFailingWith('gateway gone');
    const outcome = await store.refreshRegistry('mock');

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('gateway gone');
  });

  it.each([
    [{}, 'unknown error'],
    [{ message: 42 }, 'unknown error'],
    [new Error(''), 'unknown error'],
    [null, 'null'],
    [undefined, 'undefined'],
    [42, '42'],
    [false, 'false'],
  ])(
    'describes rejection %p without default object stringification',
    async (error, message) => {
      const outcome = await (
        await storeFailingWith(error)
      ).refreshRegistry('mock');
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toBe(`capability probe failed: ${message}`);
      expect(outcome.error).not.toContain('[object Object]');
    },
  );

  it('reports the cause chain when a drift check fails', async () => {
    const wrapped: Error & { cause?: unknown } = new Error('fetch failed');
    wrapped.cause = new Error('unable to get local issuer certificate');
    const store = await storeFailingWith(wrapped);

    const drift = await store.detectDrift('mock');

    expect(drift.changed).toBe(false);
    expect(drift.details).toEqual([
      'check failed: fetch failed: unable to get local issuer certificate',
    ]);
    expect(store.driftStateFor('mock')).toEqual(drift);
  });

  it('describes non-Error drift-check failures', async () => {
    const store = await storeFailingWith('gateway gone');

    const drift = await store.detectDrift('mock');

    expect(drift.changed).toBe(false);
    expect(drift.details).toEqual(['check failed: gateway gone']);
  });

  it('bounds cyclic drift-check failures', async () => {
    const cyclic: Error & { cause?: unknown } = new Error('loop');
    cyclic.cause = cyclic;
    const store = await storeFailingWith(cyclic);

    const drift = await store.detectDrift('mock');

    expect(drift.changed).toBe(false);
    expect(drift.details).toEqual([
      'check failed: loop: (cause chain truncated)',
    ]);
  });
});

describe('credential redaction', () => {
  const SECRET = fakeRegistryCredentials().password;
  const BASIC_WIRE_FORM = Buffer.from(`ci:${SECRET}`, 'utf8').toString(
    'base64',
  );

  function secretConnection(): RegistryConnection {
    return {
      name: 'mock',
      url: `https://ci:${SECRET}@mock.registry`,
      auth: { type: 'basic', username: 'ci', password: SECRET },
      repositories: ['ansible/ee'],
    };
  }

  async function secretStoreFailingWith(
    error: unknown,
    logs: string[] = [],
  ): Promise<ContentStore> {
    const db = await createTestDB();
    const store = new ContentStore(
      [secretConnection()],
      db as never,
      {
        info: message => logs.push(message),
        warn: message => logs.push(message),
        debug: message => logs.push(message),
      },
      defaultContentTypes(),
    );
    const clients = (
      store as unknown as { clients: Map<string, { fetchImpl: unknown }> }
    ).clients;
    (clients.get('mock') as unknown as { fetchImpl: unknown }).fetchImpl = () =>
      Promise.reject(error);
    return store;
  }

  it('redacts credentials from reconcile errors and logs', async () => {
    const logs: string[] = [];
    const index = await secretStoreFailingWith(
      new Error(`fetch failed: authorization rejected for ${SECRET}`),
      logs,
    );

    const outcome = await index.refreshRegistry('mock');

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('[REDACTED]');
    expect(outcome.error).not.toContain(SECRET);
    expect(logs.join('\n')).not.toContain(SECRET);
  });

  it('redacts the base64 basic-auth form from errors', async () => {
    const store = await secretStoreFailingWith(
      new Error(`Authorization Basic ${BASIC_WIRE_FORM} rejected`),
    );
    const outcome = await store.refreshRegistry('mock');

    expect(outcome.ok).toBe(false);
    expect(outcome.error).not.toContain(BASIC_WIRE_FORM);
    expect(outcome.error).toContain('[REDACTED]');
  });

  it('redacts credentials from drift-check details', async () => {
    const index = await secretStoreFailingWith(
      new Error(`fetch failed: ${SECRET} in the URL userinfo`),
    );

    const drift = await index.detectDrift('mock');

    expect(drift.changed).toBe(false);
    expect(drift.details.join()).toContain('[REDACTED]');
    expect(drift.details.join()).not.toContain(SECRET);
  });

  it('exposes a live redactor covering its registries', async () => {
    const db = await createTestDB();
    const index = new ContentStore(
      [secretConnection()],
      db as never,
      silent,
      defaultContentTypes(),
    );

    expect(index.redactor.redact(`pw=${SECRET}`)).toBe('pw=[REDACTED]');
    expect(index.redactor.redact(BASIC_WIRE_FORM)).toBe('[REDACTED]');
  });

  it('redacts content manifests and indexes repeated names across plugin types', async () => {
    const referrerDigest = `sha256:${'a'.repeat(64)}`;
    const payloadDigest = `sha256:${'b'.repeat(64)}`;
    const image = {
      ...makeLabelledImage('v1', { [EE_LABEL]: 'true' }),
      referrers: [
        {
          mediaType: MediaTypes.ociManifest,
          digest: referrerDigest,
          size: 200,
          artifactType: CONTENT_MANIFEST_ARTIFACT_TYPE,
        },
      ],
      referrerPayloads: {
        [payloadDigest]: {
          schemaVersion: 'v1',
          generatedAt: '2026-01-01T00:00:00Z',
          generatedBy: { tool: 'ansible-builder', version: '1.2' },
          complete: true,
          collections: [
            {
              namespace: 'demo',
              name: 'net',
              version: '1.0.0',
              description: `contains ${SECRET}`,
              plugins: [
                { name: 'shared', fqcn: 'demo.net.shared', type: 'module' },
                { name: 'shared', fqcn: 'demo.net.shared', type: 'action' },
                { name: 'shared', fqcn: 'demo.net.shared', type: 'module' },
              ],
              roles: [],
              playbooks: [],
              edaPlugins: [],
              rulebooks: [],
            },
          ],
        },
      },
    };
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      referrersMode: 'native',
    });
    const db = await createTestDB();
    const store = new ContentStore(
      [secretConnection()],
      db as never,
      silent,
      defaultContentTypes(),
    );
    const clients = (
      store as unknown as { clients: Map<string, { fetchImpl: unknown }> }
    ).clients;
    (clients.get('mock') as unknown as { fetchImpl: unknown }).fetchImpl =
      registry.fetch;

    const outcome = await store.refreshRegistry('mock');
    expect(outcome.ok).toBe(true);

    const row = await db('artifacts').first();
    expect(row?.manifest).toBeDefined();
    expect(row.manifest).not.toContain(SECRET);
    expect(row.manifest).toContain('[REDACTED]');
    const variants = await store.findItems('demo.net.shared', row.ref);
    expect(variants.map(variant => variant.type).sort()).toEqual([
      'action',
      'module',
    ]);
  });
});
