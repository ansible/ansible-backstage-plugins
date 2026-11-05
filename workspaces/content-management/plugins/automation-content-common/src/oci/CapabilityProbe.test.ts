import { CapabilityProbe } from './CapabilityProbe';
import { OCIClient } from './OCIClient';
import { RegistryConnection } from './types';
import { MockRegistry, makeImage } from '../testing/MockRegistry';

function client(
  registry: MockRegistry,
  auth: RegistryConnection['auth'] = { type: 'anonymous' },
) {
  return new OCIClient(
    { name: 'mock', url: 'https://mock.registry', auth },
    { fetch: registry.fetch },
  );
}

const images = ['a', 'b', 'c'].map(tag => makeImage({ tag }));

describe('CapabilityProbe', () => {
  it('detects a rich registry: catalog, pagination, native referrers', async () => {
    const withReferrers = {
      ...images[0],
      referrers: [
        {
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          digest: `sha256:${'ref'.padEnd(64, '0')}`,
          size: 1,
          artifactType: 'application/vnd.ansible.content-manifest.v1+json',
        },
      ],
    };
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [withReferrers, images[1], images[2]] },
      catalogEnabled: true,
      paginate: true,
      referrersMode: 'native',
    });

    const capabilities = await new CapabilityProbe(client(registry), {
      sampleRepository: 'ansible/ee',
    }).probe();

    expect(capabilities.catalogEnumeration).toBe(true);
    expect(capabilities.tagPagination).toBe(true);
    expect(capabilities.referrers).toBe('native');
    expect(capabilities.auth).toContain('anonymous');
  });

  it('detects the tag-fallback referrer schema', async () => {
    const withReferrers = {
      ...images[0],
      referrers: [
        {
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          digest: `sha256:${'ref'.padEnd(64, '0')}`,
          size: 1,
        },
      ],
    };
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [withReferrers] },
      referrersMode: 'tag-fallback',
    });

    const capabilities = await new CapabilityProbe(client(registry), {
      sampleRepository: 'ansible/ee',
    }).probe();

    expect(capabilities.referrers).toBe('tag-fallback');
  });

  /**
   * The case the design has to survive: no catalog, no referrers, no pagination, no
   * webhooks, no declared delete. Probing must complete and report honestly rather than
   * erroring or inventing capability.
   */
  it('survives a deliberately crippled registry and degrades honestly', async () => {
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [images[0]] },
      catalogEnabled: false,
      paginate: false,
      referrersMode: 'none',
    });

    const capabilities = await new CapabilityProbe(client(registry), {
      sampleRepository: 'ansible/ee',
    }).probe();

    expect(capabilities.catalogEnumeration).toBe(false);
    expect(capabilities.referrers).toBe('none');
    expect(capabilities.tagPagination).toBe(false);
    expect(capabilities.delete).toBe('unknown');
    expect(capabilities.notifications).toBe('poll-only');

    // Degradation must be explained, not silent.
    expect(capabilities.notes.join(' ')).toMatch(/referrers/i);
    expect(capabilities.notes.join(' ')).toMatch(/destructive/i);
  });

  it('reports a bearer challenge as the auth scheme', async () => {
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [images[0]] },
      auth: 'bearer-challenge',
    });

    const capabilities = await new CapabilityProbe(client(registry), {
      sampleRepository: 'ansible/ee',
    }).probe();

    expect(capabilities.auth).toContain('bearer');
  });

  it('never probes delete, because probing it would be destructive', async () => {
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [images[0]] },
    });
    registry.reset();

    await new CapabilityProbe(client(registry), {
      sampleRepository: 'ansible/ee',
    }).probe();

    expect(registry.requests.some(r => r.method === 'DELETE')).toBe(false);
  });

  it('honours a declared delete capability from configuration', async () => {
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [images[0]] },
    });

    const capabilities = await new CapabilityProbe(client(registry), {
      sampleRepository: 'ansible/ee',
      declaredDelete: 'manifest',
      declaredNotifications: 'webhook',
    }).probe();

    expect(capabilities.delete).toBe('manifest');
    expect(capabilities.notifications).toBe('webhook');
  });

  it('stays at the pessimistic floor when no sample repository is given', async () => {
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [images[0]] },
      referrersMode: 'native',
      paginate: true,
    });

    const capabilities = await new CapabilityProbe(client(registry)).probe();

    expect(capabilities.referrers).toBe('none');
    expect(capabilities.tagPagination).toBe(false);
    expect(capabilities.notes.join(' ')).toMatch(/No sample repository/i);
  });
});
