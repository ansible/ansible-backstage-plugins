/**
 * @jest-environment node
 *
 * Transport trust policy, proven against real TLS (AAP-96688).
 *
 * MockRegistry cannot test certificate validation: it never opens a socket.
 * These tests stand up loopback HTTPS servers with certificates generated at
 * runtime by `../testing/tlsCertificates` — nothing secret is committed — and
 * drive `OCIClient` through its default transport, the path production takes.
 * The node environment is required because undici, loaded by that default
 * transport, depends on web globals jsdom does not provide.
 *
 * Trust is configured the way a deployment would configure it: a per-registry
 * CA bundle on the connection, not a mutation of process-global state. The
 * pinned dispatcher each connection builds trusts that bundle in addition to
 * the process's default roots — the default store is tried first and
 * chain-of-trust failures fall back to the bundle, so a redirect or auth
 * realm on a host the process already trusts still verifies. The
 * default-store branch itself is proven by `OCIProcessTrust.test.ts`, which
 * runs the client in a subprocess whose `NODE_EXTRA_CA_CERTS` was set before
 * startup.
 *
 * The policy under test: registry connections verify TLS certificates by
 * default and refuse plain HTTP, and the only way around either is an explicit
 * `insecure: true` on the connection, which is warned about when the client is
 * created. Every request — first hop or redirect — is covered, the check reads
 * the URL through the parser rather than a string pattern, and verification is
 * pinned so a process-wide `NODE_TLS_REJECT_UNAUTHORIZED=0` set for other
 * reasons cannot silently disable it.
 */
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { OCIClient } from './OCIClient';
import type { FetchLike } from './OCIClient';
import type { RegistryConnection } from './types';
import {
  generateTlsTestFixtures,
  type TlsTestFixtures,
} from '../testing/tlsCertificates';

let FIXTURES: TlsTestFixtures;

beforeAll(() => {
  FIXTURES = generateTlsTestFixtures();
});

/** Every server started by a test, closed even when the test fails. */
const servers: LoopbackServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()));
});

/** The certificate fixture for a named server role, generated at runtime. */
function certificatePair(
  name:
    | 'trusted-server'
    | 'untrusted-server'
    | 'wrong-host-server'
    | 'expired-server',
): { cert: string; key: string } {
  const pairs = {
    'trusted-server': FIXTURES.trustedServer,
    'untrusted-server': FIXTURES.untrustedServer,
    'wrong-host-server': FIXTURES.wrongHostServer,
    'expired-server': FIXTURES.expiredServer,
  };
  const pair = pairs[name];
  if (!pair) throw new Error(`unknown certificate fixture: ${name}`);
  return pair;
}

interface RecordedRequest {
  method: string;
  path: string;
  authorization?: string;
}

interface LoopbackServer {
  url: string;
  /** Requests that reached the server. The policy is client-side, so a refusal never appears here. */
  readonly requests: RecordedRequest[];
  readonly hits: number;
  close(): Promise<void>;
}

/**
 * Start a loopback server that records every request it serves.
 *
 * The policy under test is client-side, so refusals never appear in the
 * record — a test asserts both the refusal and `hits === 0`.
 */
async function startServer(
  scheme: 'http' | 'https',
  tls?: { cert: string; key: string },
  handler?: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<LoopbackServer> {
  const requests: RecordedRequest[] = [];
  const record = (req: IncomingMessage) => {
    requests.push({
      method: (req.method ?? 'GET').toUpperCase(),
      path: req.url ?? '/',
      authorization: req.headers.authorization,
    });
  };
  const fallback = (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/v2/' || req.url === '/v2') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{}');
  };
  const serve = (req: IncomingMessage, res: ServerResponse) => {
    record(req);
    (handler ?? fallback)(req, res);
  };
  const server = tls ? createHttpsServer(tls, serve) : createHttpServer(serve);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const loopback: LoopbackServer = {
    url: `${scheme}://127.0.0.1:${port}`,
    get requests() {
      return requests;
    },
    get hits() {
      return requests.length;
    },
    // The client holds keep-alive sockets that outlive the test, and close()
    // alone would wait for them forever.
    close: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
  servers.push(loopback);
  return loopback;
}

/** A connection to `url` trusting the test CA plus the default roots, with overrides. */
function connection(
  url: string,
  overrides: Partial<RegistryConnection> = {},
): RegistryConnection {
  return {
    name: 'tls-test',
    url,
    auth: { type: 'anonymous' },
    // Trust the test CA the way a deployment trusts its organisational CA:
    // through the connection, not ambient process state. Not combined with
    // the opt-out — the client refuses that pair, so the helper must not
    // fabricate it when a test opts out.
    ...(overrides.insecure === true ? {} : { ca: FIXTURES.ca }),
    ...overrides,
  };
}

/** The text of a failed request, including undici's underlying TLS cause. */
async function failureOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return String((error as { cause?: unknown }).cause ?? error);
  }
  throw new Error('expected the request to fail');
}

