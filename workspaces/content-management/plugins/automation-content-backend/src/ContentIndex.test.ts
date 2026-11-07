import { defaultContentTypes } from '@ansible/plugin-catalog-backend-module-automation-content';
import {
  MockRegistry,
  RegistryConnection,
  makeImage,
  makeLabelledImage,
  OCIClient,
} from '@ansible/automation-content-common';
import {
  ContentIndex,
  ArtifactSyncNotFoundError,
  IndexedArtifact,
} from './ContentIndex';

const silent = { info: () => {}, warn: () => {}, debug: () => {} };

describe('listArtifacts ordering', () => {
  it('filters before sorting, keeps missing values last ascending, and never mutates index order', () => {
    const index = new ContentIndex([], silent);
    const artifacts: IndexedArtifact[] = ['z', '', 'a', 'a'].map(
      (registry, i) => ({
        ref: String(i),
        registry,
        repository: 'repo',
        type: 'execution-environment',
        digest: String(i),
        tags: [],
        pullReference: String(i),
        contentsKnown: i !== 0,
        classification: {
          type: 'execution-environment',
          signals: [],
          readsContentManifest: false,
        },
      }),
    );
    (index as unknown as { artifacts: IndexedArtifact[] }).artifacts =
      artifacts;
    const refs = (rows: IndexedArtifact[]): string[] => rows.map(a => a.ref);
    expect(refs(index.listArtifacts(undefined, { sort: 'registry' }))).toEqual([
      '2',
      '3',
      '0',
      '1',
    ]);
    expect(
      refs(
        index.listArtifacts(undefined, {
          sort: 'registry',
          order: 'desc',
          contentsKnown: true,
        }),
      ),
    ).toEqual(['1', '2', '3']);
    jest.spyOn(index, 'reconcileStateForArtifact').mockImplementation(ref =>
      ref === '1'
        ? undefined
        : {
            at: ref === '0' ? '2026-02-01T00:00:00Z' : '2026-01-01T00:00:00Z',
            ok: true,
            artifacts: 1,
          },
    );
    expect(
      refs(index.listArtifacts(undefined, { sort: 'lastReconciledAt' })),
    ).toEqual(['2', '3', '0', '1']);
    expect(
      refs(
        index.listArtifacts(undefined, {
          sort: 'lastReconciledAt',
          order: 'desc',
        }),
      ),
    ).toEqual(['1', '0', '2', '3']);
    expect(
      refs(index.listArtifacts(undefined, { sort: 'sourceType' })),
    ).toEqual(['1', '0', '2', '3']);
    expect(refs(index.listArtifacts())).toEqual(['0', '1', '2', '3']);
  });
});

function connection(): RegistryConnection {
  return {
    name: 'mock',
    url: 'https://mock.registry',
    auth: { type: 'anonymous' },
    repositories: ['ansible/ee'],
  };
}

/**
 * Point the index's client at a mock registry.
 *
 * The index builds its own clients from config, so the fetch implementation is swapped
 * in afterwards. Slightly invasive, but it keeps discovery under test without a live
 * registry — and drift behaviour is exactly the thing that is painful to test against
 * one, because tag propagation is eventually consistent.
 */
function indexOver(registry: MockRegistry): ContentIndex {
  const index = new ContentIndex([connection()], silent, defaultContentTypes());
  const clients = (
    index as unknown as { clients: Map<string, { fetchImpl: unknown }> }
  ).clients;
  const client = clients.get('mock')!;
  (client as unknown as { fetchImpl: unknown }).fetchImpl = registry.fetch;
  return index;
}

const EE_LABEL = 'ansible-execution-environment';

