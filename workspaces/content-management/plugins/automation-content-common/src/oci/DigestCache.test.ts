import { MemoryDigestCache, digestKey } from './DigestCache';
import { OCIClient } from './OCIClient';
import { MockRegistry, makeLabelledImage } from '../testing/MockRegistry';
import { ImageManifest, RegistryConnection } from './types';

const connection: RegistryConnection = {
  name: 'mock',
  url: 'https://mock.registry',
  auth: { type: 'anonymous' },
};

describe('MemoryDigestCache', () => {
  it('records hits and misses', () => {
    const cache = new MemoryDigestCache();
    expect(cache.get('a')).toBeUndefined();
    cache.set('a', { x: 1 }, 10);
    expect(cache.get('a')).toEqual({ x: 1 });

    expect(cache.stats.misses).toBe(1);
    expect(cache.stats.hits).toBe(1);
    expect(cache.stats.entries).toBe(1);
    expect(cache.stats.bytes).toBe(10);
  });

  it('evicts oldest entries past the entry ceiling', () => {
    const cache = new MemoryDigestCache({ maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.stats.evictions).toBe(1);
  });

  it('evicts past the byte ceiling and keeps the accounting straight', () => {
    const cache = new MemoryDigestCache({ maxBytes: 100 });
    cache.set('a', 'x', 60);
    cache.set('b', 'y', 60);

    expect(cache.stats.entries).toBe(1);
    expect(cache.stats.bytes).toBe(60);
  });

  it('namespaces keys by registry, so one cache can serve many', () => {
    expect(digestKey('quay', 'demo/ee', 'config', 'sha256:abc')).not.toBe(
      digestKey('ghcr', 'demo/ee', 'config', 'sha256:abc'),
    );
  });
});

describe('OCIClient caching', () => {
  it('serves a repeated config blob from cache, with no second request', async () => {
    const image = makeLabelledImage('latest', { a: 'b' });
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
    });
    const cache = new MemoryDigestCache();
    const client = new OCIClient(connection, { fetch: registry.fetch, cache });

    const artifact = await client.getManifest('ansible/ee', 'latest');
    const config = (artifact.manifest as ImageManifest).config;

    await client.getConfigBlob('ansible/ee', config);
    registry.reset();
    const second = await client.getConfigBlob('ansible/ee', config);

    expect(second?.config?.Labels).toEqual({ a: 'b' });
    expect(registry.countRequests('/blobs/')).toBe(0);
  });

  it('caches a manifest fetched by digest', async () => {
    const image = makeLabelledImage('latest', { a: 'b' });
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
    });
    const cache = new MemoryDigestCache();
    const client = new OCIClient(connection, { fetch: registry.fetch, cache });

    await client.getManifest('ansible/ee', image.digest);
    registry.reset();
    await client.getManifest('ansible/ee', image.digest);

    expect(registry.countRequests('/manifests/')).toBe(0);
  });

  /**
   * The invariant that keeps the cache honest. A tag is a mutable pointer; caching a
   * tag lookup is exactly how a catalog starts reporting content that has moved on.
   */
  it('never caches a manifest fetched by tag', async () => {
    const image = makeLabelledImage('latest', { a: 'b' });
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
    });
    const cache = new MemoryDigestCache();
    const client = new OCIClient(connection, { fetch: registry.fetch, cache });

    await client.getManifest('ansible/ee', 'latest');
    registry.reset();
    await client.getManifest('ansible/ee', 'latest');

    expect(registry.countRequests('/manifests/')).toBe(1);
  });

  it('works with no cache configured', async () => {
    const image = makeLabelledImage('latest', { a: 'b' });
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
    });
    const client = new OCIClient(connection, { fetch: registry.fetch });

    const artifact = await client.getManifest('ansible/ee', image.digest);
    expect(artifact.digest).toBe(image.digest);
  });
});