/**
 * The origin of a URL, per the URL parser — the same authority the trust
 * policy defers to. Prefix matching would let
 * `https://mock.registry.attacker.test` pose as `https://mock.registry`.
 */
function originOf(url: string): string {
  return new URL(url).origin;
}

describe('certificate verification is the default', () => {
  it('connects to a registry whose certificate chains to a trusted CA', async () => {
    const server = await startServer(
      'https',
      certificatePair('trusted-server'),
    );
    const client = new OCIClient(connection(server.url));

    expect((await client.ping()).ok).toBe(true);

    await client.dispose();
  });

  it('rejects a self-signed certificate the client does not trust', async () => {
    const server = await startServer(
      'https',
      certificatePair('untrusted-server'),
    );
    const client = new OCIClient(connection(server.url));

    expect(await failureOf(() => client.ping())).toMatch(
      /self-signed|certificate|verify/i,
    );
  });

  it('rejects a trusted certificate that is valid for another host', async () => {
    const server = await startServer(
      'https',
      certificatePair('wrong-host-server'),
    );
    const client = new OCIClient(connection(server.url));

    expect(await failureOf(() => client.ping())).toMatch(/altname|hostname/i);
  });

  it('rejects a trusted certificate that has expired', async () => {
    const server = await startServer(
      'https',
      certificatePair('expired-server'),
    );
    const client = new OCIClient(connection(server.url));

    expect(await failureOf(() => client.ping())).toMatch(/expired/i);
  });

  it('still verifies after the client was disposed and rebuilt', async () => {
    const server = await startServer(
      'https',
      certificatePair('trusted-server'),
    );
    const client = new OCIClient(connection(server.url));
    expect((await client.ping()).ok).toBe(true);

    await client.dispose();
    expect((await client.ping()).ok).toBe(true);

    await client.dispose();
  });
});

describe('verification is pinned against process-wide overrides', () => {
  it('rejects an untrusted certificate even with NODE_TLS_REJECT_UNAUTHORIZED=0', async () => {
    // The assignment below deliberately disables certificate validation
    // process-wide — flagged by CodeQL (js/disabling-certificate-validation)
    // and dismissed as "used in tests". It is the entire point of this
    // regression test: the variable is set elsewhere in a process for
    // unrelated reasons — a dev portal talking to a mock AAP with a
    // self-signed certificate, for instance — and the pinned dispatcher each
    // connection builds must keep rejecting untrusted certificates anyway.
    // The previous value is saved and restored below, absence included.
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      const server = await startServer(
        'https',
        certificatePair('untrusted-server'),
      );
      const client = new OCIClient(connection(server.url));

      expect(await failureOf(() => client.ping())).toMatch(
        /self-signed|certificate|verify/i,
      );
      await client.dispose();

      // And verification still *works* under the override — the policy is
      // pinned, not merely failing closed: a good certificate connects.
      const good = await startServer(
        'https',
        certificatePair('trusted-server'),
      );
      const goodClient = new OCIClient(connection(good.url));
      expect((await goodClient.ping()).ok).toBe(true);
      await goodClient.dispose();
    } finally {
      // Restore exactly what was there — including absence: other suites in
      // this process may depend on either state.
      if (previous === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
      }
    }
  });
});

