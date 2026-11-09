/**
 * @jest-environment node
 */
import knexFactory from 'knex';
import { readFileSync } from 'fs';
import { join } from 'path';
import { defaultContentTypes } from '@ansible/plugin-catalog-backend-module-automation-content';
import { CONTENT_MANIFEST_ARTIFACT_TYPE } from '@ansible/content-model';
import {
  MockRegistry,
  MediaTypes,
  RegistryConnection,
  fakeRegistryCredentials,
  makeImage,
  makeLabelledImage,
  OCIClient,
} from '@ansible/automation-content-common';
import { ContentStore, itemKey } from './ContentStore';

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

async function storeOver(
  registry: MockRegistry,
  contentTypes = defaultContentTypes(),
): Promise<ContentStore> {
  const db = await createTestDB();
  const store = new ContentStore(
    [connection()],
    db as never,
    silent,
    contentTypes,
  );
  const clients = (
    store as unknown as { clients: Map<string, { fetchImpl: unknown }> }
  ).clients;
  const client = clients.get('mock')!;
  (client as unknown as { fetchImpl: unknown }).fetchImpl = registry.fetch;
  return store;
}

const EE_LABEL = 'ansible-execution-environment';

describe('archive content intake', () => {
  it('hashes realistic long identities into stable bounded keys without merging types or sources', () => {
    const ref = `local-registry/${'long-namespace/'.repeat(
      8,
    )}skills/cluster-triage@sha256:${'a'.repeat(64)}`;
    const fqcn = 'utopia-cluster-triage';
    expect(JSON.stringify([ref, fqcn, 'skill']).length).toBeGreaterThan(255);
    const key = itemKey(ref, fqcn, 'skill');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(itemKey(ref, fqcn, 'skill'));
    expect(key).not.toBe(itemKey(ref, fqcn, 'collection'));
    expect(key).not.toBe(
      itemKey(ref.replace('local-registry', 'other-registry'), fqcn, 'skill'),
    );
    expect(key).not.toBe(
      itemKey(ref.replace('a'.repeat(64), 'b'.repeat(64)), fqcn, 'skill'),
    );
  });

  it('retains stale last-good archive items only for the same immutable artifact after a failed read', async () => {
    const skill = makeImage({ tag: 'skill' });
    skill.manifest = {
      ...skill.manifest,
      artifactType: 'application/vnd.ansible.fixture.skill.v1+json',
    };
    const repositories = {
      'ansible/ee': [skill, makeImage({ tag: 'healthy' })],
    };
    const store = await storeOver(new MockRegistry({ repositories }));
    const client = (
      store as unknown as { clients: Map<string, OCIClient> }
    ).clients.get('mock')!;
    const payload = readFileSync(
      join(
        __dirname,
        '../../content-type-ansible-skill/src/fixtures/layer.tar.gz',
      ),
    );
    jest
      .spyOn(client, 'getBlob')
      .mockResolvedValueOnce(payload)
      .mockResolvedValue(undefined);
    expect((await store.refreshRegistry('mock')).ok).toBe(true);
    const first = (await store.listArtifacts('skill'))[0];
    expect(first.enumeration?.status).toBe('complete');
    expect(await store.itemsIn(first.ref)).toHaveLength(1);
    repositories['ansible/ee'].push(makeImage({ tag: 'new-healthy' }));
    expect((await store.refreshRegistry('mock')).ok).toBe(true);
    const stale = await store.getArtifact(first.ref);
    expect(stale).toMatchObject({
      contentsKnown: true,
      enumeration: {
        status: 'partial',
        extractedAt: first.enumeration?.extractedAt,
      },
    });
    expect(stale?.enumeration?.diagnostics).toEqual([
      expect.stringContaining('cached/stale'),
      'layer payload unavailable',
    ]);
    expect(await store.itemsIn(first.ref)).toEqual(
      await store.findItems('cluster-triage', first.ref),
    );
    expect(await store.itemsIn(first.ref)).toHaveLength(1);
    expect(
      (await store.listArtifacts()).some(a => a.tags.includes('new-healthy')),
    ).toBe(true);
    skill.digest = `sha256:${'e'.repeat(64)}`;
    expect((await store.refreshRegistry('mock')).ok).toBe(true);
    const changed = (await store.listArtifacts('skill'))[0];
    expect(changed.ref).not.toBe(first.ref);
    expect(changed).toMatchObject({
      contentsKnown: false,
      enumeration: { status: 'unknown' },
    });
    expect(await store.itemsIn(changed.ref)).toEqual([]);
  });

  it('clears last-good archive items when a complete empty inventory is successfully read', async () => {
    const skill = makeImage({ tag: 'skill' });
    skill.manifest = {
      ...skill.manifest,
      artifactType: 'application/vnd.ansible.fixture.skill.v1+json',
    };
    const contentTypes = defaultContentTypes();
    const enumerate = jest.spyOn(contentTypes.get('skill')!, 'enumerate');
    enumerate.mockResolvedValueOnce({
      status: 'complete',
      source: 'blob-fetch',
      schemaVersion: '1.0.0',
      extractedAt: '2026-01-01T00:00:00Z',
      items: [{ fqcn: 'demo', name: 'demo', type: 'skill', detail: {} }],
    } as import('@ansible/automation-content-common').ArchiveEnumeration);
    enumerate.mockResolvedValue({
      status: 'complete',
      source: 'blob-fetch',
      schemaVersion: '1.0.0',
      extractedAt: '2026-02-01T00:00:00Z',
      items: [],
    } as import('@ansible/automation-content-common').ArchiveEnumeration);
    const store = await storeOver(
      new MockRegistry({ repositories: { 'ansible/ee': [skill] } }),
      contentTypes,
    );
    await store.refreshRegistry('mock');
    expect(await store.listItems()).toHaveLength(1);
    expect((await store.refreshRegistry('mock')).ok).toBe(true);
    expect(await store.listItems()).toEqual([]);
    expect((await store.listArtifacts('skill'))[0]).toMatchObject({
      contentsKnown: true,
      enumeration: {
        status: 'complete',
        items: [],
        extractedAt: '2026-02-01T00:00:00Z',
      },
    });
  });

  it('encodes full item identities without delimiter ambiguity', () => {
    expect(itemKey('a::b', 'c', 'filter')).not.toBe(
      itemKey('a', 'b::c', 'filter'),
    );
    expect(itemKey('a', 'b', 'callback')).not.toBe(itemKey('a', 'b', 'filter'));
  });
  it('preserves plugin categories while deduplicating identical full identities across repeated refreshes', async () => {
    const referrerDigest = `sha256:${'ref'.padEnd(64, '0')}`;
    const payloadDigest = `sha256:${'pay'.padEnd(64, '0')}`;
    const image = {
      ...makeLabelledImage('duplicate-plugins', { [EE_LABEL]: 'true' }),
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
              namespace: 'ansible',
              name: 'builtin',
              version: '2.18.0',
              plugins: [
                {
                  fqcn: 'ansible.builtin.default',
                  name: 'default',
                  type: 'callback',
                  shortDescription: 'First occurrence',
                },
                {
                  fqcn: 'ansible.builtin.default',
                  name: 'default',
                  type: 'filter',
                  shortDescription: 'Second occurrence',
                },
                {
                  fqcn: 'ansible.builtin.debug',
                  name: 'debug',
                  type: 'module',
                  shortDescription: 'Unaffected plugin',
                },
                {
                  fqcn: 'ansible.builtin.default',
                  name: 'default',
                  type: 'callback',
                  shortDescription: 'Exact duplicate loses',
                },
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
    const store = await storeOver(registry);
    for (let refresh = 0; refresh < 2; refresh++) {
      expect((await store.refreshRegistry('mock')).ok).toBe(true);
      const artifacts = await store.listArtifacts('execution-environment');
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].contentsKnown).toBe(true);
      expect(await store.findItems('ansible.builtin.default')).toEqual([
        expect.objectContaining({
          type: 'callback',
          shortDescription: 'First occurrence',
        }),
        expect.objectContaining({
          type: 'filter',
          shortDescription: 'Second occurrence',
        }),
      ]);
      expect(
        await store.findItems(
          'ansible.builtin.default',
          artifacts[0].ref,
          'filter',
        ),
      ).toEqual([expect.objectContaining({ type: 'filter' })]);
      expect(
        await store.findItems(
          'ansible.builtin.default',
          artifacts[0].ref,
          'lookup',
        ),
      ).toEqual([]);
      expect(await store.findItems('ansible.builtin.debug')).toEqual([
        expect.objectContaining({
          type: 'module',
          shortDescription: 'Unaffected plugin',
        }),
      ]);
      expect(await store.listItems()).toHaveLength(3);
    }
  });

  it('classifies mixed content, persists inventories and retains them across reads and refreshes', async () => {
    const skill = makeImage({ tag: 'skill' });
    const collection = makeImage({ tag: 'collection' });
    skill.manifest = {
      ...skill.manifest,
      artifactType: 'application/vnd.ansible.fixture.skill.v1+json',
      layers: [
        {
          mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
          size: 512,
          digest: `sha256:${'c'.repeat(64)}`,
        },
      ],
      annotations: {
        'org.opencontainers.image.version': '1.0.0',
        'org.opencontainers.image.title': 'Cluster triage',
      },
    } as typeof skill.manifest;
    collection.manifest = {
      ...collection.manifest,
      artifactType: 'application/vnd.ansible.fixture.collection.v1+json',
      layers: [
        {
          mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
          size: 1024,
          digest: `sha256:${'d'.repeat(64)}`,
        },
      ],
    } as typeof collection.manifest;
    const registry = new MockRegistry({
      repositories: {
        'ansible/ee': [
          makeLabelledImage('ee', { [EE_LABEL]: 'true' }),
          skill,
          collection,
          makeImage({ tag: 'plain' }),
        ],
      },
    });
    const store = await storeOver(registry);
    const client = (
      store as unknown as { clients: Map<string, { fetchImpl: unknown }> }
    ).clients.get('mock')!;
    const fallback = registry.fetch;
    client.fetchImpl = async (
      url: string,
      init: Parameters<typeof fallback>[1],
    ) => {
      let type: string | undefined;
      if (url.endsWith(`sha256:${'c'.repeat(64)}`)) type = 'skill';
      if (url.endsWith(`sha256:${'d'.repeat(64)}`)) type = 'collection';
      if (type && url.includes('/blobs/')) {
        return new Response(
          readFileSync(
            join(
              __dirname,
              `../../content-type-ansible-${type}/src/fixtures/layer.tar.gz`,
            ),
          ),
        );
      }
      return fallback(url, init);
    };
    expect((await store.refreshRegistry('mock')).ok).toBe(true);
    expect((await store.listArtifacts()).map(a => a.type).sort()).toEqual([
      'collection',
      'execution-environment',
      'oci-image',
      'skill',
    ]);
    const skills = await store.listArtifacts('skill');
    expect(skills[0]).toMatchObject({
      contentsKnown: true,
      metadata: { title: 'Cluster triage', version: '1.0.0' },
      enumeration: { status: 'complete', source: 'blob-fetch' },
    });
    expect(skills[0].manifest).toBeUndefined();
    expect(await store.itemsIn(skills[0].ref)).toEqual([
      expect.objectContaining({
        fqcn: 'cluster-triage',
        type: 'skill',
        collectionVersion: '1.0.0',
        shortDescription: 'Diagnose a cluster',
      }),
    ]);
    const collections = await store.listArtifacts('collection');
    expect(await store.itemsIn(collections[0].ref)).toEqual([
      expect.objectContaining({
        fqcn: 'utopia.network',
        type: 'collection',
        detail: expect.objectContaining({ tags: ['network'] }),
      }),
    ]);
    expect(await store.getArtifact(collections[0].ref)).toMatchObject({
      enumeration: { status: 'complete' },
    });
    expect(
      (await store.listArtifacts('execution-environment'))[0].contentsKnown,
    ).toBe(false);
    expect((await store.listArtifacts('oci-image'))[0].contentsKnown).toBe(
      false,
    );
    await store.refreshRegistry('mock');
    expect(await store.listItems()).toHaveLength(2);
  });
});

