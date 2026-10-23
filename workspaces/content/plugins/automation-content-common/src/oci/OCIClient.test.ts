import { OCIClient, nextLink } from './OCIClient';
import { ImageManifest, MediaTypes, RegistryConnection } from './types';
import {
  MockRegistry,
  makeImage,
  makeLabelledImage,
} from '../testing/MockRegistry';

const HOST = 'https://mock.registry';

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
    expect(seen.every(r => r.url.startsWith('https://mock.registry'))).toBe(
      true,
    );
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
