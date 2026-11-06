import { OCIClient, nextLink } from './OCIClient';
import { CredentialRedactor } from '../security/CredentialRedactor';
import { ImageManifest, MediaTypes, RegistryConnection } from './types';
import {
  MockRegistry,
  makeImage,
  makeLabelledImage,
} from '../testing/MockRegistry';
import { fakeRegistryCredentials } from '../testing/fakeCredentials';

const HOST = 'https://mock.registry';
const FAKE_CREDENTIALS = fakeRegistryCredentials();
const FAKE_REGISTRY_PASSWORD = FAKE_CREDENTIALS.password;

function connection(
  overrides: Partial<RegistryConnection> = {},
): RegistryConnection {
  return {
    name: 'mock',
    url: HOST,
    auth: { type: 'anonymous' },
    ...overrides,
  };
}

function clientFor(registry: MockRegistry, conn = connection()): OCIClient {
  return new OCIClient(conn, { fetch: registry.fetch });
}

describe('nextLink', () => {
  it('extracts a rel="next" target', () => {
    expect(nextLink('</v2/x/tags/list?n=2&last=b>; rel="next"')).toBe(
      '/v2/x/tags/list?n=2&last=b',
    );
  });

  it('tolerates an unquoted rel and multiple links', () => {
    expect(nextLink('</a>; rel=prev, </b>; rel=next')).toBe('/b');
  });

  it('returns undefined when absent', () => {
    expect(nextLink(null)).toBeUndefined();
    expect(nextLink('</a>; rel="prev"')).toBeUndefined();
  });
});

describe('OCIClient.parseChallenge', () => {
  it('parses a bearer challenge', () => {
    const challenge = OCIClient.parseChallenge(
      'Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/nginx:pull"',
    );
    expect(challenge).toEqual({
      realm: 'https://auth.docker.io/token',
      service: 'registry.docker.io',
      scope: 'repository:library/nginx:pull',
    });
  });

  it('ignores non-bearer schemes', () => {
    expect(OCIClient.parseChallenge('Basic realm="x"')).toBeUndefined();
  });
});

describe('authentication', () => {
  it('completes the 401 → token → retry flow and caches the token', async () => {
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [makeImage({ tag: 'latest' })] },
      auth: 'bearer-challenge',
      catalogEnabled: true,
    });
    const client = clientFor(registry);

    const first = await client.getManifest('ansible/ee', 'latest');
    expect(first.digest).toBeTruthy();
    expect(registry.tokensIssued).toBe(1);

    // Second call must reuse the cached token rather than re-challenging.
    await client.getManifest('ansible/ee', 'latest');
    expect(registry.tokensIssued).toBe(1);
  });

  it('sends basic credentials when configured', async () => {
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [makeImage({ tag: 'latest' })] },
      auth: 'basic-required',
    });
    const client = clientFor(
      registry,
      connection({ auth: { type: 'basic', username: 'u', password: 'p' } }),
    );

    const artifact = await client.getManifest('ansible/ee', 'latest');
    expect(artifact.repository).toBe('ansible/ee');
  });
});

describe('listRepositories', () => {
  it('enumerates when _catalog is available', async () => {
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [], 'ansible/other': [] },
      catalogEnabled: true,
    });
    const found: string[] = [];
    for await (const repo of clientFor(registry).listRepositories())
      found.push(repo);
    expect(found).toEqual(['ansible/ee', 'ansible/other']);
  });

  it('yields nothing when _catalog is disabled, rather than throwing', async () => {
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [] },
      catalogEnabled: false,
    });
    const found: string[] = [];
    for await (const repo of clientFor(registry).listRepositories())
      found.push(repo);
    expect(found).toEqual([]);
  });
});

describe('listTags', () => {
  it('follows Link-header pagination', async () => {
    const images = ['a', 'b', 'c'].map(tag => makeImage({ tag }));
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': images },
      paginate: true,
    });

    const found: string[] = [];
    for await (const tag of clientFor(registry).listTags('ansible/ee', 2)) {
      found.push(tag);
    }
    expect(found).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty list for an unknown repository', async () => {
    const registry = new MockRegistry({ repositories: {} });
    const found: string[] = [];
    for await (const tag of clientFor(registry).listTags('nope'))
      found.push(tag);
    expect(found).toEqual([]);
  });
});

describe('manifests', () => {
  it('resolves a tag to an immutable digest via HEAD', async () => {
    const image = makeImage({ tag: 'latest' });
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
    });

    const head = await clientFor(registry).headManifest('ansible/ee', 'latest');
    expect(head.status).toBe(200);
    expect(head.digest).toBe(image.digest);
  });

  it('falls back to the reference when the digest header is omitted', async () => {
    const image = makeImage({ tag: 'latest' });
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      omitDigestHeader: true,
    });

    const byDigest = await clientFor(registry).getManifest(
      'ansible/ee',
      image.digest,
    );
    expect(byDigest.digest).toBe(image.digest);
  });

  it('throws a RegistryError carrying the status', async () => {
    const registry = new MockRegistry({ repositories: {} });
    await expect(
      clientFor(registry).getManifest('ansible/ee', 'latest'),
    ).rejects.toMatchObject({ name: 'RegistryError', status: 404 });
  });
});