describe('plain HTTP is refused without the opt-out', () => {
  it('refuses before any request leaves the process', async () => {
    const server = await startServer('http');
    const client = new OCIClient(connection(server.url));

    expect(await failureOf(() => client.ping())).toMatch(/insecure: true/);
    expect(server.hits).toBe(0);
  });

  it('refuses a backslash variant of a plain-HTTP URL', async () => {
    // `http:\\host` is not `http://host` as a string, but the URL parser
    // normalises the backslashes and the request would leave over plain HTTP.
    const server = await startServer('http');
    const client = new OCIClient(
      connection(`http:\\\\127.0.0.1:${server.url.split(':').pop()}`),
    );

    expect(await failureOf(() => client.ping())).toMatch(/insecure: true/);
    expect(server.hits).toBe(0);
  });

  it('refuses an uppercase scheme', async () => {
    const server = await startServer('http');
    const port = server.url.split(':').pop();
    const client = new OCIClient(connection(`HTTP://127.0.0.1:${port}`));

    expect(await failureOf(() => client.ping())).toMatch(/insecure: true/);
    expect(server.hits).toBe(0);
  });

  it('admits plain HTTP when the connection opted out', async () => {
    const server = await startServer('http');
    const client = new OCIClient(connection(server.url, { insecure: true }));

    expect((await client.ping()).ok).toBe(true);

    await client.dispose();
  });
});

describe('insecure: false is as strict as the default', () => {
  it('refuses plain HTTP when explicitly false', async () => {
    const server = await startServer('http');
    const client = new OCIClient(connection(server.url, { insecure: false }));

    expect(await failureOf(() => client.ping())).toMatch(/insecure: true/);
    expect(server.hits).toBe(0);
  });

  it('rejects an untrusted certificate when explicitly false', async () => {
    const server = await startServer(
      'https',
      certificatePair('untrusted-server'),
    );
    const client = new OCIClient(connection(server.url, { insecure: false }));

    expect(await failureOf(() => client.ping())).toMatch(
      /self-signed|certificate|verify/i,
    );
  });
});

describe('a CA bundle and the opt-out cannot be combined', () => {
  it('refuses a connection that sets both', () => {
    // The same refusal the config layer makes at startup: a bundle to verify
    // against and an opt-out of verification contradict each other, and one
    // of them is always a mistake. The client enforces it too, so a
    // programmatically constructed connection cannot slip the pair through.
    expect(
      () =>
        new OCIClient(
          connection('https://127.0.0.1:1', {
            insecure: true,
            ca: FIXTURES.ca,
          }),
        ),
    ).toThrow(/ca.*insecure|insecure.*ca/);
  });

  it('accepts the bundle on its own, the opt-out on its own, and an explicit insecure: false', () => {
    // Three legitimate configurations must keep working: verification
    // against a bundle, the auditable opt-out, and verification with the
    // opt-out explicitly (redundantly) switched off.
    expect(
      () => new OCIClient(connection('https://127.0.0.1:1')),
    ).not.toThrow();
    expect(
      () =>
        new OCIClient(connection('https://127.0.0.1:1', { insecure: true })),
    ).not.toThrow();
    expect(
      () =>
        new OCIClient(connection('https://127.0.0.1:1', { insecure: false })),
    ).not.toThrow();
  });
});

describe('insecure: true is explicit and auditable', () => {
  it('warns when the client is created', () => {
    const warnings: string[] = [];
    const client = new OCIClient(
      connection('https://127.0.0.1:1', { insecure: true }),
      {
        logger: { debug: () => {}, warn: message => warnings.push(message) },
      },
    );

    expect(client.registryName).toBe('tls-test');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('tls-test');
    expect(warnings[0]).toMatch(/insecure/i);
  });

  it('warns without URL data at all', () => {
    const warnings: string[] = [];
    const client = new OCIClient(
      connection('https://alice:hunter2@127.0.0.1:1', { insecure: true }),
      {
        logger: { debug: () => {}, warn: message => warnings.push(message) },
      },
    );
    expect(client.registryName).toBe('tls-test');

    // The warning names the registry and nothing else: the URL may name a
    // private host or carry credentials, and warnings are logged.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('tls-test');
    expect(warnings[0]).not.toContain('127.0.0.1');
    expect(warnings[0]).not.toContain('alice');
    expect(warnings[0]).not.toContain('hunter2');
  });

  it('refuses a plain-HTTP URL without echoing its credentials', async () => {
    const server = await startServer('http');
    const port = server.url.split(':').pop();
    const client = new OCIClient(
      connection(`http://alice:hunter2@127.0.0.1:${port}`),
    );

    const failure = await failureOf(() => client.ping());
    expect(failure).toMatch(/insecure: true/);
    expect(failure).not.toContain('hunter2');
    expect(failure).toContain('***@');
    expect(server.hits).toBe(0);
  });

  it('refuses a plain-HTTP URL without echoing its query or fragment', async () => {
    const server = await startServer('http');
    const port = server.url.split(':').pop();
    const client = new OCIClient(
      connection(`http://127.0.0.1:${port}/?token=hunter2#section`),
    );

    // Query strings and fragments can carry tokens, and errors are logged.
    const failure = await failureOf(() => client.ping());
    expect(failure).toMatch(/insecure: true/);
    expect(failure).not.toContain('hunter2');
    expect(failure).not.toContain('token=');
    expect(server.hits).toBe(0);
  });

  it('admits a certificate that fails verification, without weakening others', async () => {
    const server = await startServer(
      'https',
      certificatePair('untrusted-server'),
    );
    const strict = new OCIClient(connection(server.url));
    const optedOut = new OCIClient(connection(server.url, { insecure: true }));

    expect((await optedOut.ping()).ok).toBe(true);
    expect(await failureOf(() => strict.ping())).toMatch(
      /self-signed|certificate|verify/i,
    );

    await optedOut.dispose();
  });
});