describe('strict latest-only artifact sync', () => {
  async function fixture(oldTags = ['latest', 'v1']) {
    const old = makeLabelledImage(oldTags[0], { [EE_LABEL]: 'true' });
    const sibling = makeLabelledImage('stable', { [EE_LABEL]: 'true' });
    sibling.digest = `sha256:${'b'.repeat(64)}`;
    const repositories = {
      'ansible/ee': [...oldTags.map(tag => ({ ...old, tag })), sibling],
      'other/repo': [makeImage({ tag: 'untouched' })],
    };
    const registry = new MockRegistry({ repositories });
    const index = indexOver(registry);
    await index.refreshRegistry('mock');
    const original = index.listArtifacts().find(a => a.digest === old.digest)!;
    const other = index.listArtifacts().find(a => a.digest === sibling.digest)!;
    other.manifest = {
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
    const siblingState = index.reconcileStateForArtifact(other.ref);
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
    expect(index.getArtifact(original.ref)?.tags).toEqual(['v1']);
    expect(index.getArtifact(other.ref)).toBe(other);
    expect(index.listCollections()[0].providedBy).toEqual([other.ref]);
    expect(index.reconcileStateFor('mock')).toBe(before);
    expect(index.reconcileStateForArtifact(other.ref)).toBe(siblingState);
    expect(index.reconcileStateForArtifact(original.ref)).toBe(before);
    expect(index.reconcileStateForArtifact(result.ref)?.ok).toBe(true);
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
    expect(index.getArtifact(result.ref)).toBeUndefined();
    expect(index.reconcileStateForArtifact(result.ref)).toBeUndefined();
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
    expect(index.getArtifact(other.ref)?.tags).toEqual(['stable', 'latest']);
    expect(index.getArtifact(original.ref)).toBeUndefined();
  });

  it('never falls back to the clicked digest when latest is absent', async () => {
    const { index, registry, original, repositories } = await fixture(['v1']);
    const before = index.listArtifacts();
    await expect(index.syncArtifact(original.ref)).rejects.toMatchObject({
      code: 'LATEST_TAG_NOT_FOUND',
    });
    expect(index.listArtifacts()).toBe(before);
    expect(registry.requests.map(r => r.path)).toEqual([
      '/v2/ansible/ee/manifests/latest',
    ]);
    expect(repositories['ansible/ee']).toHaveLength(2);
  });

  it.each([429, 500, 503])(
    'retains the entire previous index on latest HTTP %s',
    async status => {
      const { index, original, client } = await fixture();
      const before = index.listArtifacts();
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
      expect(index.listArtifacts()).toBe(before);
      expect(index.reconcileStateForArtifact(original.ref)?.ok).toBe(false);
    },
  );

  it('retains old rows on transport failure or a failed latest config read', async () => {
    const { index, original, client } = await fixture();
    const before = index.listArtifacts();
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
    expect(index.listArtifacts()).toBe(before);
  });

  it('retains old rows for malformed latest manifests', async () => {
    const { index, original, client } = await fixture();
    const before = index.listArtifacts();
    const latest = await client.getManifest('ansible/ee', 'latest');
    jest
      .spyOn(client, 'getManifest')
      .mockResolvedValue({ ...latest, manifest: {} as never });
    await expect(index.syncArtifact(original.ref)).resolves.toMatchObject({
      status: 'failed',
      retainedPrevious: true,
    });
    expect(index.listArtifacts()).toBe(before);
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
    expect(index.reconcileStateForArtifact(original.ref)).toBe(
      index.reconcileStateFor('mock'),
    );
  });

  it('keeps same-digest known inventory when optional metadata is unavailable', async () => {
    const { index, original, other, client } = await fixture();
    original.manifest = other.manifest;
    original.contentsKnown = true;
    jest
      .spyOn(client, 'getReferrers')
      .mockRejectedValue(new Error('Optional metadata unavailable'));
    const result = await index.syncArtifact(original.ref);
    expect(result.status).toBe('completed');
    expect(index.getArtifact(result.ref)?.manifest).toBe(original.manifest);
    expect(index.getArtifact(result.ref)?.contentsKnown).toBe(true);
  });

  it('does not copy old inventory to a newly resolved digest with optional metadata missing', async () => {
    const { index, original, other, client, repositories } = await fixture();
    original.manifest = other.manifest;
    original.contentsKnown = true;
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
    expect(index.getArtifact(result.ref)?.manifest).toBeUndefined();
    expect(index.getArtifact(result.ref)?.contentsKnown).toBe(false);
  });

  it.each([null, 'invalid', [], { config: 'invalid' }])(
    'retains old data for malformed core config %p',
    async config => {
      const { index, original, client } = await fixture();
      const before = index.listArtifacts();
      jest.spyOn(client, 'getConfigBlob').mockResolvedValue(config as never);
      await expect(index.syncArtifact(original.ref)).resolves.toMatchObject({
        status: 'failed',
        retainedPrevious: true,
      });
      expect(index.listArtifacts()).toBe(before);
    },
  );
});

