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

async function appWith(index: ContentIndex) {
  const app = express();
  app.use(
    await createRouter({
      index,
      logger,
      // The router no longer reads credentials: every route except
      // GET /health sits behind the plugin's sign-in barrier (#977), which
      // these router-level tests bypass on purpose — plugin.test.ts covers
      // the barrier itself. This stub only satisfies RouterOptions.
      httpAuth: {
        credentials: () =>
          Promise.resolve({
            principal: { type: 'user', userEntityRef: 'user:default/test' },
          }),
      } as never,
    }),
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

describe('diagnostics are summarised on the registry listing', () => {
  /**
   * An index with one registry whose last reconciliation — and drift check —
   * failed the way a TLS rejection would: the error text quotes hostnames
   * from the certificate's subject alternative names.
   *
   * Every route except `GET /health` sits behind the sign-in barrier (#977),
   * and the fixed summary is all the listing reports — the raw cause goes to
   * the backend log and the sync responses. The private fields are written
   * directly because the point of these tests is the HTTP contract, not
   * discovery.
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

  it('keeps the detailed cause on the per-registry sync response', async () => {
    const index = indexWithFailedReconcile();
    // A live sync of the same registry fails with a detailed cause, the way
    // a TLS rejection would: the caller explicitly asked for the refresh, so
    // the response must carry it.
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

  it('keeps the detailed cause on the global sync response', async () => {
    const index = indexWithFailedReconcile();
    const clients = (
      index as unknown as { clients: Map<string, { fetchImpl: unknown }> }
    ).clients;
    const detail = 'certificate altnames: DNS:secret-host.internal (10.1.2.3)';
    (clients.get('corporate') as unknown as { fetchImpl: unknown }).fetchImpl =
      () => Promise.reject(new Error(detail));

    const res = await request(await appWith(index)).post('/sync');

    expect(res.status).toBe(207);
    expect(res.body.status).toBe('partial');
    const outcome = res.body.registries[0];
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain(detail);
    // Response detail must not erase the operator's diagnostic state.
    expect(index.reconcileStateFor('corporate')?.error).toContain(detail);
  });

  it('completes a global sync of healthy registries', async () => {
    const index = indexWithFailedReconcile();
    const refresh = jest.spyOn(index, 'refreshRegistry').mockResolvedValue({
      ok: true,
      discovered: 3,
    });

    const res = await request(await appWith(index)).post('/sync');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.registries).toEqual([
      { registry: 'corporate', ok: true, discovered: 3 },
    ]);
    expect(refresh).toHaveBeenCalledWith('corporate');
  });
});

describe('GET /registries', () => {
  it.each([undefined, { at: '2026-10-31', ok: true, artifacts: 0 }])(
    'omits failure diagnostics when reconciliation is %p',
    async reconcile => {
      const index = new ContentIndex(
        [
          {
            name: 'mock',
            url: 'https://mock.registry',
            auth: { type: 'anonymous' },
          },
        ],
        logger,
      );
      if (reconcile) {
        (index as unknown as { reconcile: Map<string, unknown> }).reconcile.set(
          'mock',
          reconcile,
        );
      }
      const res = await request(await appWith(index)).get('/registries');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).not.toHaveProperty('lastReconcileError');
      expect(res.body.items[0].lastReconcileOk).toBe(reconcile?.ok);
    },
  );
  it('returns empty items when none are configured', async () => {
    const index = seed([]);
    const res = await request(await appWith(index)).get('/registries');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('POST poll returns 404 for an unknown registry', async () => {
    const index = seed([]);
    const res = await request(await appWith(index)).post(
      '/registries/reg/poll',
    );

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

  it('reports missing registry names and URLs at their field paths', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send(document([registry({ name: undefined, url: undefined })]));
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toEqual([
      { path: 'registries[0].name', message: 'Required' },
      { path: 'registries[0].url', message: 'Required' },
    ]);
  });

  it('rejects duplicate registry names', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send(document([registry(), registry()]));
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toEqual([
      { path: 'registries[1].name', message: 'Duplicate registry name: mock' },
    ]);
  });

  it('warns that realm rewriting changes the credential destination', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send(document([registry({ rewriteAuthRealmHost: true })]));
    expect(res.body.valid).toBe(true);
    expect(res.body.warnings).toEqual([
      {
        path: 'registries[0].rewriteAuthRealmHost',
        message: expect.stringContaining(
          'Credentials will be sent to the configured host',
        ),
      },
    ]);
  });

  it('rejects registry URLs without a scheme', async () => {
    const res = await request(await appWith(seed([])))
      .post('/config/validate')
      .send(document([registry({ url: 'mock.registry' })]));
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toEqual([
      { path: 'registries[0].url', message: 'Must include a scheme' },
    ]);
  });

  it.each([{ namespaces: [] }, { namespaces: ['team'] }])(
    'validates namespaces $namespaces without configured repositories',
    async ({ namespaces }) => {
      const res = await request(await appWith(seed([])))
        .post('/config/validate')
        .send(document([registry({ repositories: [], namespaces })]));
      expect(res.body.valid).toBe(true);
      expect(res.body.warnings).toHaveLength(namespaces.length ? 0 : 1);
    },
  );

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