describe('redirects cannot downgrade the transport', () => {
  it('refuses an HTTPS to HTTP redirect before any request leaves the process', async () => {
    const target = await startServer('http');
    const source = await startServer(
      'https',
      certificatePair('trusted-server'),
      (_req, res) => {
        res.writeHead(302, { location: `${target.url}/v2/` });
        res.end();
      },
    );
    const client = new OCIClient(connection(source.url));

    expect(await failureOf(() => client.ping())).toMatch(/insecure: true/);
    expect(target.hits).toBe(0);

    await client.dispose();
  });

  it('follows an HTTPS to HTTPS redirect', async () => {
    const target = await startServer(
      'https',
      certificatePair('trusted-server'),
    );
    const source = await startServer(
      'https',
      certificatePair('trusted-server'),
      (_req, res) => {
        res.writeHead(302, { location: `${target.url}/v2/` });
        res.end();
      },
    );
    const client = new OCIClient(connection(source.url));

    expect((await client.ping()).ok).toBe(true);
    expect(target.hits).toBeGreaterThan(0);

    await client.dispose();
  });

  it('rejects a cross-origin redirect to a host neither trust store covers', async () => {
    // The additive-trust regression test: a bundle that replaced the default
    // store also replaced it for redirect targets, so a registry that
    // redirected to an unrelated host failed for the wrong reason. With
    // additive trust the target is still refused here — it chains to neither
    // the bundle nor the process's default roots — and refused *before* any
    // request leaves the process.
    const target = await startServer(
      'https',
      certificatePair('untrusted-server'),
    );
    const source = await startServer(
      'https',
      certificatePair('trusted-server'),
      (_req, res) => {
        res.writeHead(302, { location: `${target.url}/v2/` });
        res.end();
      },
    );
    const client = new OCIClient(connection(source.url));

    expect(await failureOf(() => client.ping())).toMatch(
      /self-signed|certificate|verify/i,
    );
    expect(target.hits).toBe(0);

    await client.dispose();
  });

  it('caps a redirect chain that never terminates', async () => {
    const source = await startServer(
      'https',
      certificatePair('trusted-server'),
      (_req, res) => {
        res.writeHead(302, { location: '/v2/' });
        res.end();
      },
    );
    const client = new OCIClient(connection(source.url));

    expect(await failureOf(() => client.ping())).toMatch(/too many redirects/i);
  });

  it('drops credentials when a redirect crosses origin', async () => {
    const seen: Array<string | undefined> = [];
    const target = await startServer(
      'https',
      certificatePair('trusted-server'),
      (req, res) => {
        seen.push(req.headers.authorization);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ tags: ['dev'] }));
      },
    );
    const source = await startServer(
      'https',
      certificatePair('trusted-server'),
      (_req, res) => {
        res.writeHead(302, { location: `${target.url}/v2/demo/ee/tags/list` });
        res.end();
      },
    );
    const client = new OCIClient(
      connection(source.url, {
        auth: { type: 'basic', username: 'alice', password: 'hunter2' },
      }),
    );

    const res = await client.request('/v2/demo/ee/tags/list');
    expect(res.status).toBe(200);
    // Requests reached the target, and none carried credentials: the redirect
    // crossed origin (different port), so credentials must not have followed
    // it — same rule the fetch specification applies.
    expect(seen.length).toBeGreaterThan(0);
    for (const authorization of seen) {
      expect(authorization).toBeUndefined();
    }

    await client.dispose();
  });

  it('follows an HTTPS to HTTP redirect when the connection opted out', async () => {
    const target = await startServer('http');
    const source = await startServer(
      'https',
      certificatePair('trusted-server'),
      (_req, res) => {
        res.writeHead(302, { location: `${target.url}/v2/` });
        res.end();
      },
    );
    const client = new OCIClient(connection(source.url, { insecure: true }));

    expect((await client.ping()).ok).toBe(true);
    expect(target.hits).toBeGreaterThan(0);

    await client.dispose();
  });

  it.each([true, false])(
    'handles mixed-case Authorization on redirects (cross-origin=%s)',
    async crossOrigin => {
      const target = await startServer(
        'https',
        certificatePair('trusted-server'),
      );
      const source = await startServer(
        'https',
        certificatePair('trusted-server'),
        (req, res) => {
          if (req.url === '/v2/' || req.url === '/done') {
            res.writeHead(200);
          } else {
            res.writeHead(302, {
              location: crossOrigin ? `${target.url}/v2/` : '/done',
            });
          }
          res.end('{}');
        },
      );
      const headers = { aUtHoRiZaTiOn: 'Bearer caller-token' };
      const client = new OCIClient(connection(source.url));
      try {
        const res = await client.request('/v2/demo/ee/tags/list', { headers });

        expect(res.status).toBe(200);
        const initial = source.requests.find(
          entry => entry.path === '/v2/demo/ee/tags/list',
        );
        expect(initial?.authorization).toBe('Bearer caller-token');
        const redirected = crossOrigin
          ? target.requests
          : source.requests.filter(entry => entry.path === '/done');
        expect(redirected.length).toBeGreaterThan(0);
        for (const entry of redirected) {
          expect(entry.authorization).toBe(
            crossOrigin ? undefined : 'Bearer caller-token',
          );
        }
        expect(headers).toEqual({ aUtHoRiZaTiOn: 'Bearer caller-token' });
      } finally {
        await client.dispose();
      }
    },
  );
});