describe('drift detection', () => {
  it('ignores digest-derived cosign signature tags while indexing the underlying image', async () => {
    const signatureTags = [
      `sha256-${'a1'.repeat(32)}.sig`,
      `sha256-${'AB'.repeat(32)}.sig`,
    ];
    const registry = new MockRegistry({
      repositories: {
        'ansible/ee': [
          makeLabelledImage('latest', { [EE_LABEL]: 'true' }),
          ...signatureTags.map(tag => makeImage({ tag })),
          makeImage({ tag: 'release.sig' }),
        ],
      },
    });
    const store = await storeOver(registry);
    expect((await store.refreshRegistry('mock')).ok).toBe(true);
    const artifacts = await store.listArtifacts();
    expect(artifacts).toHaveLength(2);
    expect(
      artifacts.find(a => a.type === 'execution-environment')?.tags,
    ).toEqual(['latest']);
    expect(artifacts.find(a => a.type === 'oci-image')?.tags).toEqual([
      'release.sig',
    ]);
    const drift = await store.detectDrift('mock');
    expect(drift.changed).toBe(false);
    for (const tag of signatureTags) {
      expect(registry.countRequests(`/manifests/${tag}`)).toBe(0);
    }
  });

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
    moved.digest = `sha256:${'moved'.padEnd(64, '9')}`;
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

  it('redacts content manifests before persisting them', async () => {
    const referrerDigest = `sha256:${'ref'.padEnd(64, '0')}`;
    const payloadDigest = `sha256:${'pay'.padEnd(64, '0')}`;
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
              plugins: [],
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
  });
});
