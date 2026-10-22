/**
 * @jest-environment node
 *
 * Transport trust policy, proven against real TLS (AAP-96688).
 *
 * MockRegistry cannot test certificate validation: it never opens a socket.
 * These tests stand up loopback HTTPS servers with the committed certificates
 * in `testdata/` and drive `OCIClient` through its default transport — the path
 * production takes. The node environment is required because undici, loaded by
 * that default transport, depends on web globals jsdom does not provide.
 *
 * Trust is configured the way a deployment would configure it: a per-registry
 * CA bundle on the connection, not a mutation of process-global state. The
 * pinned dispatcher each connection builds trusts exactly that bundle.
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
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OCIClient } from './OCIClient';
import type { FetchLike } from './OCIClient';
import type { RegistryConnection } from './types';

const TESTDATA = join(__dirname, 'testdata');

/** The CA the test registries' certificates chain to. */
let TEST_CA = '';

beforeAll(async () => {
  TEST_CA = await readFile(join(TESTDATA, 'test-ca.pem'), 'utf8');
});

/** Every server started by a test, closed even when the test fails. */
const servers: LoopbackServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()));
});

async function certificatePair(
  name: string,
): Promise<{ cert: string; key: string }> {
  const [cert, key] = await Promise.all([
    readFile(join(TESTDATA, `${name}.pem`), 'utf8'),
    readFile(join(TESTDATA, `${name}-key.pem`), 'utf8'),
  ]);
  return { cert, key };
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

function connection(
  url: string,
  overrides: Partial<RegistryConnection> = {},
): RegistryConnection {
  return {
    name: 'tls-test',
    url,
    auth: { type: 'anonymous' },
    // Trust exactly the test CA, the way a deployment trusts its
    // organisational CA: through the connection, not ambient process state.
    ca: TEST_CA,
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

describe('certificate verification is the default', () => {
  it('connects to a registry whose certificate chains to a trusted CA', async () => {
    const server = await startServer(
      'https',
      await certificatePair('trusted-server'),
    );
    const client = new OCIClient(connection(server.url));

    expect((await client.ping()).ok).toBe(true);

    await client.dispose();
  });

  it('rejects a self-signed certificate the client does not trust', async () => {
    const server = await startServer(
      'https',
      await certificatePair('untrusted-server'),
    );
    const client = new OCIClient(connection(server.url));

    expect(await failureOf(() => client.ping())).toMatch(
      /self-signed|certificate|verify/i,
    );
  });

  it('rejects a trusted certificate that is valid for another host', async () => {
    const server = await startServer(
      'https',
      await certificatePair('wrong-host-server'),
    );
    const client = new OCIClient(connection(server.url));

    expect(await failureOf(() => client.ping())).toMatch(/altname|hostname/i);
  });

  it('rejects a trusted certificate that has expired', async () => {
    const server = await startServer(
      'https',
      await certificatePair('expired-server'),
    );
    const client = new OCIClient(connection(server.url));

    expect(await failureOf(() => client.ping())).toMatch(/expired/i);
  });

  it('still verifies after the client was disposed and rebuilt', async () => {
    const server = await startServer(
      'https',
      await certificatePair('trusted-server'),
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
    // Set elsewhere in a process for unrelated reasons — a dev portal talking
    // to a mock AAP with a self-signed certificate, for instance. It must not
    // disable verification for registry connections. The assignment below is
    // the hazard this test exists to prove the client is immune to, which is
    // the one justified use of the override the rule guards against.
    // codeql[js/disabling-certificate-validation]
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      const server = await startServer(
        'https',
        await certificatePair('untrusted-server'),
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
        await certificatePair('trusted-server'),
      );
      const goodClient = new OCIClient(connection(good.url));
      expect((await goodClient.ping()).ok).toBe(true);
      await goodClient.dispose();
    } finally {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
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
      await certificatePair('untrusted-server'),
    );
    const client = new OCIClient(connection(server.url, { insecure: false }));

    expect(await failureOf(() => client.ping())).toMatch(
      /self-signed|certificate|verify/i,
    );
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

  it('warns with the origin only, never URL credentials', () => {
    const warnings: string[] = [];
    const client = new OCIClient(
      connection('https://alice:hunter2@127.0.0.1:1', { insecure: true }),
      {
        logger: { debug: () => {}, warn: message => warnings.push(message) },
      },
    );
    expect(client.registryName).toBe('tls-test');

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('https://127.0.0.1:1');
    expect(warnings[0]).not.toContain('hunter2');
    expect(warnings[0]).not.toContain('alice:');
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

  it('admits a certificate that fails verification, without weakening others', async () => {
    const server = await startServer(
      'https',
      await certificatePair('untrusted-server'),
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
      await certificatePair('trusted-server'),
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
      await certificatePair('trusted-server'),
    );
    const source = await startServer(
      'https',
      await certificatePair('trusted-server'),
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

  it('caps a redirect chain that never terminates', async () => {
    const source = await startServer(
      'https',
      await certificatePair('trusted-server'),
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
      await certificatePair('trusted-server'),
      (req, res) => {
        seen.push(req.headers.authorization);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ tags: ['dev'] }));
      },
    );
    const source = await startServer(
      'https',
      await certificatePair('trusted-server'),
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
    expect(target.hits).toBeGreaterThan(0);
    // The redirect crossed origin (different port), so credentials must not
    // have followed it — same rule the fetch specification applies.
    expect(seen).not.toContain(expect.stringMatching(/^Basic /));

    await client.dispose();
  });

  it('follows an HTTPS to HTTP redirect when the connection opted out', async () => {
    const target = await startServer('http');
    const source = await startServer(
      'https',
      await certificatePair('trusted-server'),
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

    // The realm guard refuses the plaintext realm for an HTTPS registry
    // before the transport is even consulted, so the request comes back as
    // the original 401 rather than a transport refusal — the token exchange
    // simply never happens.
    const res = await client.request('/v2/demo/ee/tags/list');
    expect(res.status).toBe(401);
    // No request — not even the token exchange — left the process over HTTP.
    expect(fetched.some(url => url.startsWith('http://'))).toBe(false);
  });

  it('reaches a plain-HTTP token realm when the connection opted out', async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      if (new URL(url).host === 'auth.example') {
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
    const client = new OCIClient(
      connection('https://mock.registry', { insecure: true }),
      {
        fetch: fetchImpl,
      },
    );

    const res = await client.request('/v2/demo/ee/tags/list');
    expect(res.status).toBe(200);
    expect((await res.json()).tags).toEqual(['dev']);
  });

  it('refuses a pagination Link header that points at plain HTTP', async () => {
    const fetchImpl: FetchLike = async url => {
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

    const tags = client.listTags('demo/ee');
    expect((await tags.next()).value).toBe('a');
    // The link is refused client-side before any request leaves the process.
    // Either guard fires first on this URL: the origin check (an absolute URL
    // pointing away from the configured registry) or the transport policy
    // (plain HTTP without the opt-out). Both prove the same property.
    expect(await failureOf(() => tags.next())).toMatch(
      /insecure: true|not the configured registry/,
    );
  });
});
