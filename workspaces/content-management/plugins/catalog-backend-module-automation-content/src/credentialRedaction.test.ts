/**
 * Credential redaction in the catalog provider path (AAP-96687).
 *
 * The provider is the credential's way into the catalog: registry URLs and
 * pull references become entity annotations, scan failures become the
 * `errors` array and log lines a scheduler reads. These tests drive one
 * registry whose configuration carries a credential in every form it can
 * take, and assert none of it reaches the emitted entities, the returned
 * errors, or the logs.
 */
import {
  FetchLike,
  MediaTypes,
  MockRegistry,
  fakeRegistryCredentials,
  makeLabelledImage,
} from '@ansible/automation-content-common';
import { CONTENT_MANIFEST_ARTIFACT_TYPE } from '@ansible/content-model';
import { Entity } from '@backstage/catalog-model';
import { OCIRegistryEntityProvider } from './OCIRegistryEntityProvider';
import { defaultContentTypes } from './contentTypes';

const EE_LABEL = 'ansible-execution-environment';
const SECRET = fakeRegistryCredentials().password;
const BASIC_WIRE_FORM = Buffer.from(`ci:${SECRET}`, 'utf8').toString('base64');

function connection() {
  return {
    name: 'mock',
    url: `https://ci:${SECRET}@mock.registry`,
    auth: { type: 'basic' as const, username: 'ci', password: SECRET },
    repositories: ['demo/network-ee', 'demo/broken'],
  };
}