describe('config blobs', () => {
  it('reads OCI labels from the config blob', async () => {
    const image = makeLabelledImage('latest', {
      'com.redhat.component': 'ee-minimal',
      'io.ansible.collections': 'community.general,ansible.posix',
    });
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
    });
    const client = clientFor(registry);

    const artifact = await client.getManifest('ansible/ee', 'latest');
    const config = await client.getConfigBlob(
      'ansible/ee',
      (artifact.manifest as ImageManifest).config,
    );

    expect(config?.config?.Labels?.['io.ansible.collections']).toBe(
      'community.general,ansible.posix',
    );
  });

  it('returns undefined rather than throwing when the blob is unavailable', async () => {
    const image = makeLabelledImage('latest', { a: 'b' });
    const configDigest = (image.manifest as { config: { digest: string } })
      .config.digest;
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      failConfigBlobs: [configDigest],
    });
    const client = clientFor(registry);

    const artifact = await client.getManifest('ansible/ee', 'latest');
    const config = await client.getConfigBlob(
      'ansible/ee',
      (artifact.manifest as ImageManifest).config,
    );
    expect(config).toBeUndefined();
  });

  it('costs exactly one extra request per manifest — the fetch-side enumeration cost', async () => {
    const image = makeLabelledImage('latest', { a: 'b' });
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
    });
    const client = clientFor(registry);

    registry.reset();
    const artifact = await client.getManifest('ansible/ee', 'latest');
    await client.getConfigBlob(
      'ansible/ee',
      (artifact.manifest as ImageManifest).config,
    );

    expect(registry.countRequests('/manifests/')).toBe(1);
    expect(registry.countRequests('/blobs/')).toBe(1);
  });
});

describe('referrers', () => {
  const referrerDigest = `sha256:${'ref'.padEnd(64, '0')}`;
  const payloadDigest = `sha256:${'pay'.padEnd(64, '0')}`;

  function imageWithReferrer() {
    const base = makeImage({ tag: 'latest' });
    return {
      ...base,
      referrers: [
        {
          mediaType: MediaTypes.ociManifest,
          digest: referrerDigest,
          size: 200,
          artifactType: 'application/vnd.ansible.content-manifest.v1+json',
        },
      ],
      referrerPayloads: {
        [payloadDigest]: {
          collections: [{ name: 'community.general', version: '8.0.0' }],
        },
      },
    };
  }

  it('uses the native referrers endpoint when available', async () => {
    const image = imageWithReferrer();
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      referrersMode: 'native',
    });

    const result = await clientFor(registry).getReferrers(
      'ansible/ee',
      image.digest,
    );
    expect(result.via).toBe('native');
    expect(result.referrers).toHaveLength(1);
  });

  it('falls back to the sha256- tag schema when the endpoint is absent', async () => {
    const image = imageWithReferrer();
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      referrersMode: 'tag-fallback',
    });

    const result = await clientFor(registry).getReferrers(
      'ansible/ee',
      image.digest,
    );
    expect(result.via).toBe('tag-fallback');
    expect(result.referrers).toHaveLength(1);
  });

  it('reports none on a registry with no referrer support at all', async () => {
    const image = imageWithReferrer();
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      referrersMode: 'none',
    });

    const result = await clientFor(registry).getReferrers(
      'ansible/ee',
      image.digest,
    );
    expect(result.via).toBe('none');
    expect(result.referrers).toEqual([]);
  });

  it('reads a build-time content manifest payload', async () => {
    const image = imageWithReferrer();
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      referrersMode: 'native',
    });
    const client = clientFor(registry);

    const { referrers } = await client.getReferrers('ansible/ee', image.digest);
    const payload = await client.getReferrerPayload('ansible/ee', referrers[0]);

    expect(payload).toEqual({
      collections: [{ name: 'community.general', version: '8.0.0' }],
    });
  });
});

describe('pullReference', () => {
  it('uses @ for digests and : for tags — Portal is never in the data path', () => {
    const client = clientFor(new MockRegistry({ repositories: {} }));
    expect(
      client.pullReference({
        registry: 'mock',
        repository: 'ansible/ee',
        reference: 'latest',
      }),
    ).toBe('mock.registry/ansible/ee:latest');
    expect(
      client.pullReference({
        registry: 'mock',
        repository: 'ansible/ee',
        reference: 'sha256:abc',
      }),
    ).toBe('mock.registry/ansible/ee@sha256:abc');
  });

  it('fails closed when the configured URL cannot be parsed', () => {
    const client = new OCIClient(
      connection({
        url: `https://ci:${FAKE_REGISTRY_PASSWORD}@mock.registry:99999`,
      }),
    );

    expect(
      client.pullReference({
        registry: 'mock',
        repository: 'ansible/ee',
        reference: 'latest',
      }),
    ).toBe('(unparseable URL)/ansible/ee:latest');
  });
});