describe('the redirect policy covers injected transports too', () => {
  it('refuses an HTTPS to HTTP redirect issued through an injected fetch', async () => {
    const fetched: string[] = [];
    const redirects: Array<string | undefined> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      fetched.push(url);
      redirects.push(init?.redirect);
      return new Response(null, {
        status: 302,
        headers: { location: 'http://attacker.example/v2/' },
      });
    };
    const client = new OCIClient(connection('https://mock.registry'), {
      fetch: fetchImpl,
    });

    expect(await failureOf(() => client.ping())).toMatch(/insecure: true/);
    // The injected transport is asked to follow redirects manually — the
    // policy cannot see hops a transport follows on its own — and no request
    // left the process over HTTP.
    expect(redirects).toEqual(['manual']);
    expect(fetched.every(url => new URL(url).protocol === 'https:')).toBe(true);
  });

  it('follows an HTTPS to HTTPS redirect issued through an injected fetch', async () => {
    const fetched: string[] = [];
    const fetchImpl: FetchLike = async url => {
      fetched.push(url);
      if (fetched.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://mock.registry/v2-real/' },
        });
      }
      return new Response('{}', { status: 200 });
    };
    const client = new OCIClient(connection('https://mock.registry'), {
      fetch: fetchImpl,
    });

    expect((await client.ping()).ok).toBe(true);
    expect(fetched).toEqual([
      'https://mock.registry/v2/',
      'https://mock.registry/v2-real/',
    ]);
  });

  it('caps a redirect chain issued through an injected fetch', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://mock.registry/loop' },
      });
    const client = new OCIClient(connection('https://mock.registry'), {
      fetch: fetchImpl,
    });

    expect(await failureOf(() => client.ping())).toMatch(/too many redirects/i);
  });

  it('drops credentials when an injected-fetch redirect crosses origin', async () => {
    const seen: Array<{ url: string; authorization?: string }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      seen.push({ url, authorization: init?.headers?.Authorization });
      const origin = originOf(url);
      if (origin === 'https://mock.registry') {
        return new Response(null, {
          status: 302,
          headers: {
            location: 'https://other.example/v2/demo/ee/tags/list',
          },
        });
      }
      if (origin === 'https://other.example') {
        return new Response(JSON.stringify({ tags: ['dev'] }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      // Answering an unexpected origin would let a misrouted request — or a
      // prefix-match bug — pass unnoticed.
      throw new Error(`unexpected origin in test transport: ${origin}`);
    };
    const client = new OCIClient(
      connection('https://mock.registry', {
        auth: { type: 'basic', username: 'alice', password: 'hunter2' },
      }),
      { fetch: fetchImpl },
    );

    const res = await client.request('/v2/demo/ee/tags/list');
    expect(res.status).toBe(200);
    // The credential was presented to the configured registry only, and no
    // request to the other origin carried one.
    const withCredentials = seen.filter(entry => entry.authorization);
    expect(withCredentials).toHaveLength(1);
    expect(withCredentials[0].url).toBe(
      'https://mock.registry/v2/demo/ee/tags/list',
    );
    const afterRedirect = seen.filter(
      entry => originOf(entry.url) === 'https://other.example',
    );
    expect(afterRedirect.length).toBeGreaterThan(0);
    for (const entry of afterRedirect) {
      expect(entry.authorization).toBeUndefined();
    }
  });
});