describe('credential redaction in the catalog provider', () => {
  it('publishes no credential in entities, errors or logs', async () => {
    const registry = new MockRegistry({
      repositories: {
        'demo/network-ee': [makeLabelledImage('v1', { [EE_LABEL]: 'true' })],
      },
    });
    // One repository fails with an error quoting the credential, but only
    // from the second refresh on: the first must emit entities, so the
    // published forms — links, annotations — can be inspected.
    let breakBrokenRepo = false;
    const failing: FetchLike = async (url, init) => {
      if (breakBrokenRepo && new URL(url).pathname.includes('demo/broken')) {
        throw new Error(`fetch failed: authorization rejected for ${SECRET}`);
      }
      return registry.fetch(url, init);
    };

    const warns: string[] = [];
    const emitted: Entity[] = [];
    const provider = new OCIRegistryEntityProvider({
      connection: connection(),
      contentTypes: defaultContentTypes(),
      fetch: failing,
      logger: {
        info: () => {},
        warn: (m: string) => warns.push(m),
        debug: () => {},
        error: () => {},
        child: () => undefined,
      } as never,
    });
    await provider.connect({
      applyMutation: async (mutation: {
        entities: Array<{ entity: Entity }>;
      }) => {
        emitted.push(...mutation.entities.map(e => e.entity));
      },
      refresh: async () => {},
    } as never);

    await provider.refresh();
    expect(emitted.length).toBeGreaterThan(0);

    breakBrokenRepo = true;
    const outcome = await provider.refresh();

    // Emitted entities: registry links, pull references, annotations.
    const serialised = JSON.stringify(emitted);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain(BASIC_WIRE_FORM);
    const link = emitted[0].metadata.links?.[0]?.url;
    expect(link).toBe('https://mock.registry/demo/network-ee');

    // The failing repository's error, as returned and as logged.
    expect(outcome.errors.join('\n')).toContain('[REDACTED]');
    expect(outcome.errors.join('\n')).not.toContain(SECRET);
    expect(warns.join('\n')).not.toContain(SECRET);
  });

  it('publishes no credential in registry-supplied metadata', async () => {
    // The registry names a repository after the credential, and its content
    // manifest quotes the credential in a collection description. Both are
    // registry-controlled strings on their way to becoming entity identity
    // (names, links) and free text (descriptions) — the publication
    // boundary is the last place they can be stopped, because nothing
    // downstream of applyMutation inspects them again.
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
              description: `networking collection built with ${SECRET}`,
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
      repositories: { [`${SECRET}/ee`]: [image] },
      referrersMode: 'native',
    });

    const emitted: Entity[] = [];
    const provider = new OCIRegistryEntityProvider({
      connection: {
        ...connection(),
        repositories: [`${SECRET}/ee`],
      },
      contentTypes: defaultContentTypes(),
      fetch: registry.fetch,
      logger: {
        info: () => {},
        warn: () => {},
        debug: () => {},
        error: () => {},
        child: () => undefined,
      } as never,
    });
    await provider.connect({
      applyMutation: async (mutation: {
        entities: Array<{ entity: Entity }>;
      }) => {
        emitted.push(...mutation.entities.map(e => e.entity));
      },
      refresh: async () => {},
    } as never);

    const outcome = await provider.refresh();
    expect(outcome.errors).toEqual([]);
    expect(emitted.length).toBeGreaterThan(1);

    const serialised = JSON.stringify(emitted);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain(BASIC_WIRE_FORM);

    // Identity: the entity name and the published registry link are
    // credential-free, and redaction cannot break catalog name rules.
    const environment = emitted.find(
      entity =>
        (entity.spec as { type?: string } | undefined)?.type ===
        'execution-environment',
    );
    expect(environment).toBeDefined();
    expect(environment!.metadata.name).not.toContain(SECRET);
    expect(environment!.metadata.name).toMatch(/^[a-z0-9._-]+$/);
    expect(environment!.metadata.links?.[0]?.url).not.toContain(SECRET);

    // Free text: registry-supplied descriptions carry the marker, not the
    // value — and the safe parts of the description survive.
    const collection = emitted.find(
      entity =>
        (entity.spec as { type?: string } | undefined)?.type ===
        'ansible-collection',
    );
    expect(collection).toBeDefined();
    expect(collection!.metadata.description).toContain('[REDACTED]');
    expect(collection!.metadata.description).toContain('networking collection');

    // Safe metadata survives redaction: counts, annotations, structure.
    expect(environment!.metadata.description).toContain('1 collection');
    expect(
      environment!.metadata.annotations?.['ansible.com/content-counts'],
    ).toBeDefined();
  });

  it('redacts errors before the scheduler formats them', async () => {
    const registry = new MockRegistry({
      catalogEnabled: true,
      repositories: { 'demo/network-ee': [] },
    });
    let catalogRequests = 0;
    const failing: FetchLike = async (url, init) => {
      if (new URL(url).pathname === '/v2/_catalog') {
        catalogRequests += 1;
        // The capability probe succeeds first; repository discovery then
        // fails outside the provider's per-repository error boundary.
        if (catalogRequests > 1) {
          const cause = new Error(`wire form ${BASIC_WIRE_FORM}`);
          throw new Error(`catalog request rejected for ${SECRET}`, { cause });
        }
      }
      return registry.fetch(url, init);
    };

    let scheduled: (() => Promise<void>) | undefined;
    const provider = new OCIRegistryEntityProvider({
      connection: { ...connection(), repositories: undefined },
      contentTypes: defaultContentTypes(),
      fetch: failing,
      taskRunner: {
        run: async ({ fn }: { fn: () => Promise<void> }) => {
          scheduled = fn;
        },
      } as never,
      logger: {
        info: () => {},
        warn: () => {},
        debug: () => {},
        error: () => {},
        child: () => undefined,
      } as never,
    });

    await provider.connect({
      applyMutation: async () => {},
      refresh: async () => {},
    } as never);
    expect(scheduled).toBeDefined();

    let escaped: unknown;
    try {
      await scheduled!();
    } catch (error) {
      escaped = error;
    }

    expect(escaped).toBeInstanceOf(Error);
    const error = escaped as Error & { cause?: Error };
    expect(error.message).toContain('[REDACTED]');
    expect(error.message).not.toContain(SECRET);
    expect(error.message).not.toContain(BASIC_WIRE_FORM);
    expect(error.stack).toContain('[REDACTED]');
    expect(error.stack).not.toContain(SECRET);
    expect(error.stack).not.toContain(BASIC_WIRE_FORM);
    expect(error.cause?.message).toBe(`wire form [REDACTED]`);
    expect(error.cause?.message).not.toContain(BASIC_WIRE_FORM);
  });

  it('preserves a timeout diagnostic when its message is read-only', async () => {
    const registry = new MockRegistry({
      catalogEnabled: true,
      repositories: { 'demo/network-ee': [] },
    });
    let catalogRequests = 0;
    const failing: FetchLike = async (url, init) => {
      if (new URL(url).pathname === '/v2/_catalog') {
        catalogRequests += 1;
        if (catalogRequests > 1) {
          throw new DOMException(
            `catalog request timed out for ${SECRET}`,
            'TimeoutError',
          );
        }
      }
      return registry.fetch(url, init);
    };

    let scheduled: (() => Promise<void>) | undefined;
    const provider = new OCIRegistryEntityProvider({
      connection: { ...connection(), repositories: undefined },
      contentTypes: defaultContentTypes(),
      fetch: failing,
      taskRunner: {
        run: async ({ fn }: { fn: () => Promise<void> }) => {
          scheduled = fn;
        },
      } as never,
      logger: {
        info: () => {},
        warn: () => {},
        debug: () => {},
        error: () => {},
        child: () => undefined,
      } as never,
    });

    await provider.connect({
      applyMutation: async () => {},
      refresh: async () => {},
    } as never);
    await expect(scheduled!()).rejects.toThrow(
      'catalog request timed out for [REDACTED]',
    );
  });

  it('redacts runtime-exchanged tokens from catalog entities and logs', async () => {
    const registry = new MockRegistry({
      auth: 'bearer-challenge',
      repositories: {
        'mock-token/ee': [makeLabelledImage('v1', { [EE_LABEL]: 'true' })],
      },
    });
    const logs: string[] = [];
    const emitted: Entity[] = [];
    const provider = new OCIRegistryEntityProvider({
      connection: {
        name: 'bearer',
        url: 'https://mock.registry',
        auth: { type: 'anonymous' as const },
        repositories: ['mock-token/ee', 'mock-token/broken'],
      },
      contentTypes: defaultContentTypes(),
      fetch: registry.fetch,
      logger: {
        info: (m: string) => logs.push(m),
        warn: (m: string) => logs.push(m),
        debug: (m: string) => logs.push(m),
        error: () => {},
        child: () => undefined,
      } as never,
    });

    await provider.connect({
      applyMutation: async (mutation: {
        entities: Array<{ entity: Entity }>;
      }) => {
        emitted.push(...mutation.entities.map(e => e.entity));
      },
      refresh: async () => {},
    } as never);

    const outcome = await provider.refresh();

    expect(registry.tokensIssued).toBeGreaterThan(0);
    expect(emitted.length).toBeGreaterThan(0);
    expect(JSON.stringify(emitted)).not.toContain('mock-token');
    expect(logs.join('\n')).not.toContain('mock-token');
    expect(outcome.errors.join('\n')).not.toContain('mock-token');

    const environment = emitted.find(
      entity =>
        (entity.spec as { type?: string } | undefined)?.type ===
        'execution-environment',
    );
    expect(environment).toBeDefined();
    expect(environment!.metadata.name).toMatch(/^[a-z0-9._-]+$/);
  });
});
