import express from 'express';
import request from 'supertest';
import { ContentIndex } from './ContentIndex';
import { createRouter, RECONCILE_FAILURE_SUMMARY } from './router';

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
        credentials: () =>
          Promise.resolve({
            principal: { type: 'user', userEntityRef: 'user:default/test' },
          }),
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

describe('reconcile state', () => {
  it('reports never-reconciled rather than inventing a timestamp', async () => {
    const index = seed([]);
    const res = await request(await appWith(index)).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.refreshedAt).toBeUndefined();
  });
});

describe('public diagnostics are summarised', () => {
  /**
   * An index with one registry whose last reconciliation — and drift check —
   * failed the way a TLS rejection would: the error text quotes hostnames
   * from the certificate's subject alternative names.
   *
   * `GET /registries` and `GET /health` are readable without credentials, so
   * neither may carry that detail; the fixed summary must be all an
   * anonymous caller learns. The private fields are written directly because
   * the point of these tests is the HTTP contract, not discovery.
   */
  function indexWithFailedReconcile(): ContentIndex {
    const connection = {
      name: 'corporate',
      url: 'https://registry.corp.example.com',
      auth: { type: 'anonymous' },
    };
    const index = new ContentIndex([connection as never], {
      info: () => {},
      warn: () => {},
      debug: () => {},
    });
    const internals = index as unknown as {
      reconcile: Map<string, unknown>;
      drift: Map<string, unknown>;
    };
    internals.reconcile.set('corporate', {
      at: '2026-10-22T00:00:00.000Z',
      ok: false,
      error:
        `repository listing failed: fetch failed: Hostname/IP does not match ` +
        `certificate's altnames: Hostname: registry.corp.example.com. is not ` +
        `in cert's altnames: DNS:secret-host.internal`,
      artifacts: 2,
    });
    internals.drift.set('corporate', {
      at: '2026-10-22T00:00:00.000Z',
      changed: false,
      details: ['check failed: connection refused from 10.1.2.3'],
      requests: 3,
    });
    return index;
  }

  it('replaces the reconcile error with the fixed summary on /registries', async () => {
    const res = await request(await appWith(indexWithFailedReconcile())).get(
      '/registries',
    );

    expect(res.status).toBe(200);
    const corporate = res.body.items.find(
      (item: { name: string }) => item.name === 'corporate',
    );
    // Status, timestamp, and counts stay; the cause does not.
    expect(corporate.lastReconcileOk).toBe(false);
    expect(corporate.lastReconciledAt).toBe('2026-10-22T00:00:00.000Z');
    expect(corporate.lastReconcileError).toBe(RECONCILE_FAILURE_SUMMARY);
    // No certificate subjects, SANs, or internal hostnames leak: the
    // registry's own URL is configuration this route serves on purpose;
    // everything beyond it is diagnostic detail.
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('secret-host.internal');
    expect(body).not.toContain('altnames');
    expect(body).not.toContain('10.1.2.3');
  });

  it('summarises the error and drops drift details on /health', async () => {
    const res = await request(await appWith(indexWithFailedReconcile())).get(
      '/health',
    );

    expect(res.status).toBe(200);
    const corporate = res.body.registries.find(
      (item: { name: string }) => item.name === 'corporate',
    );
    expect(corporate.lastReconcileOk).toBe(false);
    expect(corporate.lastReconcileError).toBe(RECONCILE_FAILURE_SUMMARY);
    expect(corporate.artifacts).toBe(2);
    // The drift view keeps when, whether, and what it cost — not the
    // human-readable differences, which can quote transport errors.
    expect(corporate.drift).toBeDefined();
    expect(corporate.drift.changed).toBe(false);
    expect(corporate.drift.requests).toBe(3);
    expect(corporate.drift.details).toBeUndefined();
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('secret-host.internal');
    expect(body).not.toContain('altnames');
    expect(body).not.toContain('10.1.2.3');
  });

  it('keeps the detailed cause on the authenticated sync response', async () => {
    const index = indexWithFailedReconcile();
    // A live sync of the same registry fails with a detailed cause, the way
    // a TLS rejection would: the authenticated response must carry it.
    const clients = (
      index as unknown as { clients: Map<string, { fetchImpl: unknown }> }
    ).clients;
    (clients.get('corporate') as unknown as { fetchImpl: unknown }).fetchImpl =
      () => Promise.reject(new Error('fetch failed: certificate has expired'));

    const res = await request(await appWith(index)).post(
      '/registries/corporate/sync',
    );

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('failed');
    expect(res.body.error).toContain('certificate has expired');
  });

  it.each(['none', 'user', 'service'])(
    'controls global sync diagnostics for a %s principal',
    async type => {
      const index = indexWithFailedReconcile();
      const clients = (
        index as unknown as { clients: Map<string, { fetchImpl: unknown }> }
      ).clients;
      const detail =
        'certificate altnames: DNS:secret-host.internal (10.1.2.3)';
      (clients.get('corporate') as { fetchImpl: unknown }).fetchImpl = () =>
        Promise.reject(new Error(detail));
      const httpAuth = {
        credentials: jest.fn().mockResolvedValue({ principal: { type } }),
      };

      const res = await request(await appWith(index, httpAuth)).post('/sync');

      expect(res.status).toBe(207);
      expect(res.body.status).toBe('partial');
      expect(httpAuth.credentials).toHaveBeenCalledWith(expect.anything(), {
        allow: ['none', 'user', 'service'],
      });
      const outcome = res.body.registries[0];
      expect(outcome.ok).toBe(false);
      const internalError = index.reconcileStateFor('corporate')?.error;
      const expectedError =
        type === 'none' ? RECONCILE_FAILURE_SUMMARY : internalError;
      expect(outcome.error).toBe(expectedError);
      const body = JSON.stringify(res.body);
      for (const privateText of [
        'secret-host.internal',
        'altnames',
        '10.1.2.3',
      ]) {
        expect(body.includes(privateText)).toBe(type !== 'none');
      }
      // Response sanitization must not erase the operator's diagnostic state.
      expect(internalError).toContain(detail);
    },
  );

  it('allows an anonymous successful global sync', async () => {
    const index = indexWithFailedReconcile();
    const refresh = jest.spyOn(index, 'refreshRegistry').mockResolvedValue({
      ok: true,
      discovered: 3,
    });
    const httpAuth = {
      credentials: jest.fn().mockResolvedValue({ principal: { type: 'none' } }),
    };

    const res = await request(await appWith(index, httpAuth)).post('/sync');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.registries).toEqual([
      { registry: 'corporate', ok: true, discovered: 3 },
    ]);
    expect(refresh).toHaveBeenCalledWith('corporate');
  });

  it('rejects invalid credentials before global sync work starts', async () => {
    const index = indexWithFailedReconcile();
    const refresh = jest.spyOn(index, 'refreshRegistry');
    const httpAuth = {
      credentials: jest.fn().mockRejectedValue(new Error('invalid token')),
    };

    const res = await request(await appWith(index, httpAuth)).post('/sync');

    expect(res.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
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

describe('config validation', () => {
  /** A minimal, valid registry entry to hang conflicts off. */
  function registry(overrides: Record<string, unknown> = {}) {
    return {
      name: 'mock',
      url: 'https://mock.registry',
      repositories: ['demo/ee'],
      ...overrides,
    };
  }

  function document(registries: unknown[]) {
    return {
      apiVersion: 'content.ansible.com/v1',
      kind: 'ContentConfiguration',
      registries,
    };
  }

  it('accepts a registry that configures a CA bundle alone', async () => {
    const index = seed([]);
    const res = await request(await appWith(index))
      .post('/config/validate')
      .send(document([registry({ caFile: '/etc/pki/mock-ca.pem' })]));

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(
      res.body.errors.filter(
        (error: { path: string }) => error.path === 'registries[0].caFile',
      ),
    ).toEqual([]);
  });

  it('rejects caFile combined with the insecure opt-out, at the caFile path', async () => {
    // The same refusal readRegistryConfigs makes at startup — CI must see it
    // before the process does, not as a boot failure after merge.
    const index = seed([]);
    const res = await request(await appWith(index))
      .post('/config/validate')
      .send(
        document([
          registry({ caFile: '/etc/pki/mock-ca.pem', insecure: true }),
        ]),
      );

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toContainEqual({
      path: 'registries[0].caFile',
      message: expect.stringMatching(/caFile.*insecure|insecure.*caFile/),
    });
  });

  it.each(['y', 'yes', 'true', '1', 'on', ' ON ', ' YeS ', 1])(
    'rejects caFile combined with insecure=%p, matching startup coercion',
    async insecure => {
      const res = await request(await appWith(seed([])))
        .post('/config/validate')
        .send(document([registry({ caFile: '/etc/pki/ca.pem', insecure })]));

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.errors).toContainEqual(
        expect.objectContaining({ path: 'registries[0].caFile' }),
      );
      expect(res.body.warnings).toContainEqual(
        expect.objectContaining({ path: 'registries[0].insecure' }),
      );
    },
  );

  it.each([false, 'n', 'no', 'false', '0', 'off', ' OFF ', 0, null])(
    'accepts caFile combined with insecure=%p',
    async insecure => {
      const res = await request(await appWith(seed([])))
        .post('/config/validate')
        .send(document([registry({ caFile: '/etc/pki/ca.pem', insecure })]));

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.warnings).toEqual([]);
    },
  );

  it.each(['maybe', '', 2, {}, []])(
    'reports invalid insecure=%p at its field path',
    async insecure => {
      const res = await request(await appWith(seed([])))
        .post('/config/validate')
        .send(document([registry({ insecure })]));

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.errors).toContainEqual(
        expect.objectContaining({ path: 'registries[0].insecure' }),
      );
      expect(res.body.warnings).toEqual([]);
    },
  );

  it.each([null, [], 'registry', 1, true])(
    'reports malformed registry entry %p and continues validating',
    async entry => {
      const res = await request(await appWith(seed([])))
        .post('/config/validate')
        .send(document([entry, registry({ insecure: 'maybe' })]));

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.errors).toEqual([
        { path: 'registries[0]', message: 'Must be an object' },
        expect.objectContaining({ path: 'registries[1].insecure' }),
      ]);
    },
  );
});
