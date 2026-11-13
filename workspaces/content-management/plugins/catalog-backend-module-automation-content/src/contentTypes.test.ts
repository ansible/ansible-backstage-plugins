/**
 * Adding a content type must require no change to the framework.
 *
 * This is the only test of the extensibility claim the whole design rests on.
 * Everything else could pass against a stack that is closed in practice.
 *
 * It is constructed so that it cannot be satisfied by a change made elsewhere: the
 * second content type is defined *inside this file*, in about thirty lines, and then
 * followed all the way to a catalog entity. If discovery, classification, enumeration
 * or entity emission needed to learn about it, this would not compile — let alone pass.
 */
import {
  Classification,
  EE_REPOSITORY_ENTITY_TYPE,
  eeRepositoryEntityName,
  ContentTypeRegistry,
  MetadataBundle,
  ResolvedArtifact,
  UNKNOWN_IMAGE_TYPE,
  makeImage,
  type ImageManifest,
  makeLabelledImage,
  MockRegistry,
} from '@ansible/automation-content-common';
import type { ContentObject, Enumeration } from '@ansible/content-model';
import { unknownEnumeration } from '@ansible/content-model';
import type {
  ContentTypeAdapter,
  UpdatePolicy,
} from '@ansible/automation-content-common';
import { EXECUTION_ENVIRONMENT_TYPE } from '@ansible/content-type-execution-environment';
import { Entity } from '@backstage/catalog-model';
import type { EntityProviderMutation } from '@backstage/plugin-catalog-node';
import type { FetchLike } from '@ansible/automation-content-common';
import { OCIRegistryEntityProvider } from './OCIRegistryEntityProvider';
import { defaultContentTypes } from './contentTypes';
import { readRegistryConfigs } from './config';
import { ConfigReader } from '@backstage/config';

// ---------------------------------------------------------------------------
// A third content type, invented here and nowhere else
// ---------------------------------------------------------------------------

const SBOM_TYPE = 'sbom';
const SBOM_CONFIG_MEDIA_TYPE = 'application/vnd.cyclonedx+json';

const digestCompare: UpdatePolicy = {
  kind: 'digest-compare',
  shouldUpdate: (previous, current) =>
    previous?.identity.digest !== current.digest,
};

class SbomAdapter implements ContentTypeAdapter {
  readonly type = SBOM_TYPE;
  readonly schema = { $id: 'https://cyclonedx.org/schema', version: '1.6' };
  readonly mediaTypes = [SBOM_CONFIG_MEDIA_TYPE];
  readonly updatePolicy = digestCompare;

  identify(_ref: ResolvedArtifact, meta: MetadataBundle): Classification {
    const configType = (meta.manifest as { config?: { mediaType?: string } })
      .config?.mediaType;
    return configType === SBOM_CONFIG_MEDIA_TYPE
      ? { confidence: 'certain', signals: ['config mediaType is CycloneDX'] }
      : { confidence: 'no', signals: ['config mediaType is not CycloneDX'] };
  }

  async normalize(ref: ResolvedArtifact): Promise<ContentObject> {
    return {
      identity: {
        type: this.type,
        namespace: '',
        name: ref.repository,
        digest: ref.digest,
      },
      version: { value: ref.digest, scheme: 'oci-tag' },
      source: {
        uri: ref.repository,
        backendId: 'oci',
        discoveredAt: '2026-01-01T00:00:00Z',
      },
      lifecycle: { state: 'discovered', visibility: 'internal' },
      trust: {
        certificationTier: 'community',
        provenance: { steps: [], complete: false },
        signing: { signed: false, verified: false },
        supportBoundary: { supported: false },
      },
      relationships: [],
      enumeration: unknownEnumeration('1.6'),
    };
  }

  async enumerate(): Promise<Enumeration> {
    return unknownEnumeration('1.6', 'SBOM contents are not enumerated');
  }
}

// ---------------------------------------------------------------------------
// Fixtures: one artifact of each type, plus one nobody claims
// ---------------------------------------------------------------------------

function withConfigMediaType(tag: string, mediaType: string) {
  const image = makeImage({ tag });
  return {
    ...image,
    manifest: {
      ...image.manifest,
      config: { ...(image.manifest as any).config, mediaType },
    },
  };
}

function registryWithEverything(): MockRegistry {
  return new MockRegistry({
    catalogEnabled: true,
    referrersMode: 'none',
    repositories: {
      'demo/network-ee': [
        makeLabelledImage('poc', { 'ansible-execution-environment': 'true' }),
      ],
      'demo/bom': [withConfigMediaType('v1', SBOM_CONFIG_MEDIA_TYPE)],
      'demo/mystery': [makeImage({ tag: 'latest' })],
    },
  });
}