describe('drift detection', () => {
  it('reports no change when the registry matches the index', async () => {
    const registry = new MockRegistry({
      repositories: {
        'ansible/ee': [makeLabelledImage('v1', { [EE_LABEL]: 'true' })],
      },
    });
    const index = indexOver(registry);
    await index.refreshRegistry('mock');

    const drift = await index.detectDrift('mock');

    expect(drift.changed).toBe(false);
    expect(drift.details).toEqual([]);
  });

  it('detects a newly added tag', async () => {
    const v1 = makeLabelledImage('v1', { [EE_LABEL]: 'true' });
    const repositories = { 'ansible/ee': [v1] };
    const registry = new MockRegistry({ repositories });
    const index = indexOver(registry);
    await index.refreshRegistry('mock');

    repositories['ansible/ee'].push(
      makeLabelledImage('v2', { [EE_LABEL]: 'true' }),
    );
    const drift = await index.detectDrift('mock');

    expect(drift.changed).toBe(true);
    expect(drift.details.join()).toContain('ansible/ee:v2 added');
  });

  it('detects a tag moved to different content', async () => {
    const v1 = makeLabelledImage('v1', { [EE_LABEL]: 'true' });
    const repositories = { 'ansible/ee': [v1] };
    const registry = new MockRegistry({ repositories });
    const index = indexOver(registry);
    await index.refreshRegistry('mock');

    // Same tag, different digest — the case that makes tag-keyed caching unsafe.
    const moved = makeLabelledImage('v1', { [EE_LABEL]: 'true' });
    moved.digest = `sha256:${'moved'.padEnd(64, '9')}`;
    repositories['ansible/ee'] = [moved];

    const drift = await index.detectDrift('mock');

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
    const index = indexOver(registry);
    await index.refreshRegistry('mock');

    repositories['ansible/ee'] = [repositories['ansible/ee'][0]];
    const drift = await index.detectDrift('mock');

    expect(drift.changed).toBe(true);
    expect(drift.details.join()).toContain('ansible/ee:v2 removed');
  });

  it('ignores referrer fallback tags, which are artifacts about images', async () => {
    const image = makeLabelledImage('v1', { [EE_LABEL]: 'true' });
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      referrersMode: 'tag-fallback',
    });
    const index = indexOver(registry);
    await index.refreshRegistry('mock');

    const drift = await index.detectDrift('mock');
    expect(drift.details.join()).not.toContain('sha256-');
  });

  it('treats a failed check as "no change", not as everything being removed', async () => {
    const registry = new MockRegistry({
      repositories: {
        'ansible/ee': [makeLabelledImage('v1', { [EE_LABEL]: 'true' })],
      },
    });
    const index = indexOver(registry);
    await index.refreshRegistry('mock');

    // Break the transport the way an outage would.
    const clients = (index as unknown as { clients: Map<string, unknown> })
      .clients;
    (clients.get('mock') as { fetchImpl: unknown }).fetchImpl = () =>
      Promise.reject(new Error('connection refused'));

    const drift = await index.detectDrift('mock');

    expect(drift.changed).toBe(false);
    expect(drift.details.join()).toMatch(/check failed/);
  });

  it('refreshes only when drift is found', async () => {
    const repositories = {
      'ansible/ee': [makeLabelledImage('v1', { [EE_LABEL]: 'true' })],
    };
    const registry = new MockRegistry({ repositories });
    const index = indexOver(registry);
    await index.refreshRegistry('mock');

    const quiet = await index.pollRegistry('mock');
    expect(quiet.refreshed).toBe(false);

    repositories['ansible/ee'].push(makeImage({ tag: 'v2' }));
    const noisy = await index.pollRegistry('mock');

    expect(noisy.changed).toBe(true);
    expect(noisy.refreshed).toBe(true);
    // The new image carries no EE label, so it is catalogued as a plain image.
    expect(index.listArtifacts('oci-image')).toHaveLength(1);
  });
});

