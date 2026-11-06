/**
 * @jest-environment node
 */
import knexFactory from 'knex';
import { defaultContentTypes } from '@ansible/plugin-catalog-backend-module-automation-content';
import {
  MockRegistry,
  RegistryConnection,
  makeImage,
  makeLabelledImage,
} from '@ansible/automation-content-common';
import { ContentStore } from './ContentStore';

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