describe('the policy covers every request the client issues', () => {
  it('refuses a bearer realm advertised over plain HTTP', async () => {
    const fetched: string[] = [];
    const fetchImpl: FetchLike = async url => {
      fetched.push(url);
      return new Response('{}', {
        status: 401,
        headers: {
          'www-authenticate': 'Bearer realm="http://auth.example/token"',
        },
      });
    };
    const client = new OCIClient(connection('https://mock.registry'), {
      fetch: fetchImpl,
    });

    // This client goes further than refusing the transport: its token
    // exchange refuses a plain-HTTP realm for an HTTPS registry outright,
    // so the request completes — as a 401 — without any request, not even
    // the token exchange, leaving the process over HTTP.
    const res = await client.request('/v2/demo/ee/tags/list');
    expect(res.status).toBe(401);
    expect(fetched.some(url => new URL(url).protocol === 'http:')).toBe(false);
  });

  it('reaches a plain-HTTP token realm when the connection opted out', async () => {
    const fetched: string[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      fetched.push(url);
      if (originOf(url) === 'http://auth.example') {
        return new Response(JSON.stringify({ token: 'issued' }));
      }
      if (init?.headers?.Authorization) {
        return new Response(JSON.stringify({ tags: ['dev'] }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', {
        status: 401,
        headers: {
          'www-authenticate': 'Bearer realm="http://auth.example/token"',
        },
      });
    };
    // A plain-HTTP registry with the opt-out set: the only configuration in
    // which a plain-HTTP token realm is legitimate — same-transport trust.
    const client = new OCIClient(
      connection('http://mock.registry', { insecure: true }),
      {
        fetch: fetchImpl,
      },
    );

    const res = await client.request('/v2/demo/ee/tags/list');
    expect(res.status).toBe(200);
    expect((await res.json()).tags).toEqual(['dev']);
    expect(fetched.some(url => originOf(url) === 'http://auth.example')).toBe(
      true,
    );
  });

  it('refuses a pagination Link header that points away from the registry', async () => {
    const fetched: string[] = [];
    const fetchImpl: FetchLike = async url => {
      fetched.push(url);
      if (url.includes('/tags/list')) {
        return new Response(JSON.stringify({ tags: ['a'] }), {
          headers: {
            link: '<http://attacker.example/next>; rel="next"',
            'content-type': 'application/json',
          },
        });
      }
      return new Response('{}', { status: 404 });
    };
    const client = new OCIClient(connection('https://mock.registry'), {
      fetch: fetchImpl,
    });

    // The absolute URL is refused before the transport policy even sees it:
    // a pagination Link may only point back at the configured registry.
    const tags = client.listTags('demo/ee');
    expect((await tags.next()).value).toBe('a');
    expect(await failureOf(() => tags.next())).toMatch(
      /not the configured registry/,
    );
    expect(
      fetched.some(url => originOf(url) === 'http://attacker.example'),
    ).toBe(false);
  });
});