describe('digest cache', () => {
  it('avoids re-reading unchanged content on a second refresh', async () => {
    const registry = new MockRegistry({
      repositories: {
        'ansible/ee': [makeLabelledImage('v1', { [EE_LABEL]: 'true' })],
      },
    });
    const index = indexOver(registry);

    await index.refreshRegistry('mock');
    const afterFirst = index.cacheStats.misses;

    registry.reset();
    await index.refreshRegistry('mock');

    expect(index.cacheStats.hits).toBeGreaterThan(0);
    // No new misses: everything digest-addressed was already cached.
    expect(index.cacheStats.misses).toBe(afterFirst);
    expect(registry.countRequests('/blobs/')).toBe(0);
  });
});

describe('error cause traversal is bounded', () => {
  /**
   * A cause chain is untrusted input: a registry's transport can produce — or
   * a hostile one can deliberately produce — a cycle or an arbitrarily deep
   * chain. These tests drive reconciliation with such failures, so they prove
   * the walk terminates as well as what it reports.
   */
  function indexFailingWith(error: unknown): ContentIndex {
    const index = new ContentIndex(
      [connection()],
      silent,
      defaultContentTypes(),
    );
    const clients = (
      index as unknown as { clients: Map<string, { fetchImpl: unknown }> }
    ).clients;
    (clients.get('mock') as unknown as { fetchImpl: unknown }).fetchImpl = () =>
      Promise.reject(error);
    return index;
  }

  it('unwraps a wrapped chain to the real message', async () => {
    const wrapped: Error & { cause?: unknown } = new Error('fetch failed');
    wrapped.cause = new Error('unable to get local issuer certificate');

    const outcome = await indexFailingWith(wrapped).refreshRegistry('mock');

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('fetch failed');
    expect(outcome.error).toContain('unable to get local issuer certificate');
    expect(outcome.error).not.toContain('truncated');
  });

  it('terminates on a self-referencing cause', async () => {
    const cyclic: Error & { cause?: unknown } = new Error('loop');
    cyclic.cause = cyclic;

    const outcome = await indexFailingWith(cyclic).refreshRegistry('mock');

    expect(outcome.error).toContain('loop');
    expect(outcome.error).toContain('truncated');
  });

  it('terminates on a two-object cause cycle', async () => {
    const alpha: Error & { cause?: unknown } = new Error('alpha');
    const beta: Error & { cause?: unknown } = new Error('beta');
    alpha.cause = beta;
    beta.cause = alpha;

    const outcome = await indexFailingWith(alpha).refreshRegistry('mock');

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

    const outcome = await indexFailingWith(head).refreshRegistry('mock');

    expect(outcome.error).toContain('depth-0');
    expect(outcome.error).toContain('truncated');
    expect(outcome.error).not.toContain('depth-49');
  });

  it('describes a non-Error rejection value', async () => {
    const failing = indexFailingWith('gateway gone');
    const outcome = await failing.refreshRegistry('mock');

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
      const outcome = await indexFailingWith(error).refreshRegistry('mock');
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toBe(`capability probe failed: ${message}`);
      expect(outcome.error).not.toContain('[object Object]');
    },
  );

  it('reports the cause chain when a drift check fails', async () => {
    const wrapped: Error & { cause?: unknown } = new Error('fetch failed');
    wrapped.cause = new Error('unable to get local issuer certificate');
    const index = indexFailingWith(wrapped);

    const drift = await index.detectDrift('mock');

    expect(drift.changed).toBe(false);
    expect(drift.details).toEqual([
      'check failed: fetch failed: unable to get local issuer certificate',
    ]);
    expect(index.driftStateFor('mock')).toEqual(drift);
  });

  it('describes non-Error drift-check failures', async () => {
    const index = indexFailingWith('gateway gone');

    const drift = await index.detectDrift('mock');

    expect(drift.changed).toBe(false);
    expect(drift.details).toEqual(['check failed: gateway gone']);
  });

  it('bounds cyclic drift-check failures', async () => {
    const cyclic: Error & { cause?: unknown } = new Error('loop');
    cyclic.cause = cyclic;
    const index = indexFailingWith(cyclic);

    const drift = await index.detectDrift('mock');

    expect(drift.changed).toBe(false);
    expect(drift.details).toEqual([
      'check failed: loop: (cause chain truncated)',
    ]);
  });
});
