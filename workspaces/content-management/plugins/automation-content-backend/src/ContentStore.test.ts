/**
 * @jest-environment node
 */
import knexFactory from 'knex';
import { defaultContentTypes } from '@ansible/plugin-catalog-backend-module-automation-content';
import { CONTENT_MANIFEST_ARTIFACT_TYPE } from '@ansible/content-model';
import {
  MockRegistry,
  OCIClient,
  MediaTypes,
  RegistryConnection,
  fakeRegistryCredentials,
  makeImage,
  makeLabelledImage,
} from '@ansible/automation-content-common';
import { ContentStore, ArtifactSyncNotFoundError } from './ContentStore';

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

describe('strict latest-only artifact sync', () => {
  async function fixture(
    oldTags = ['latest', 'v1'],
    originalInventory = false,
  ) {
    const inventory = {
      schemaVersion: '1.0.0',
      generatedAt: '2026-01-01',
      generatedBy: { tool: 'test', version: '1' },
      complete: true,
      collections: [
        {
          namespace: 'ns',
          name: 'shared',
          version: '1',
          plugins: [],
          roles: [],
          playbooks: [],
          edaPlugins: [],
          rulebooks: [],
        },
      ],
    };
    const withInventory = (image: ReturnType<typeof makeLabelledImage>) => ({
      ...image,
      referrers: [
        {
          mediaType: MediaTypes.ociManifest,
          digest: `sha256:${'f'.repeat(64)}`,
          size: 200,
          artifactType: CONTENT_MANIFEST_ARTIFACT_TYPE,
        },
      ],
      referrerPayloads: { [`sha256:${'a'.repeat(64)}`]: inventory },
    });
    const base = makeLabelledImage(oldTags[0], { [EE_LABEL]: 'true' });
    const old = originalInventory ? withInventory(base) : base;
    const sibling = withInventory(
      makeLabelledImage('stable', { [EE_LABEL]: 'true' }),
    );
    sibling.digest = `sha256:${'b'.repeat(64)}`;
    const repositories = {
      'ansible/ee': [...oldTags.map(tag => ({ ...old, tag })), sibling],
      'other/repo': [makeImage({ tag: 'untouched' })],
    };
    const registry = new MockRegistry({
      repositories,
      referrersMode: 'native',
    });
    const index = await storeOver(registry);
    await index.refreshRegistry('mock');
    const original = (await index.listArtifacts()).find(
      a => a.digest === old.digest,
    )!;
    const other = (await index.listArtifacts()).find(
      a => a.digest === sibling.digest,
    )!;
    const client = (
      index as unknown as { clients: Map<string, OCIClient> }
    ).clients.get('mock')!;
    registry.requests.length = 0;
    return { index, registry, repositories, old, original, other, client };
  }

  it('freshly resolves moved latest only, preserving sibling aliases, data, providers and freshness', async () => {
    const { index, registry, repositories, old, original, other } =
      await fixture();
    const before = index.reconcileStateFor('mock');
    const siblingState = index.reconcileStateForArtifact(
      await index.getArtifact(other.ref),
    );
    const next = makeLabelledImage('latest', { [EE_LABEL]: 'true' });
    next.digest = `sha256:${'c'.repeat(64)}`;
    repositories['ansible/ee'] = [
      { ...old, tag: 'v1' },
      repositories['ansible/ee'][2],
      next,
    ];
    const refresh = jest.spyOn(index, 'refreshRegistry');
    const result = await index.syncArtifact(original.ref);
    expect(result).toMatchObject({
      status: 'completed',
      ref: `mock/ansible/ee@${next.digest}`,
      tag: 'latest',
      retainedPrevious: false,
    });
    expect((await index.getArtifact(original.ref))?.tags).toEqual(['v1']);
    // DB round-trips preserve fields, not object identity.
    expect(await index.getArtifact(other.ref)).toEqual(other);
    expect((await index.listCollections())[0].providedBy).toEqual([other.ref]);
    expect(index.reconcileStateFor('mock')).toBe(before);
    expect(
      index.reconcileStateForArtifact(await index.getArtifact(other.ref)),
    ).toBe(siblingState);
    expect(
      index.reconcileStateForArtifact(await index.getArtifact(original.ref)),
    ).toBe(before);
    expect(
      index.reconcileStateForArtifact(await index.getArtifact(result.ref))?.ok,
    ).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    const paths = registry.requests.map(r => r.path);
    expect(paths).toContain('/v2/ansible/ee/manifests/latest');
    expect(paths.every(path => path.startsWith('/v2/ansible/ee/'))).toBe(true);
    expect(paths.join(' ')).not.toMatch(
      /tags\/list|_catalog|manifests\/v1|manifests\/stable/,
    );
    expect(
      paths
        .filter(path => path.includes('/referrers/'))
        .every(path => path === `/v2/ansible/ee/referrers/${next.digest}`),
    ).toBe(true);
    // Mutable latest must be read again despite cached immutable manifests.
    const moved = { ...next, digest: `sha256:${'d'.repeat(64)}` };
    repositories['ansible/ee'] = [{ ...old, tag: 'v1' }, moved];
    const second = await index.syncArtifact(result.ref);
    expect(second.ref).toBe(`mock/ansible/ee@${moved.digest}`);
    expect(await index.getArtifact(result.ref)).toBeUndefined();
    expect(
      index.reconcileStateForArtifact(await index.getArtifact(result.ref)),
    ).toBeUndefined();
    expect(
      (
        index as unknown as { artifactReconcile: Map<string, unknown> }
      ).artifactReconcile.has(result.ref),
    ).toBe(false);
    expect(
      registry.requests.filter(r => r.path.endsWith('/manifests/latest')),
    ).toHaveLength(2);
  });

  it('merges latest into an already-indexed digest without dropping its aliases', async () => {
    const { index, repositories, original, other } = await fixture(['latest']);
    repositories['ansible/ee'] = [
      { ...repositories['ansible/ee'][1], tag: 'latest' },
      repositories['ansible/ee'][1],
    ];
    const result = await index.syncArtifact(original.ref);
    expect(result.ref).toBe(other.ref);
    expect((await index.getArtifact(other.ref))?.tags).toEqual([
      'stable',
      'latest',
    ]);
    expect(await index.getArtifact(original.ref)).toBeUndefined();
  });

  it('never falls back to the clicked digest when latest is absent', async () => {
    const { index, registry, original, repositories } = await fixture(['v1']);
    const before = await index.listArtifacts();
    await expect(index.syncArtifact(original.ref)).rejects.toMatchObject({
      code: 'LATEST_TAG_NOT_FOUND',
    });
    // DB reads return fresh objects; compare the persisted snapshot.
    expect(await index.listArtifacts()).toEqual(before);
    expect(registry.requests.map(r => r.path)).toEqual([
      '/v2/ansible/ee/manifests/latest',
    ]);
    expect(repositories['ansible/ee']).toHaveLength(2);
  });

  it.each([429, 500, 503])(
    'retains the entire previous index on latest HTTP %s',
    async status => {
      const { index, original, client } = await fixture();
      const before = await index.listArtifacts();
      jest
        .spyOn(client, 'request')
        .mockResolvedValue(new Response('sensitive-secret', { status }));
      const result = await index.syncArtifact(original.ref);
      expect(result).toMatchObject({
        status: 'failed',
        ref: original.ref,
        retainedPrevious: true,
        error: 'Artifact reconciliation failed.',
      });
      // DB reads return fresh objects; compare the persisted snapshot.
      expect(await index.listArtifacts()).toEqual(before);
      expect(
        index.reconcileStateForArtifact(await index.getArtifact(original.ref))
          ?.ok,
      ).toBe(false);
    },
  );

  it('retains old rows on transport failure or a failed latest config read', async () => {
    const { index, original, client } = await fixture();
    const before = await index.listArtifacts();
    const read = jest
      .spyOn(client, 'getManifest')
      .mockRejectedValueOnce(new Error('TLS sensitive-secret'));
    await expect(index.syncArtifact(original.ref)).resolves.toMatchObject({
      status: 'failed',
      error: 'Artifact reconciliation failed.',
    });
    read.mockRestore();
    jest.spyOn(client, 'getConfigBlob').mockResolvedValue(undefined);
    await expect(index.syncArtifact(original.ref)).resolves.toMatchObject({
      status: 'failed',
      retainedPrevious: true,
    });
    // DB reads return fresh objects; compare the persisted snapshot.
    expect(await index.listArtifacts()).toEqual(before);
  });

  it('retains old rows for malformed latest manifests', async () => {
    const { index, original, client } = await fixture();
    const before = await index.listArtifacts();
    const latest = await client.getManifest('ansible/ee', 'latest');
    jest
      .spyOn(client, 'getManifest')
      .mockResolvedValue({ ...latest, manifest: {} as never });
    await expect(index.syncArtifact(original.ref)).resolves.toMatchObject({
      status: 'failed',
      retainedPrevious: true,
    });
    // DB reads return fresh objects; compare the persisted snapshot.
    expect(await index.listArtifacts()).toEqual(before);
  });

  it('rejects unknown and out-of-config rows without any network access', async () => {
    const { index, original, registry } = await fixture();
    await expect(
      index.syncArtifact('https://attacker.invalid/anything'),
    ).rejects.toBeInstanceOf(ArtifactSyncNotFoundError);
    index.getRegistry('mock')!.connection.repositories = ['different/repo'];
    await expect(index.syncArtifact(original.ref)).rejects.toMatchObject({
      code: 'ARTIFACT_NOT_FOUND',
    });
    expect(registry.requests).toHaveLength(0);
  });

  it('does not override a newer full reconciliation with older artifact freshness', async () => {
    const { index, original } = await fixture();
    await index.syncArtifact(original.ref);
    await index.refreshRegistry('mock');
    expect(
      index.reconcileStateForArtifact(await index.getArtifact(original.ref)),
    ).toBe(index.reconcileStateFor('mock'));
  });

  it('keeps same-digest known inventory when optional metadata is unavailable', async () => {
    const { index, original, client } = await fixture(['latest', 'v1'], true);
    jest
      .spyOn(client, 'getReferrers')
      .mockRejectedValue(new Error('Optional metadata unavailable'));
    const result = await index.syncArtifact(original.ref);
    expect(result.status).toBe('completed');
    expect((await index.getArtifact(result.ref))?.manifest).toEqual(
      original.manifest,
    );
    expect((await index.getArtifact(result.ref))?.contentsKnown).toBe(true);
  });

  it('does not copy old inventory to a newly resolved digest with optional metadata missing', async () => {
    const { index, original, client, repositories } = await fixture(
      ['latest', 'v1'],
      true,
    );
    const moved = {
      ...repositories['ansible/ee'][0],
      digest: `sha256:${'e'.repeat(64)}`,
    };
    repositories['ansible/ee'] = [moved];
    jest
      .spyOn(client, 'getReferrers')
      .mockRejectedValue(new Error('Optional metadata unavailable'));
    const result = await index.syncArtifact(original.ref);
    expect(result.status).toBe('completed');
    expect(result.ref).not.toBe(original.ref);
    expect((await index.getArtifact(result.ref))?.manifest).toBeUndefined();
    expect((await index.getArtifact(result.ref))?.contentsKnown).toBe(false);
  });

  it.each([null, 'invalid', [], { config: 'invalid' }])(
    'retains old data for malformed core config %p',
    async config => {
      const { index, original, client } = await fixture();
      const before = await index.listArtifacts();
      jest.spyOn(client, 'getConfigBlob').mockResolvedValue(config as never);
      await expect(index.syncArtifact(original.ref)).resolves.toMatchObject({
        status: 'failed',
        retainedPrevious: true,
      });
      // DB reads return fresh objects; compare the persisted snapshot.
      expect(await index.listArtifacts()).toEqual(before);
    },
  );
});