describe('auth priming', () => {
  /**
   * A registry that accepts Bearer only on /v2/, as Quay does.
   *
   * Presenting Basic there earns 400 with no WWW-Authenticate header, so a client that
   * sends credentials eagerly never learns where to exchange them and fails every
   * request. This was not hypothetical: it broke discovery against a local Quay, and
   * the symptom was "tag listing failed: 400" with no hint of the cause.
   */
  function bearerOnlyRegistry() {
    const seen: Array<{ path: string; auth: string | undefined }> = [];
    const fetchImpl = async (
      url: string,
      init?: { headers?: Record<string, string> },
    ) => {
      const path = new URL(url).pathname + new URL(url).search;
      const auth = init?.headers?.Authorization;
      seen.push({ path, auth });

      const reply = (
        status: number,
        body: unknown,
        headers: Record<string, string> = {},
      ) => new Response(JSON.stringify(body), { status, headers });

      if (path.startsWith('/v2/auth')) {
        return auth?.startsWith('Basic ')
          ? reply(200, { token: 'issued-token' })
          : reply(401, { error: 'auth required' });
      }
      if (!auth) {
        return reply(
          401,
          {},
          {
            'www-authenticate':
              'Bearer realm="https://mock.registry/v2/auth",service="quay"',
          },
        );
      }
      if (!auth.startsWith('Bearer ')) {
        return reply(400, { error: 'Invalid bearer token format' });
      }
      return reply(200, { name: 'demo/ee', tags: ['dev'] });
    };
    return { seen, fetchImpl: fetchImpl as never };
  }

  it('primes /v2/ without credentials', async () => {
    const { seen, fetchImpl } = bearerOnlyRegistry();
    const client = new OCIClient(
      connection({ auth: { type: 'basic', username: 'u', password: 'p' } }),
      { fetch: fetchImpl },
    );

    await client.request('/v2/demo/ee/tags/list');

    const prime = seen.find(r => r.path === '/v2/');
    expect(prime).toBeDefined();
    expect(prime?.auth).toBeUndefined();
  });

  it('reaches a bearer-only registry that rejects Basic outright', async () => {
    const { seen, fetchImpl } = bearerOnlyRegistry();
    const client = new OCIClient(
      connection({ auth: { type: 'basic', username: 'u', password: 'p' } }),
      { fetch: fetchImpl },
    );

    const res = await client.request('/v2/demo/ee/tags/list');

    expect(res.status).toBe(200);
    // Basic is legitimate at the token endpoint and nowhere else: carrying it to any
    // other /v2/ path is what earns the 400.
    const misuse = seen.filter(
      r => !r.path.startsWith('/v2/auth') && r.auth?.startsWith('Basic '),
    );
    expect(misuse).toEqual([]);
  });

  it('primes once, not per request', async () => {
    const { seen, fetchImpl } = bearerOnlyRegistry();
    const client = new OCIClient(
      connection({ auth: { type: 'basic', username: 'u', password: 'p' } }),
      { fetch: fetchImpl },
    );

    await Promise.all([
      client.request('/v2/demo/ee/tags/list'),
      client.request('/v2/demo/ee/tags/list'),
    ]);

    expect(seen.filter(r => r.path === '/v2/')).toHaveLength(1);
  });

  it('ping observes the challenge rather than suppressing it', async () => {
    // The probe exists to read the auth scheme. Sending credentials is what hides it:
    // the registry answers 400 instead of challenging, and the probe concludes
    // "anonymous" about a registry that requires a token.
    const { seen, fetchImpl } = bearerOnlyRegistry();
    const client = new OCIClient(
      connection({ auth: { type: 'basic', username: 'u', password: 'p' } }),
      { fetch: fetchImpl },
    );

    const result = await client.ping();

    expect(result.status).toBe(401);
    expect(result.challenge).toContain('Bearer');
    expect(seen.every(r => r.auth === undefined)).toBe(true);
  });
});

describe('auth realm rewriting (rewriteAuthRealmHost)', () => {
  /**
   * A TLS registry whose advertised token endpoint is wrong, as Quay behind a
   * TLS-terminating proxy behaves: the client connects to https://mock.registry,
   * but the challenge points the token exchange at a plain-HTTP address.
   *
   * This was not hypothetical: against a real local Quay fronted by a TLS proxy,
   * the refusal check for plaintext realms ran before the rewrite, the token
   * exchange never happened, and every request failed 401 — reading exactly like
   * a credentials or certificate problem (found 2026-10-27, PR #945).
   *
   * `realmOrigin` varies the defect's shape: a different internal host with a
   * port, and the registry's own public host on plain HTTP.
   */
  function tlsRegistryAdvertisingPlainRealm(realmOrigin: string) {
    const seen: Array<{ url: string; auth: string | undefined }> = [];
    const fetchImpl = async (
      url: string,
      init?: { headers?: Record<string, string> },
    ) => {
      const auth = init?.headers?.Authorization;
      seen.push({ url, auth });

      const reply = (
        status: number,
        body: unknown,
        headers: Record<string, string> = {},
      ) => new Response(JSON.stringify(body), { status, headers });

      // The advertised token endpoint, in both its shapes.
      if (url.startsWith(`${realmOrigin}/v2/auth`)) {
        return auth?.startsWith('Basic ')
          ? reply(200, { token: 'issued-token', expires_in: 300 })
          : reply(401, { error: 'auth required' });
      }
      // The registry's real endpoints, over TLS.
      if (url.startsWith(`${HOST}/v2/auth`)) {
        return auth?.startsWith('Basic ')
          ? reply(200, { token: 'rewritten-token', expires_in: 300 })
          : reply(401, { error: 'auth required' });
      }
      if (!auth) {
        return reply(
          401,
          {},
          {
            'www-authenticate': `Bearer realm="${realmOrigin}/v2/auth",service="quay"`,
          },
        );
      }
      if (!auth.startsWith('Bearer ')) {
        return reply(400, { error: 'Invalid bearer token format' });
      }
      return reply(200, { name: 'demo/ee', tags: ['dev'] });
    };
    return { seen, fetchImpl: fetchImpl as never };
  }

  const basic = { type: 'basic' as const, username: 'u', password: 'p' };

  it.each([
    ['a different internal host', 'http://internal.registry:8080'],
    ['the same host on plain HTTP', 'http://mock.registry'],
  ])(
    'rewrites a plain-HTTP realm (%s) so the token exchange stays on TLS',
    async (_label, realmOrigin) => {
      const { seen, fetchImpl } = tlsRegistryAdvertisingPlainRealm(realmOrigin);
      const client = new OCIClient(
        connection({ auth: basic, rewriteAuthRealmHost: true }),
        { fetch: fetchImpl },
      );

      const res = await client.request('/v2/demo/ee/tags/list');

      expect(res.status).toBe(200);
      // The exchange went to the configured TLS registry, not the advertised
      // plaintext address, and the real endpoints saw the resulting token.
      const exchanges = seen.filter(r => r.url.startsWith(`${HOST}/v2/auth`));
      expect(exchanges).toHaveLength(1);
      expect(exchanges[0].auth).toMatch(/^Basic /);
      const plaintextExchanges = seen.filter(r =>
        r.url.startsWith(`${realmOrigin}/v2/auth`),
      );
      expect(plaintextExchanges).toEqual([]);
    },
  );

  it('still refuses a plain-HTTP realm when rewriting is not enabled', async () => {
    const { seen, fetchImpl } = tlsRegistryAdvertisingPlainRealm(
      'http://internal.registry:8080',
    );
    const client = new OCIClient(connection({ auth: basic }), {
      fetch: fetchImpl,
    });

    const res = await client.request('/v2/demo/ee/tags/list');

    // Without the opt-in, no token is acquired; the registry rejects the
    // static credentials (Quay-style 400 here — the exact status is the
    // stub's, the point is the request did not succeed).
    expect([400, 401]).toContain(res.status);

    // The security property: nothing was ever sent to the advertised
    // plaintext realm — the Basic credentials never left TLS.
    const plaintext = seen.filter(r => r.url.startsWith('http://'));
    expect(plaintext).toEqual([]);
  });

  it('leaves a correct TLS realm untouched', async () => {
    // A realm already on the right origin exercises the no-rewrite path.
    const { seen, fetchImpl } = tlsRegistryAdvertisingPlainRealm(HOST);
    const client = new OCIClient(
      connection({ auth: basic, rewriteAuthRealmHost: true }),
      { fetch: fetchImpl },
    );

    const res = await client.request('/v2/demo/ee/tags/list');

    expect(res.status).toBe(200);
    expect(seen.filter(r => r.url.includes('/v2/auth'))).toHaveLength(1);
  });
});