async function setupProvider(
  contentTypes: ContentTypeRegistry,
  fetch: FetchLike,
  repositories: string[] = ['demo/network-ee', 'demo/bom', 'demo/mystery'],
  repositoryTags?: ReadonlyMap<string, readonly string[]>,
) {
  const mutations: EntityProviderMutation[] = [];
  const provider = new OCIRegistryEntityProvider({
    connection: {
      name: 'mock',
      url: 'https://mock.registry',
      auth: { type: 'anonymous' },
      repositories,
    },
    contentTypes,
    repositoryTags,
    fetch,
    logger: {
      info() {},
      warn() {},
      debug() {},
      error() {},
      child() {
        return this;
      },
    },
  });

  await provider.connect({
    applyMutation: async mutation => {
      mutations.push(mutation);
    },
    refresh: async () => {},
  });
  return { provider, mutations };
}

async function discover(contentTypes: ContentTypeRegistry): Promise<Entity[]> {
  const registry = registryWithEverything();
  const { provider, mutations } = await setupProvider(
    contentTypes,
    registry.fetch,
  );
  await provider.refresh();
  const mutation = mutations[0];
  return mutation?.type === 'full'
    ? mutation.entities.map(({ entity }) => entity)
    : [];
}

const typeOf = (entities: Entity[], repository: string) =>
  entities.find(
    e => e.metadata.annotations?.['ansible.com/repository'] === repository,
  )?.spec?.type;

// ---------------------------------------------------------------------------

