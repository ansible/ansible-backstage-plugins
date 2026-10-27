import express from 'express';
import request from 'supertest';
import { ContentIndex } from './ContentIndex';
import { createRouter } from './router';

const logger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {},
  child: () => logger,
} as never;

async function appWith(index: ContentIndex, httpAuth?: unknown) {
  const app = express();
  app.use(
    await createRouter({
      index,
      logger,
      httpAuth: (httpAuth ?? {
        // Permissive by default: the credentials barrier, not the router, is
        // what these tests exercise elsewhere.
        credentials: () => Promise.resolve({}),
      }) as never,
    }),
  );
  // Mirrors the backend's root error handler, which maps a rejected
  // `httpAuth.credentials` call to a 401 rather than a 500.
  app.use(
    (
      _err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(401).json({ error: 'unauthenticated' });
    },
  );
  return app;
}

/**
 * Seed the index without touching a registry.
 *
 * The private fields are written directly because the point of these tests is the HTTP
 * contract, not discovery — which has its own coverage.
 */
function seed(items: Array<Record<string, unknown>>): ContentIndex {
  const index = new ContentIndex([], {
    info: () => {},
    warn: () => {},
    debug: () => {},
  });
  const artifact = {
    ref: 'reg/repo@sha256:abc',
    type: 'execution-environment',
    registry: 'reg',
    repository: 'repo',
    digest: 'sha256:abc',
    tags: ['latest'],
    pullReference: 'reg/repo@sha256:abc',
    contentsKnown: true,
    classification: {
      type: 'execution-environment',
      confidence: 'certain',
      signals: [],
    },
    manifest: { collections: [], generatedBy: {}, complete: true },
  };
  (index as unknown as { artifacts: unknown[] }).artifacts = [artifact];
  const map = new Map<string, unknown>();
  for (const item of items) {
    map.set(`${artifact.ref}::${item.fqcn}`, {
      key: `${artifact.ref}::${item.fqcn}`,
      artifactRef: artifact.ref,
      collection: 'cisco.ios',
      collectionVersion: '1.0.0',
      ...item,
    });
  }
  (index as unknown as { items: Map<string, unknown> }).items = map;
  return index;
}

describe('documentation field normalisation', () => {
  /**
   * ansible-doc emits `description`, `author` and `notes` as either a scalar or a list
   * depending on how each collection author wrote the YAML. The API declares arrays, so
   * it must deliver arrays — a consumer that trusts the contract crashed on this.
   */
  it('coerces a string description to an array', async () => {
    const index = seed([
      {
        fqcn: 'cisco.ios.ios_acls',
        name: 'ios_acls',
        type: 'module',
        detail: { description: 'Resource module to configure ACLs.' },
      },
    ]);
    const res = await request(await appWith(index)).get(
      '/content-items/cisco.ios.ios_acls',
    );

    expect(res.status).toBe(200);
    expect(res.body.description).toEqual([
      'Resource module to configure ACLs.',
    ]);
  });

  it('coerces a string author to an array', async () => {
    const index = seed([
      {
        fqcn: 'ansible.netcommon.parse_cli',
        name: 'parse_cli',
        type: 'filter',
        detail: { author: 'Ansible Network Team' },
      },
    ]);
    const res = await request(await appWith(index)).get(
      '/content-items/ansible.netcommon.parse_cli',
    );

    expect(res.body.author).toEqual(['Ansible Network Team']);
  });

  it('leaves genuine arrays untouched', async () => {
    const index = seed([
      {
        fqcn: 'cisco.ios.ios_vlans',
        name: 'ios_vlans',
        type: 'module',
        detail: { description: ['line one', 'line two'], author: ['A', 'B'] },
      },
    ]);
    const res = await request(await appWith(index)).get(
      '/content-items/cisco.ios.ios_vlans',
    );

    expect(res.body.description).toEqual(['line one', 'line two']);
    expect(res.body.author).toEqual(['A', 'B']);
  });

  it('omits the field entirely when absent, rather than emitting null', async () => {
    const index = seed([
      { fqcn: 'cisco.ios.ios', name: 'ios', type: 'cliconf', detail: {} },
    ]);
    const res = await request(await appWith(index)).get(
      '/content-items/cisco.ios.ios',
    );

    expect('description' in res.body).toBe(false);
    expect(res.body.fqcn).toBe('cisco.ios.ios');
  });

  it('always returns providedBy as an array', async () => {
    const index = seed([
      {
        fqcn: 'cisco.ios.ios_vlans',
        name: 'ios_vlans',
        type: 'module',
        detail: {},
      },
    ]);
    const res = await request(await appWith(index)).get(
      '/content-items/cisco.ios.ios_vlans',
    );

    expect(Array.isArray(res.body.providedBy)).toBe(true);
    expect(res.body.providedBy).toContain('reg/repo@sha256:abc');
  });
});