describe('SSRF refusals', () => {
  /**
   * A registry that answers every request with the given bearer challenge.
   *
   * `https://auth.example/token` is the legitimate shape this suite exercises:
   * registries legitimately use separate auth hosts, so the challenge — not the
   * configured URL — decides where the token exchange goes. That is exactly why
   * the realm is the interesting attack surface: it is registry-controlled
   * input that directs a credential-bearing request.
   */
  function challengingRegistry(challenge: string) {
    const seen: Array<{ url: string; auth: string | undefined }> = [];
    const fetchImpl = async (
      url: string,
      init?: { headers?: Record<string, string> },
    ) => {
      seen.push({ url, auth: init?.headers?.Authorization });
      if (url.startsWith('https://auth.example/')) {
        return new Response(JSON.stringify({ token: 'issued-token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      const path = new URL(url).pathname;
      if (path === '/v2/') return new Response('{}', { status: 200 });
      if (!init?.headers?.Authorization?.startsWith('Bearer ')) {
        return new Response('unauthorized', {
          status: 401,
          headers: { 'www-authenticate': challenge },
        });
      }
      return new Response(
        JSON.stringify({ name: 'ansible/ee', tags: ['dev'] }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    };
    return { seen, fetchImpl: fetchImpl as never };
  }

  it('refuses an auth realm whose scheme is not http(s)', async () => {
    // A `file:` realm would direct the credential-bearing token request at the
    // local filesystem. The refusal must leave the original request standing at
    // 401 rather than retrying, and no request may leave the configured registry.
    const { seen, fetchImpl } = challengingRegistry(
      'Bearer realm="file:///etc/shadow",service="x"',
    );
    const warn = jest.fn();
    const client = new OCIClient(connection(), {
      fetch: fetchImpl,
      logger: { debug: () => {}, warn },
    });

    const res = await client.request('/v2/ansible/ee/tags/list');

    expect(res.status).toBe(401);
    // The branch-specific diagnostic, not just the 401: an unparsed challenge
    // would look identical from the response alone.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('refusing auth realm with protocol'),
    );
    // Compare origins, not prefixes: a plain startsWith would also accept
    // https://mock.registry.attacker.example as "staying on the mock host".
    expect(
      seen.every(r => new URL(r.url).origin === 'https://mock.registry'),
    ).toBe(true);
  });

  it('refuses a plaintext auth realm for an HTTPS registry', async () => {
    // Sending Basic credentials to an http:// realm would leak them to anyone
    // watching the wire. Same contract as above: 401 stands, nothing is sent.
    const { seen, fetchImpl } = challengingRegistry(
      'Bearer realm="http://auth.example/token",service="x"',
    );
    const warn = jest.fn();
    const client = new OCIClient(connection(), {
      fetch: fetchImpl,
      logger: { debug: () => {}, warn },
    });

    const res = await client.request('/v2/ansible/ee/tags/list');

    expect(res.status).toBe(401);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('refusing non-TLS auth realm'),
    );
    expect(seen.some(r => r.url.startsWith('http://'))).toBe(false);
  });

  it('still exchanges tokens with a separate HTTPS auth host — the deliberate exemption', async () => {
    // The realm origin check is intentionally NOT applied to auth realms:
    // registries legitimately use dedicated auth hosts (auth.docker.io,
    // auth.example). This pins that exemption as intended behaviour, so a future
    // tightening has to argue with this test, not silently regress it.
    const { seen, fetchImpl } = challengingRegistry(
      'Bearer realm="https://auth.example/token",service="x"',
    );
    const client = new OCIClient(connection(), { fetch: fetchImpl });

    const res = await client.request('/v2/ansible/ee/tags/list');

    expect(res.status).toBe(200);
    expect(seen.some(r => r.url.startsWith('https://auth.example/'))).toBe(
      true,
    );
  });

  /**
   * Link headers are registry controlled, and a hostile one can take any
   * reference form. The origin check must authorize the *parsed* target:
   * scheme-relative links swap the authority outright, so they are refused
   * like absolute ones. (Same-origin absolute Links are the allowed case —
   * the "follows Link-header pagination" test above covers those.)
   */
  it.each([
    [
      'absolute HTTPS link',
      'https://evil.example/v2/ansible/ee/tags/list?n=100&last=a',
    ],
    [
      'scheme-relative link',
      '//evil.example/v2/ansible/ee/tags/list?n=100&last=a',
    ],
  ])(
    'refuses a %s that points away from the configured registry',
    async (_label, hostileLink) => {
      const seen: string[] = [];
      const fetchImpl = async (url: string) => {
        seen.push(url);
        const path = new URL(url).pathname;
        if (path === '/v2/') return new Response('{}', { status: 200 });
        if (path.endsWith('/tags/list')) {
          return new Response(
            JSON.stringify({ name: 'ansible/ee', tags: ['a'] }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
                link: `<${hostileLink}>; rel="next"`,
              },
            },
          );
        }
        return new Response('{}', { status: 404 });
      };
      const client = new OCIClient(connection(), { fetch: fetchImpl as never });

      const tags: string[] = [];
      await expect(async () => {
        for await (const tag of client.listTags('ansible/ee')) tags.push(tag);
      }).rejects.toThrow();

      // The first page was served before the hostile Link was refused.
      expect(tags).toEqual(['a']);
      expect(seen.every(url => new URL(url).origin === HOST)).toBe(true);
    },
  );

  /**
   * The suffix tricks against authority concatenation. Under the previous
   * string-concatenation resolution, `.attacker.example/v2/...` glued onto the
   * configured host (`https://mock.registry.attacker.example/...`) and a
   * `:444/...` link changed the port — both redirecting a credential-bearing
   * request to an attacker-chosen destination. Resolved as relative references
   * they cannot touch the authority: the request stays on the configured
   * origin, merely with a longer path. The guarantee under test is the origin.
   */
  it.each([
    [
      'hostname-suffixed link',
      '.attacker.example/v2/ansible/ee/tags/list?n=100&last=a',
      '/.attacker.example/',
    ],
    [
      'port-suffixed link',
      ':444/v2/ansible/ee/tags/list?n=100&last=a',
      '/:444/',
    ],
  ])(
    'neutralizes a %s as a path under the configured registry',
    async (_label, hostileLink, resolvedPath) => {
      const seen: string[] = [];
      const fetchImpl = async (url: string) => {
        seen.push(url);
        const path = new URL(url).pathname;
        if (path === '/v2/') return new Response('{}', { status: 200 });
        if (path === '/v2/ansible/ee/tags/list') {
          return new Response(
            JSON.stringify({ name: 'ansible/ee', tags: ['a'] }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
                link: `<${hostileLink}>; rel="next"`,
              },
            },
          );
        }
        // The hostile target, resolved: same origin, odd path. Serve a plain
        // page with no further Link so pagination terminates.
        return new Response(
          JSON.stringify({ name: 'ansible/ee', tags: ['b'] }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      };
      const client = new OCIClient(connection(), { fetch: fetchImpl as never });

      const tags: string[] = [];
      for await (const tag of client.listTags('ansible/ee')) tags.push(tag);

      expect(tags).toEqual(['a', 'b']);
      expect(seen.every(url => new URL(url).hostname === 'mock.registry')).toBe(
        true,
      );
      // The suffix trick landed in the path, never in the authority.
      expect(seen.some(url => url.includes(resolvedPath))).toBe(true);
    },
  );
});

describe('sub-path mounted registries', () => {
  // A registry behind a reverse proxy mounted under a sub-path. Every request
  // must keep the prefix: dropping it turns the registry's 404s into what
  // looks like an empty catalog, with no error anywhere.
  const PREFIXED_URL = 'https://registry.example.com/harbor-proxy';
  const PREFIX = '/harbor-proxy';

  function tagsRegistry(link?: string): {
    seen: string[];
    fetchImpl: ReturnType<() => typeof fetch>;
  } {
    const seen: string[] = [];
    const fetchImpl = async (url: string) => {
      const full = new URL(url);
      seen.push(full.pathname + full.search);
      if (full.pathname === `${PREFIX}/v2/`) {
        return new Response('{}', { status: 200 });
      }
      if (full.pathname === `${PREFIX}/v2/ansible/ee/tags/list`) {
        const pageTwo = full.search.includes('last=');
        return new Response(
          JSON.stringify({ name: 'ansible/ee', tags: pageTwo ? ['b'] : ['a'] }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              ...(pageTwo || !link ? {} : { link }),
            },
          },
        );
      }
      return new Response('{}', { status: 404 });
    };
    return { seen, fetchImpl: fetchImpl as never };
  }

  it('keeps the configured base path on the first /v2 request and every data request', async () => {
    const { seen, fetchImpl } = tagsRegistry();
    const client = new OCIClient(connection({ url: PREFIXED_URL }), {
      fetch: fetchImpl,
    });

    const tags: string[] = [];
    for await (const tag of client.listTags('ansible/ee')) tags.push(tag);

    expect(tags).toEqual(['a']);
    // The priming probe and the data request both landed under the prefix.
    expect(seen).toEqual([
      `${PREFIX}/v2/`,
      `${PREFIX}/v2/ansible/ee/tags/list?n=100`,
    ]);
  });

  it('does not double the prefix when a same-origin Link already carries it', async () => {
    // The allowed pagination case: an absolute Link that already includes the
    // configured prefix. It must be followed as-is, not prefixed again.
    const { seen, fetchImpl } = tagsRegistry(
      `<${PREFIXED_URL}/v2/ansible/ee/tags/list?n=100&last=a>; rel="next"`,
    );
    const client = new OCIClient(connection({ url: PREFIXED_URL }), {
      fetch: fetchImpl,
    });

    const tags: string[] = [];
    for await (const tag of client.listTags('ansible/ee')) tags.push(tag);

    expect(tags).toEqual(['a', 'b']);
    expect(seen.every(url => url.startsWith(PREFIX))).toBe(true);
    expect(seen.some(url => url.includes(`${PREFIX}${PREFIX}`))).toBe(false);
  });

  it('still refuses a Link that points away from a prefixed registry', async () => {
    const { seen, fetchImpl } = tagsRegistry(
      `<https://evil.example/v2/ansible/ee/tags/list?n=100&last=a>; rel="next"`,
    );
    const client = new OCIClient(connection({ url: PREFIXED_URL }), {
      fetch: fetchImpl,
    });

    const tags: string[] = [];
    await expect(async () => {
      for await (const tag of client.listTags('ansible/ee')) tags.push(tag);
    }).rejects.toThrow();

    // The first page was served before the hostile Link was refused, and
    // nothing left the prefixed registry.
    expect(tags).toEqual(['a']);
    expect(seen.every(url => url.startsWith(PREFIX))).toBe(true);
  });

  it('does not double the prefix when a root-relative Link already carries it', async () => {
    // The other legitimate shape from a sub-path proxy: a Link that already
    // includes the external prefix, but without the scheme or host. Doubling
    // it would request a path the registry answers with 404 — which reads as
    // a short result list, not an error.
    const { seen, fetchImpl } = tagsRegistry(
      `<${PREFIX}/v2/ansible/ee/tags/list?n=100&last=a>; rel="next"`,
    );
    const client = new OCIClient(connection({ url: PREFIXED_URL }), {
      fetch: fetchImpl,
    });

    const tags: string[] = [];
    for await (const tag of client.listTags('ansible/ee')) tags.push(tag);

    expect(tags).toEqual(['a', 'b']);
    expect(seen.some(url => url.includes(`${PREFIX}${PREFIX}`))).toBe(false);
  });

  it('resolves a query-only Link against the page that carried it', async () => {
    // A Link of just `?last=a` means "the same page, next query". Resolving
    // it against anything but the current page loses the page's path.
    const { seen, fetchImpl } = tagsRegistry(`<?n=100&last=a>; rel="next"`);
    const client = new OCIClient(connection({ url: PREFIXED_URL }), {
      fetch: fetchImpl,
    });

    const tags: string[] = [];
    for await (const tag of client.listTags('ansible/ee')) tags.push(tag);

    expect(tags).toEqual(['a', 'b']);
    // The third request (after the /v2/ priming probe and the first page)
    // kept the page's path and only changed the query.
    expect(seen[2]).toBe(`${PREFIX}/v2/ansible/ee/tags/list?n=100&last=a`);
  });

  it('refuses a client-built path that escapes the mount', async () => {
    // Client-built paths are this client's own constants, so this branch is
    // defense in depth: a `..` segment must not be able to leave the
    // configured path while staying same-origin. The fetch is never issued.
    const seen: string[] = [];
    const fetchImpl = async (url: string) => {
      seen.push(url);
      return new Response('{}', { status: 200 });
    };
    const client = new OCIClient(connection({ url: PREFIXED_URL }), {
      fetch: fetchImpl as never,
    });

    await expect(client.request('/../escape')).rejects.toThrow(
      'refusing request path that leaves the configured registry path',
    );
    expect(seen).toEqual([]);
  });

  it('keeps the prefix on non-paginated requests too', async () => {
    // Manifest and referrer requests go through the same resolver as the
    // paginated listings; this pins the guarantee for their path shape.
    const seen: string[] = [];
    const fetchImpl = async (url: string) => {
      const full = new URL(url);
      seen.push(full.pathname);
      if (full.pathname === `${PREFIX}/v2/`)
        return new Response('{}', { status: 200 });
      if (full.pathname === `${PREFIX}/v2/ansible/ee/manifests/sha256:abc`) {
        return new Response(null, {
          status: 200,
          headers: { 'docker-content-digest': 'sha256:abc' },
        });
      }
      return new Response('{}', { status: 404 });
    };
    const client = new OCIClient(connection({ url: PREFIXED_URL }), {
      fetch: fetchImpl as never,
    });

    const res = await client.headManifest('ansible/ee', 'sha256:abc');

    expect(res.status).toBe(200);
    expect(seen).toContain(`${PREFIX}/v2/ansible/ee/manifests/sha256:abc`);
  });
});

describe('refusal messages carry no registry-controlled text', () => {
  /**
   * The Link header is chosen by the registry. Whatever it contains must not
   * reach the logs: the refusal messages are fixed wording naming only the
   * registry (which is our configuration, not theirs).
   */
  function hostileLinkRegistry(link: string) {
    const fetchImpl = async (url: string) => {
      const path = new URL(url).pathname;
      if (path === '/v2/') return new Response('{}', { status: 200 });
      if (path === '/v2/ansible/ee/tags/list') {
        return new Response(
          JSON.stringify({ name: 'ansible/ee', tags: ['a'] }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              link,
            },
          },
        );
      }
      return new Response('{}', { status: 404 });
    };
    return { fetchImpl: fetchImpl as never };
  }

  async function refusalMessage(link: string): Promise<string> {
    const { fetchImpl } = hostileLinkRegistry(link);
    const client = new OCIClient(connection(), { fetch: fetchImpl });
    let thrown: unknown;
    try {
      for await (const _tag of client.listTags('ansible/ee')) {
        // drain
      }
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    return (thrown as Error).message;
  }

  it('refuses a malformed link without echoing its contents', async () => {
    const secret = 'hunter2-top-secret';
    const message = await refusalMessage(
      `<https://[invalid-${secret}>; rel="next"`,
    );

    expect(message).toContain('refusing to follow malformed pagination link');
    expect(message).not.toContain(secret);
    expect(message).toContain('[mock]');
  });

  it('refuses a cross-origin link without naming either host', async () => {
    const secret = 'hunter2-top-secret';
    const message = await refusalMessage(
      `<https://evil-${secret}.example/v2/ansible/ee/tags/list>; rel="next"`,
    );

    expect(message).toContain(
      'refusing pagination link that points away from the configured registry',
    );
    expect(message).not.toContain(secret);
    expect(message).not.toContain('evil');
    expect(message).not.toContain(HOST);
  });

  it('refuses a scheme-relative link that swaps the host outright', async () => {
    const message = await refusalMessage(
      `<//evil.example/v2/ansible/ee/tags/list>; rel="next"`,
    );

    expect(message).toContain(
      'refusing pagination link that points away from the configured registry',
    );
  });
});

describe('auth failure logs carry no registry-controlled text', () => {
  /**
   * The auth realm and its response body are chosen by the registry. Both
   * must stay out of the logs — the same rule the pagination refusals
   * follow. Each test embeds a fake secret in the registry-controlled parts
   * and asserts it never reaches a log line.
   */
  it('logs a failed token exchange without the realm URL or response body', async () => {
    const secret = 'hunter2-top-secret';
    const warn = jest.fn();
    const fetchImpl = async (url: string) => {
      if (url.includes('auth')) {
        // The advertised realm, answering with a body built to look like a
        // forged log line.
        return new Response(`[ERROR] leaked ${secret}`, { status: 500 });
      }
      return new Response('{}', {
        status: 401,
        headers: {
          'www-authenticate': `Bearer realm="https://auth-${secret}.example/token",service="mock"`,
        },
      });
    };
    const client = new OCIClient(connection(), {
      fetch: fetchImpl as never,
      logger: { debug: () => {}, warn },
    });

    await expect(client.listTags('ansible/ee').next()).rejects.toThrow();

    const messages = warn.mock.calls.map(call => call.join(' '));
    expect(messages.some(m => m.includes('token exchange failed: 500'))).toBe(
      true,
    );
    expect(messages.some(m => m.includes(secret))).toBe(false);
  });

  it('refuses a non-TLS realm without echoing its URL', async () => {
    const secret = 'hunter2-top-secret';
    const warn = jest.fn();
    const fetchImpl = async () =>
      new Response('{}', {
        status: 401,
        headers: {
          'www-authenticate': `Bearer realm="http://plain-${secret}.example/token",service="mock"`,
        },
      });
    const client = new OCIClient(connection(), {
      fetch: fetchImpl as never,
      logger: { debug: () => {}, warn },
    });

    const res = await client.request('/v2/ansible/ee/tags/list');

    expect(res.status).toBe(401);
    const messages = warn.mock.calls.map(call => call.join(' '));
    expect(messages.some(m => m.includes('refusing non-TLS auth realm'))).toBe(
      true,
    );
    expect(messages.some(m => m.includes(secret))).toBe(false);
  });
});

describe('the token cache stays bounded', () => {
  /**
   * The cache is keyed by the registry-controlled challenge scope, so a
   * registry issuing a unique scope per response could otherwise grow it
   * without limit. After the ceiling is passed, the oldest entries are
   * evicted — observable as a fresh token exchange for a scope that was
   * cached earlier.
   */
  it('evicts the oldest entries once the registry has issued many scopes', async () => {
    const tokenHits: Record<string, number> = {};
    const fetchImpl = async (
      url: string,
      init?: { headers?: Record<string, string> },
    ) => {
      const target = new URL(url);
      if (target.pathname === '/token') {
        const scope = target.searchParams.get('scope') ?? '<none>';
        tokenHits[scope] = (tokenHits[scope] ?? 0) + 1;
        return new Response(
          JSON.stringify({ token: `t-${scope}`, expires_in: 300 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (target.pathname === '/v2/')
        return new Response('{}', { status: 200 });
      const repository = target.pathname
        .replace(/^\/v2\//, '')
        .replace(/\/tags\/list$/, '');
      const scope = `repository:${repository}:pull`;
      const challenge = {
        'www-authenticate': `Bearer realm="https://mock.registry/token",service="mock",scope="${scope}"`,
      };
      // A token scoped to another repository is rejected, as real registries
      // do — which is what makes an evicted cache entry observable.
      if (init?.headers?.Authorization !== `Bearer t-${scope}`) {
        return new Response('{}', { status: 401, headers: challenge });
      }
      return new Response(JSON.stringify({ name: repository, tags: ['a'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const client = new OCIClient(connection(), { fetch: fetchImpl as never });

    // One scope per repository: enough distinct scopes to pass the ceiling.
    for (let i = 0; i < 1_002; i++) {
      for await (const tag of client.listTags(`flood/${i}`)) void tag;
    }
    const before = tokenHits['repository:flood/0:pull'] ?? 0;

    // flood/0 was cached first, so it is the first out. Listing it again
    // must exchange a fresh token rather than use a stale cache entry.
    for await (const tag of client.listTags('flood/0')) void tag;

    expect(tokenHits['repository:flood/0:pull']).toBe(before + 1);
  });
});

describe('registry-controlled names cannot forge log lines', () => {
  it('keeps a hostile repository name on one line in error messages', async () => {
    const fetchImpl = async (url: string) => {
      const path = new URL(url).pathname;
      if (path === '/v2/') return new Response('{}', { status: 200 });
      return new Response('{}', { status: 500 });
    };
    const client = new OCIClient(connection(), { fetch: fetchImpl as never });

    let thrown: unknown;
    try {
      for await (const _tag of client.listTags('evil\n[ERROR] forged line')) {
        // drain
      }
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('evil');
    expect((thrown as Error).message).not.toContain('\n');
  });
});

describe('credential redaction', () => {
  const FAKE_PASSWORD = FAKE_CREDENTIALS.password;
  const RUNTIME_TOKEN = FAKE_CREDENTIALS.token;
  const basic = {
    type: 'basic' as const,
    username: 'u',
    password: FAKE_PASSWORD,
  };

  /** A bearer-only registry, as in the priming tests, issuing one token. */
  function bearerOnlyRegistry() {
    const fetchImpl = async (
      url: string,
      init?: { headers?: Record<string, string> },
    ) => {
      const auth = init?.headers?.Authorization;
      const path = new URL(url).pathname;
      if (path.startsWith('/v2/auth')) {
        return auth?.startsWith('Basic ')
          ? new Response(JSON.stringify({ token: RUNTIME_TOKEN }), {
              status: 200,
            })
          : new Response(JSON.stringify({ error: 'auth required' }), {
              status: 401,
            });
      }
      if (!auth) {
        return new Response('{}', {
          status: 401,
          headers: {
            'www-authenticate':
              'Bearer realm="https://mock.registry/v2/auth",service="quay"',
          },
        });
      }
      if (!auth.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'bad format' }), {
          status: 400,
        });
      }
      return new Response(JSON.stringify({ name: 'demo/ee', tags: ['dev'] }), {
        status: 200,
      });
    };
    return fetchImpl as never;
  }

  it('registers an exchanged token with the redactor the moment it arrives', async () => {
    const redactor = new CredentialRedactor();
    const client = new OCIClient(connection({ auth: basic }), {
      fetch: bearerOnlyRegistry(),
      redactor,
    });

    await client.request('/v2/demo/ee/tags/list');

    // The token is a credential the process now holds; anything that quotes
    // it later — a log line, an error — must have it recognised.
    expect(redactor.redact(`Authorization: Bearer ${RUNTIME_TOKEN}`)).toBe(
      'Authorization: Bearer [REDACTED]',
    );
  });

  it('redacts its own log lines, including priming failures', async () => {
    const lines: string[] = [];
    const client = new OCIClient(connection({ auth: basic }), {
      fetch: () =>
        Promise.reject(
          new Error(`fetch failed: socket hung up after ${FAKE_PASSWORD}`),
        ),
      logger: {
        debug: m => lines.push(m),
        warn: m => lines.push(m),
      },
    });

    await client.request('/v2/demo/ee/tags/list').catch(() => {});

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain(FAKE_PASSWORD);
    expect(lines.join('\n')).toContain('[REDACTED]');
  });

  it('redacts the messages of errors it throws', async () => {
    const client = new OCIClient(connection({ auth: basic }), {
      fetch: async () => new Response('boom', { status: 500 }),
    });

    // A repository name quoting the credential: registry-controlled input,
    // exactly the channel through which a secret could reach an error.
    await expect(
      client.getManifest(`${FAKE_PASSWORD}/ee`, 'latest'),
    ).rejects.toThrow(/manifest fetch failed for \[REDACTED\]\/ee/);
  });

  it('sanitizes registry-controlled names in manifest errors', async () => {
    const client = new OCIClient(connection({ auth: basic }), {
      fetch: async () => new Response('boom', { status: 500 }),
    });

    let error: unknown;
    try {
      await client.getManifest('evil\n[ERROR] forged', 'tag\u001b[31m');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('\n');
    expect((error as Error).message).not.toContain('\u001b');
  });

  it('strips credentials embedded in the registry URL from pull references', () => {
    const client = new OCIClient(
      connection({ url: `https://ci:${FAKE_PASSWORD}@mock.registry` }),
    );

    expect(
      client.pullReference({
        registry: 'mock',
        repository: 'ansible/ee',
        reference: 'latest',
      }),
    ).toBe('mock.registry/ansible/ee:latest');
  });
});