describe('a content type is added, not edited in', () => {
  it('adds a stable repository component alongside the existing digest entity', async () => {
    const entities = await discover(defaultContentTypes());
    const repositories = entities.filter(
      e => e.spec?.type === EE_REPOSITORY_ENTITY_TYPE,
    );
    expect(repositories.map(e => e.metadata.name)).toEqual([
      eeRepositoryEntityName('mock', 'demo/network-ee'),
    ]);
    expect(repositories[0].metadata.annotations).toMatchObject({
      'ansible.com/ee-repository': 'true',
      'ansible.com/repository': 'demo/network-ee',
    });
    expect(
      entities.some(e => e.spec?.type === EXECUTION_ENVIRONMENT_TYPE),
    ).toBe(true);
  });

  it('retains published entities after an incomplete scan and removes them after a complete empty result', async () => {
    const registry = registryWithEverything();
    let outcome: 'normal' | 'incomplete' | 'empty' = 'normal';
    const { provider, mutations } = await setupProvider(
      defaultContentTypes(),
      async (input, init) => {
        const path = new URL(String(input)).pathname;
        if (
          outcome === 'incomplete' &&
          init?.method === 'HEAD' &&
          path.endsWith('/manifests/poc')
        ) {
          return new Response(null, { status: 200 });
        }
        if (outcome === 'empty' && path.endsWith('/tags/list')) {
          return new Response(
            JSON.stringify({ name: path.slice(4, -10), tags: [] }),
          );
        }
        return registry.fetch(input, init);
      },
    );
    await provider.refresh();
    expect(mutations).toHaveLength(1);
    outcome = 'incomplete';
    await provider.refresh();
    expect(mutations).toHaveLength(1);
    outcome = 'empty';
    await provider.refresh();
    expect(mutations[1]).toEqual({ type: 'full', entities: [] });
  });

  it('never publishes an empty catalog because the initial catalog probe failed', async () => {
    const registry = registryWithEverything();
    let available = false;
    const { provider, mutations } = await setupProvider(
      defaultContentTypes(),
      async (input, init) => {
        if (!available && new URL(input).pathname === '/v2/_catalog') {
          return new Response(null, { status: 503 });
        }
        return registry.fetch(input, init);
      },
      [],
    );

    await expect(provider.refresh()).rejects.toThrow('catalog listing failed');
    expect(mutations).toHaveLength(0);
    available = true;
    await provider.refresh();
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({
      type: 'full',
      entities: expect.arrayContaining([
        expect.objectContaining({
          entity: expect.objectContaining({
            spec: expect.objectContaining({ type: EE_REPOSITORY_ENTITY_TYPE }),
          }),
        }),
      ]),
    });
  });

  it.each(['manifest', 'config', 'digest'] as const)(
    'retains catalog entities when classification receives an invalid %s',
    async invalid => {
      const registry = registryWithEverything();
      let sabotage = false;
      const { provider, mutations } = await setupProvider(
        defaultContentTypes(),
        async (input, init) => {
          const path = new URL(input).pathname;
          if (sabotage && path.startsWith('/v2/demo/network-ee/')) {
            if (invalid === 'config' && path.includes('/blobs/')) {
              return new Response(JSON.stringify({ config: { Labels: [] } }));
            }
            if (
              path.includes('/manifests/sha256:') &&
              init?.method !== 'HEAD'
            ) {
              if (invalid === 'manifest') {
                return new Response(
                  JSON.stringify({ schemaVersion: 2, layers: [] }),
                );
              }
              if (invalid === 'digest') {
                const original = await registry.fetch(input, init);
                const headers = new Headers(original.headers);
                headers.set(
                  'docker-content-digest',
                  `sha256:${'f'.repeat(64)}`,
                );
                return new Response(await original.text(), { headers });
              }
            }
          }
          return registry.fetch(input, init);
        },
      );
      await provider.refresh();
      expect(mutations).toHaveLength(1);

      sabotage = true;
      const result = await provider.refresh();
      expect(result.errors).toHaveLength(1);
      expect(mutations).toHaveLength(1);
    },
  );

  it('publishes valid descriptive tags accepted by the config parser', async () => {
    const tags = ['network-team', 'a'.repeat(63)];
    const [{ repositoryTags }] = readRegistryConfigs(
      new ConfigReader({
        catalog: {
          providers: {
            automationContent: {
              registries: [
                {
                  name: 'mock',
                  url: 'https://mock.registry',
                  repositoryTags: [{ repository: 'demo/network-ee', tags }],
                },
              ],
            },
          },
        },
      }),
    );
    const registry = registryWithEverything();
    const { provider, mutations } = await setupProvider(
      defaultContentTypes(),
      registry.fetch,
      ['demo/network-ee'],
      repositoryTags,
    );
    await provider.refresh();
    expect(mutations[0]).toMatchObject({
      type: 'full',
      entities: expect.arrayContaining([
        expect.objectContaining({
          entity: expect.objectContaining({
            spec: expect.objectContaining({ type: EE_REPOSITORY_ENTITY_TYPE }),
            metadata: expect.objectContaining({
              tags: expect.arrayContaining(tags),
            }),
          }),
        }),
      ]),
    });
  });

  it('publishes an EE alongside an opaque artifact without inspecting attachment tags', async () => {
    const ee = makeLabelledImage('release.sig', {
      'ansible-execution-environment': 'true',
    });
    const baseTag = ee.digest.replace(':', '-');
    const custom = withConfigMediaType('custom', SBOM_CONFIG_MEDIA_TYPE);
    const configDigest = (custom.manifest as ImageManifest).config.digest;
    const registry = new MockRegistry({
      repositories: {
        'demo/network-ee': [
          ee,
          {
            ...custom,
            config: undefined,
            referrerPayloads: { [configDigest]: { config: 'opaque' } },
          },
          ...['', '.sig', '.att', '.sbom'].map(suffix =>
            makeImage({ tag: `${baseTag}${suffix}`, digest: 'invalid' }),
          ),
        ],
      },
    });
    const { provider, mutations } = await setupProvider(
      defaultContentTypes().register(new SbomAdapter()),
      registry.fetch,
      ['demo/network-ee'],
    );
    await expect(provider.refresh()).resolves.toMatchObject({ errors: [] });
    expect(mutations[0]).toMatchObject({
      type: 'full',
      entities: expect.arrayContaining([
        expect.objectContaining({
          entity: expect.objectContaining({
            spec: expect.objectContaining({ type: EE_REPOSITORY_ENTITY_TYPE }),
          }),
        }),
      ]),
    });
    expect(
      registry.requests.some(
        request =>
          request.method === 'HEAD' &&
          request.path.includes(`/manifests/${baseTag}`),
      ),
    ).toBe(false);
  });

  it('recognises the shipped content type', async () => {
    const entities = await discover(defaultContentTypes());
    expect(typeOf(entities, 'demo/network-ee')).toBe(
      EXECUTION_ENVIRONMENT_TYPE,
    );
  });

  it('carries a content type defined entirely outside the framework', async () => {
    // The only difference from the previous test: one more register() call.
    const entities = await discover(
      defaultContentTypes().register(new SbomAdapter()),
    );

    expect(typeOf(entities, 'demo/bom')).toBe(SBOM_TYPE);
    // And the type that was already there is unaffected.
    expect(typeOf(entities, 'demo/network-ee')).toBe(
      EXECUTION_ENVIRONMENT_TYPE,
    );
  });

  it('reports an unclaimed artifact honestly, with every adapter’s reason', async () => {
    const entities = await discover(
      defaultContentTypes().register(new SbomAdapter()),
    );
    const mystery = entities.find(
      e =>
        e.metadata.annotations?.['ansible.com/repository'] === 'demo/mystery',
    );

    // Not dropped: an artifact nobody understands and no artifact are different facts,
    // and hiding the first makes a registry look emptier than it is.
    expect(mystery?.spec?.type).toBe(UNKNOWN_IMAGE_TYPE);

    const why =
      mystery?.metadata.annotations?.['ansible.com/classification'] ?? '';
    expect(why).toContain(EXECUTION_ENVIRONMENT_TYPE);
    expect(why).toContain(SBOM_TYPE);
  });

  it('gives an unenumerated type an unknown enumeration, not an empty one', async () => {
    // A type that does not enumerate must say so. An empty enumeration would assert
    // that the artifact contains nothing, which is a different and false claim.
    const entities = await discover(
      defaultContentTypes().register(new SbomAdapter()),
    );
    const sbom = entities.find(
      e => e.metadata.annotations?.['ansible.com/repository'] === 'demo/bom',
    );

    expect(sbom?.metadata.annotations?.['ansible.com/enumeration-source']).toBe(
      'unknown',
    );
    expect(sbom?.metadata.tags).toContain('contents-unknown');
  });
});