describe('GET /health', () => {
  it('returns an ok status for a liveness check', async () => {
    const index = seed([]);
    const res = await request(await appWith(index)).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('registry mutation authentication', () => {
  /**
   * The `/registries` prefix carries an unauthenticated policy so `GET /registries`
   * stays inspectable. Backstage matches policies as path prefixes with no method
   * awareness, so the mutating sub-routes must enforce credentials themselves.
   */
  it('rejects an unauthenticated poll of a registry', async () => {
    const index = seed([]);
    const httpAuth = {
      credentials: jest.fn().mockRejectedValue(new Error('unauthenticated')),
    };
    const res = await request(await appWith(index, httpAuth as never)).post(
      '/registries/reg/poll',
    );

    expect(res.status).toBe(401);
    expect(httpAuth.credentials).toHaveBeenCalledWith(expect.anything(), {
      allow: ['user', 'service'],
    });
  });

  it('rejects an unauthenticated sync of a registry', async () => {
    // Both mutating sub-routes must enforce credentials, not just poll — an
    // anonymous caller must not be able to trigger a full registry re-read.
    const index = seed([]);
    const httpAuth = {
      credentials: jest.fn().mockRejectedValue(new Error('unauthenticated')),
    };
    const res = await request(await appWith(index, httpAuth as never)).post(
      '/registries/reg/sync',
    );

    expect(res.status).toBe(401);
  });

  it('proceeds to the registry lookup once credentials are accepted', async () => {
    // Enforcement must not overreach: an authenticated caller still gets the
    // normal 404 for an unknown registry, not an auth error.
    const index = seed([]);
    const res = await request(await appWith(index)).post(
      '/registries/reg/poll',
    );

    // Authentication passed; the 404 is the "no such registry" answer.
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('REGISTRY_NOT_FOUND');
  });
});

describe('configuration boundary', () => {
  /**
   * An index holding a real configured registry, so mutation attempts target a
   * name that exists. Against an empty index, a future edit implementation
   * could answer 404 ("no such registry") and satisfy a weaker test.
   */
  function seedWithRegistry(): ContentIndex {
    return new ContentIndex(
      [
        {
          name: 'reg',
          url: 'https://reg.example',
          auth: { type: 'anonymous' },
        },
      ],
      { info: () => {}, warn: () => {}, debug: () => {} },
    );
  }

  /**
   * Registry endpoints are install-time configuration, and that is the SSRF trust
   * boundary: the API may inspect and re-read them, but must offer no way to create
   * or edit one. If a mutating route ever appears here, this test failing is the
   * reminder that it widens the boundary the security review approved.
   */
  it('offers no route that creates or edits a registry at runtime', async () => {
    const app = await appWith(seedWithRegistry());

    // The target registry exists — the assertions below cannot be satisfied
    // by a "no such registry" 404 from a future edit implementation.
    const before = await request(app).get('/registries');
    expect(before.body.items).toEqual([
      expect.objectContaining({ name: 'reg', url: 'https://reg.example' }),
    ]);

    const hostile = { name: 'evil', url: 'https://evil.example' };
    const created = await request(app).post('/registries').send(hostile);
    const replaced = await request(app).put('/registries/reg').send(hostile);
    const patched = await request(app).patch('/registries/reg').send(hostile);

    expect(created.status).toBe(404);
    expect(replaced.status).toBe(404);
    expect(patched.status).toBe(404);

    // Nothing changed: no new registry appeared, and the existing one kept its
    // configured endpoint.
    const after = await request(app).get('/registries');
    expect(after.body).toEqual(before.body);
  });

  it('flags a registry URL with a non-HTTP scheme', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [{ name: 'quay', url: 'ftp://quay.io' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: 'registries[0].url',
        message: expect.stringContaining('must start with http:// or https://'),
      }),
    );
  });

  it('flags a registry URL with no scheme at all', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [{ name: 'quay', url: 'quay.io' }],
      });

    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: 'registries[0].url',
        message: expect.stringContaining('is not a valid absolute URL'),
      }),
    );
  });

  /**
   * Parity with the loader: these strings previously sailed through this
   * endpoint as `valid: true` while preventing startup, because the two
   * boundaries used different rules.
   */
  it.each(['https://', 'https://quay.io:99999'])(
    'rejects %s, which the loader also rejects at startup',
    async badUrl => {
      const res = await request(await appWith(seed([])))
        .post('/config/validate')
        .send({
          apiVersion: 'content.ansible.com/v1',
          kind: 'ContentConfiguration',
          registries: [{ name: 'quay', url: badUrl }],
        });

      expect(res.body.valid).toBe(false);
      expect(res.body.errors).toContainEqual(
        expect.objectContaining({ path: 'registries[0].url' }),
      );
    },
  );

  it('accepts an uppercase scheme, matching the loader (which canonicalizes it)', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [{ name: 'quay', url: 'HTTPS://QUAY.IO' }],
      });

    expect(res.body.valid).toBe(true);
    expect(res.body.errors).toEqual([]);
  });

  it('flags embedded credentials and query suffixes, like the loader', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [
          { name: 'a', url: 'https://user:pass@quay.io' },
          { name: 'b', url: 'https://quay.io?junk=true' },
        ],
      });

    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: 'registries[0].url',
        message: expect.stringContaining('must not embed credentials'),
      }),
    );
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: 'registries[1].url',
        message: expect.stringContaining(
          'must not include a query or fragment',
        ),
      }),
    );
  });

  it('reports a non-object registry entry as a validation error, not a crash', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [null],
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: 'registries[0]',
        message: 'Must be an object',
      }),
    );
  });

  it('reports a non-string URL as a validation error, not a crash', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [{ name: 'quay', url: 123 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: 'registries[0].url',
        message: 'Required and must be a string',
      }),
    );
  });

  it('reports duplicate registry names, which would be ambiguous endpoints', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [
          { name: 'quay', url: 'https://quay.io' },
          { name: 'quay', url: 'https://quay.example' },
        ],
      });

    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: 'registries[1].name',
        message: expect.stringContaining('Duplicate'),
      }),
    );
  });

  it('accepts a well-formed configuration and only warns about insecure registries', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send({
        apiVersion: 'content.ansible.com/v1',
        kind: 'ContentConfiguration',
        registries: [
          { name: 'local', url: 'http://localhost:5000', insecure: true },
          {
            name: 'quay',
            url: 'https://quay.io',
            repositories: ['ansible/ee'],
          },
        ],
      });

    expect(res.body.valid).toBe(true);
    expect(res.body.errors).toEqual([]);
    expect(res.body.warnings).toContainEqual(
      expect.objectContaining({
        path: 'registries[0].insecure',
        message: expect.stringContaining('Plain HTTP'),
      }),
    );
  });
});
