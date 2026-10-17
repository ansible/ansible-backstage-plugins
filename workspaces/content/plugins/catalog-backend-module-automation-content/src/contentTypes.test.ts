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
  ContentTypeRegistry,
  MetadataBundle,
  ResolvedArtifact,
  UNKNOWN_IMAGE_TYPE,
  makeImage,
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
import { OCIRegistryEntityProvider } from './OCIRegistryEntityProvider';
import { defaultContentTypes } from './contentTypes';

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

async function discover(contentTypes: ContentTypeRegistry): Promise<Entity[]> {
  const registry = registryWithEverything();
  const emitted: Entity[] = [];

  const provider = new OCIRegistryEntityProvider({
    connection: {
      name: 'mock',
      url: 'https://mock.registry',
      auth: { type: 'anonymous' },
      repositories: [
        'demo/network-ee',
        'demo/redis',
        'demo/bom',
        'demo/mystery',
      ],
    },
    contentTypes,
    fetch: registry.fetch,
    logger: {
      info() {},
      warn() {},
      debug() {},
      error() {},
      child: () => undefined,
    } as any,
  });

  await provider.connect({
    applyMutation: async (mutation: any) => {
      emitted.push(...mutation.entities.map((e: any) => e.entity));
    },
    refresh: async () => {},
  } as any);
  await provider.refresh();

  return emitted;
}

const typeOf = (entities: Entity[], repository: string) =>
  entities.find(
    e => e.metadata.annotations?.['ansible.com/repository'] === repository,
  )?.spec?.type;

// ---------------------------------------------------------------------------

describe('a content type is added, not edited in', () => {
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
