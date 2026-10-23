import { defaultContentTypes } from '@ansible/plugin-catalog-backend-module-automation-content';
import {
  MockRegistry,
  RegistryConnection,
  makeImage,
  makeLabelledImage,
} from '@ansible/automation-content-common';
import { ContentIndex } from './ContentIndex';

const silent = { info: () => {}, warn: () => {}, debug: () => {} };

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