describe('inventory search', () => {
  it('searches all indexed fields before counting and pagination, combining filters and treating wildcards literally', async () => {
    const db = await createTestDB();
    try {
      const store = new ContentStore([], db, silent);
      for (let index = 0; index < 12; index++) {
        await db('artifacts').insert({
          ref: `ref-${index}`,
          type: 'execution-environment',
          registry: 'Source',
          repository: index === 11 ? 'special_100%' : `repo-${index}`,
          digest: `sha256:${index}`,
          tags: '["Stable"]',
          pull_reference: `ref-${index}`,
          contents_known: true,
          classification: '{"type":"execution-environment"}',
          manifest:
            '{"collections":[{"namespace":"Ansible","name":"Posix","version":"1.0.0"}]}',
        });
      }
      for (const search of [
        'SOURCE',
        'stable',
        'ANSIBLE.POSIX',
        'execution-environment',
        'sha256:',
      ]) {
        const result = await store.listArtifactsPaginated({
          search,
          limit: 10,
          offset: 10,
        });
        expect(result.totalCount).toBe(12);
        expect(result.items).toHaveLength(2);
      }
      expect(
        (
          await store.listArtifactsPaginated({
            search: 'special_100%',
            limit: 10,
            offset: 0,
          })
        ).totalCount,
      ).toBe(1);
      expect(
        (
          await store.listArtifactsPaginated({
            search: 'stable',
            registry: 'absent',
            limit: 10,
            offset: 0,
          })
        ).totalCount,
      ).toBe(0);
      expect(
        await store.listArtifacts('execution-environment', {
          search: 'special',
        }),
      ).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });
});
