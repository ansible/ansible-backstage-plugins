import { createPortalPlugin } from './createPortalPlugin';
import { createIdentityMiddleware, parseEntityRef } from './middleware';
import {
  HealthRegistry,
  getAllHealthStatuses,
  _resetHealthRegistriesForTests,
} from './healthRegistry';
import { withOrganization } from './withOrganization';
import { AuditEmitter } from './auditEmitter';

// ── Shared mock logger ─────────────────────────────────────────────────────────

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

afterEach(() => {
  jest.clearAllMocks();
  _resetHealthRegistriesForTests();
});

// ── parseEntityRef ─────────────────────────────────────────────────────────────

describe('parseEntityRef', () => {
  it('parses a standard user entity ref', () => {
    expect(parseEntityRef('user:default/johndoe')).toEqual({
      namespace: 'default',
      name: 'johndoe',
    });
  });

  it('parses an entity ref with a custom namespace', () => {
    expect(parseEntityRef('user:acme-corp/jane.doe')).toEqual({
      namespace: 'acme-corp',
      name: 'jane.doe',
    });
  });

  it('falls back gracefully for a malformed entity ref', () => {
    expect(parseEntityRef('not-an-entity-ref')).toEqual({
      namespace: 'default',
      name: 'not-an-entity-ref',
    });
  });

  it('handles names with hyphens and dots', () => {
    expect(parseEntityRef('user:my-org/jane.doe-2')).toEqual({
      namespace: 'my-org',
      name: 'jane.doe-2',
    });
  });
});

// ── createIdentityMiddleware ───────────────────────────────────────────────────

describe('createIdentityMiddleware', () => {
  const makeOptions = (entityRef: string) => ({
    httpAuth: {
      credentials: jest.fn().mockResolvedValue({
        principal: { type: 'user', userEntityRef: entityRef },
      }),
    } as any,
    userInfo: {
      getUserInfo: jest.fn().mockResolvedValue({ userEntityRef: entityRef }),
    } as any,
    logger: mockLogger as any,
    organizations: { resolve: jest.fn().mockResolvedValue('default') },
  });

  it('attaches portalContext with correct userId and organizationId', async () => {
    const options = makeOptions('user:default/johndoe');
    const middleware = createIdentityMiddleware(options);
    const req: any = {};
    const next = jest.fn();

    await middleware(req, {} as any, next);

    expect(req.portalContext).toEqual({
      userEntityRef: 'user:default/johndoe',
      userId: 'johndoe',
      organizationId: 'default',
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('uses the resolver rather than the user namespace', async () => {
    const options = makeOptions('user:acme-corp/jane.doe');
    options.organizations.resolve.mockResolvedValue('configured-org');
    const middleware = createIdentityMiddleware(options);
    const req: any = {};
    const next = jest.fn();

    await middleware(req, {} as any, next);

    expect(req.portalContext).toMatchObject({
      userId: 'jane.doe',
      organizationId: 'configured-org',
    });
  });

  it('ignores the legacy defaultOrgId rather than overriding the resolver', async () => {
    const options = {
      ...makeOptions('user:default/johndoe'),
      defaultOrgId: 'my-single-org',
    };
    const middleware = createIdentityMiddleware(options);
    const req: any = {};

    await middleware(req, {} as any, jest.fn());

    expect(req.portalContext?.organizationId).toBe('default');
  });

  it('clears stale context when the trusted organization cannot be resolved', async () => {
    const options = makeOptions('user:default/johndoe');
    options.organizations.resolve.mockRejectedValue(new Error('Unavailable'));
    const middleware = createIdentityMiddleware(options);
    const req: any = { portalContext: { organizationId: 'untrusted' } };
    const next = jest.fn();
    await middleware(req, {} as any, next);
    expect(req.portalContext).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next() without setting portalContext when auth fails', async () => {
    const options = {
      httpAuth: {
        credentials: jest.fn().mockRejectedValue(new Error('Unauthorized')),
      } as any,
      userInfo: { getUserInfo: jest.fn() } as any,
      logger: mockLogger as any,
      organizations: { resolve: async () => 'default' },
    };
    const middleware = createIdentityMiddleware(options);
    const req: any = {};
    const next = jest.fn();

    await middleware(req, {} as any, next);

    expect(req.portalContext).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    // Auth failures are debug-level, not warn, to avoid noisy logs.
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Could not resolve portal context'),
    );
  });

  it('calls next() without setting portalContext when userInfo throws', async () => {
    const options = {
      httpAuth: {
        credentials: jest
          .fn()
          .mockResolvedValue({ principal: { type: 'user' } }),
      } as any,
      userInfo: {
        getUserInfo: jest.fn().mockRejectedValue(new Error('User not found')),
      } as any,
      logger: mockLogger as any,
      organizations: { resolve: async () => 'default' },
    };
    const middleware = createIdentityMiddleware(options);
    const req: any = {};
    const next = jest.fn();

    await middleware(req, {} as any, next);

    expect(req.portalContext).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ── HealthRegistry ─────────────────────────────────────────────────────────────

describe('HealthRegistry', () => {
  it('has UNKNOWN state initially', () => {
    const reg = new HealthRegistry();
    expect(reg.current().state).toBe('UNKNOWN');
  });

  it('push() updates the current status', () => {
    const reg = new HealthRegistry();
    reg.push({ state: 'READY', message: 'All good.' });
    expect(reg.current()).toEqual({ state: 'READY', message: 'All good.' });
  });

  it('current() returns a copy — mutations do not affect the stored status', () => {
    const reg = new HealthRegistry();
    reg.push({ state: 'READY', message: 'Good.' });
    const snapshot = reg.current();
    snapshot.state = 'DEGRADED';
    expect(reg.current().state).toBe('READY');
  });

  it('subscribe() is notified on push', () => {
    const reg = new HealthRegistry();
    const listener = jest.fn();
    reg.subscribe(listener);
    reg.push({ state: 'DEGRADED', message: 'Slow.' });
    expect(listener).toHaveBeenCalledWith({
      state: 'DEGRADED',
      message: 'Slow.',
    });
  });

  it('subscribe() returns an unsubscribe function that stops notifications', () => {
    const reg = new HealthRegistry();
    const listener = jest.fn();
    const unsubscribe = reg.subscribe(listener);
    unsubscribe();
    reg.push({ state: 'READY', message: 'Fine.' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('a throwing listener does not affect other listeners or the push', () => {
    const reg = new HealthRegistry();
    const badListener = jest.fn().mockImplementation(() => {
      throw new Error('boom');
    });
    const goodListener = jest.fn();
    reg.subscribe(badListener);
    reg.subscribe(goodListener);

    expect(() => reg.push({ state: 'READY', message: 'ok' })).not.toThrow();
    expect(goodListener).toHaveBeenCalledTimes(1);
  });

  it('getAllHealthStatuses() returns all registered plugin statuses', () => {
    const { getOrCreateHealthRegistry } = require('./healthRegistry');
    const reg1 = getOrCreateHealthRegistry('plugin-a');
    const reg2 = getOrCreateHealthRegistry('plugin-b');
    reg1.push({ state: 'READY', message: 'ok' });
    reg2.push({ state: 'DEGRADED', message: 'slow' });

    const all = getAllHealthStatuses();
    expect(all['plugin-a']).toEqual({ state: 'READY', message: 'ok' });
    expect(all['plugin-b']).toEqual({ state: 'DEGRADED', message: 'slow' });
  });
});

// ── withOrganization ───────────────────────────────────────────────────────────

describe('withOrganization', () => {
  it('passes the organizationId to the callback', async () => {
    const result = await withOrganization('acme-corp', orgId => {
      return Promise.resolve(`queried for ${orgId}`);
    });
    expect(result).toBe('queried for acme-corp');
  });

  it('trims whitespace from organizationId before passing to callback', async () => {
    const callback = jest.fn().mockResolvedValue('ok');
    await withOrganization('  acme-corp  ', callback);
    expect(callback).toHaveBeenCalledWith('acme-corp');
  });

  it('rejects when organizationId is an empty string', async () => {
    await expect(
      withOrganization('', () => Promise.resolve('x')),
    ).rejects.toThrow('organizationId must not be empty');
  });

  it('rejects when organizationId is whitespace-only', async () => {
    await expect(
      withOrganization('   ', () => Promise.resolve('x')),
    ).rejects.toThrow('organizationId must not be empty');
  });

  it('propagates errors thrown by the callback', async () => {
    await expect(
      withOrganization('org-1', () => Promise.reject(new Error('db error'))),
    ).rejects.toThrow('db error');
  });
});

// ── AuditEmitter ──────────────────────────────────────────────────────────────

describe('AuditEmitter', () => {
  it('emits a structured info log entry on success', () => {
    const emitter = new AuditEmitter('my-plugin', mockLogger as any);
    emitter.emit({
      operationId: 'my-plugin.scans.trigger',
      userId: 'johndoe',
      organizationId: 'acme-corp',
      outcome: 'SUCCESS',
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      '[portal-audit]',
      expect.objectContaining({
        plugin: 'my-plugin',
        operationId: 'my-plugin.scans.trigger',
        userId: 'johndoe',
        organizationId: 'acme-corp',
        outcome: 'SUCCESS',
      }),
    );
  });

  it('includes input and error fields when provided', () => {
    const emitter = new AuditEmitter('my-plugin', mockLogger as any);
    emitter.emit({
      operationId: 'my-plugin.scans.trigger',
      userId: 'johndoe',
      organizationId: 'acme-corp',
      input: { collectionId: 'my-coll' },
      outcome: 'FAILURE',
      error: 'Worker pool exhausted',
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      '[portal-audit]',
      expect.objectContaining({
        input: { collectionId: 'my-coll' },
        outcome: 'FAILURE',
        error: 'Worker pool exhausted',
      }),
    );
  });

  it('includes a UTC timestamp in the log entry', () => {
    const emitter = new AuditEmitter('my-plugin', mockLogger as any);
    emitter.emit({
      operationId: 'my-plugin.scans.trigger',
      userId: 'u',
      organizationId: 'o',
      outcome: 'SUCCESS',
    });

    const [, meta] = mockLogger.info.mock.calls[0];
    expect(meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not include input or error fields when omitted', () => {
    const emitter = new AuditEmitter('my-plugin', mockLogger as any);
    emitter.emit({
      operationId: 'my-plugin.scans.trigger',
      userId: 'u',
      organizationId: 'o',
      outcome: 'SUCCESS',
    });

    const [, meta] = mockLogger.info.mock.calls[0];
    expect(meta).not.toHaveProperty('input');
    expect(meta).not.toHaveProperty('error');
  });
});

// ── createPortalPlugin ─────────────────────────────────────────────────────────

describe('createPortalPlugin', () => {
  it('returns an object with all required methods', () => {
    const plugin = createPortalPlugin({ pluginId: 'test-plugin' });
    expect(typeof plugin.createMiddleware).toBe('function');
    expect(typeof plugin.pushHealthStatus).toBe('function');
    expect(typeof plugin.getHealthStatus).toBe('function');
    expect(typeof plugin.emitAuditEvent).toBe('function');
    expect(typeof plugin.withLogger).toBe('function');
  });

  it('initial health status is UNKNOWN', () => {
    const plugin = createPortalPlugin({ pluginId: 'test-plugin' });
    expect(plugin.getHealthStatus().state).toBe('UNKNOWN');
  });

  it('pushHealthStatus / getHealthStatus round-trip', () => {
    const plugin = createPortalPlugin({ pluginId: 'test-plugin' });
    plugin.pushHealthStatus({ state: 'READY', message: 'Workers up.' });
    expect(plugin.getHealthStatus()).toEqual({
      state: 'READY',
      message: 'Workers up.',
    });
  });

  it('createMiddleware configures the audit emitter', async () => {
    const plugin = createPortalPlugin({ pluginId: 'test-plugin' });
    const httpAuth = {
      credentials: jest.fn().mockResolvedValue({ type: 'user', token: 't' }),
    } as any;
    const userInfo = {
      getUserInfo: jest.fn().mockResolvedValue({
        userEntityRef: 'user:default/johndoe',
      }),
    } as any;

    plugin.createMiddleware({
      httpAuth,
      userInfo,
      logger: mockLogger as any,
      organizations: { resolve: async () => 'default' },
    });

    // emitAuditEvent should work (not warn about missing logger).
    const consoleSpy = jest.spyOn(console, 'warn');
    plugin.emitAuditEvent({
      operationId: 'test.op',
      userId: 'johndoe',
      organizationId: 'default',
      outcome: 'SUCCESS',
    });
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[portal-audit]',
      expect.any(Object),
    );
    consoleSpy.mockRestore();
  });

  it('emitAuditEvent warns when called before logger is configured', () => {
    const plugin = createPortalPlugin({ pluginId: 'test-plugin' });
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    plugin.emitAuditEvent({
      operationId: 'test.op',
      userId: 'u',
      organizationId: 'o',
      outcome: 'SUCCESS',
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('before a logger was configured'),
    );
    consoleSpy.mockRestore();
  });

  it('withLogger() enables audit emit before createMiddleware', () => {
    const plugin = createPortalPlugin({ pluginId: 'test-plugin' }).withLogger(
      mockLogger as any,
    );
    const consoleSpy = jest.spyOn(console, 'warn');

    plugin.emitAuditEvent({
      operationId: 'test.op',
      userId: 'u',
      organizationId: 'o',
      outcome: 'SUCCESS',
    });

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('withLogger() returns the same plugin instance for chaining', () => {
    const plugin = createPortalPlugin({ pluginId: 'test-plugin' });
    const returned = plugin.withLogger(mockLogger as any);
    expect(returned).toBe(plugin);
  });

  it('two plugins with different IDs have independent health registries', () => {
    const a = createPortalPlugin({ pluginId: 'plugin-a' });
    const b = createPortalPlugin({ pluginId: 'plugin-b' });
    a.pushHealthStatus({ state: 'READY', message: 'a ok' });
    b.pushHealthStatus({ state: 'DEGRADED', message: 'b slow' });
    expect(a.getHealthStatus().state).toBe('READY');
    expect(b.getHealthStatus().state).toBe('DEGRADED');
  });

  it('two plugin instances with the same ID share the health registry', () => {
    const a1 = createPortalPlugin({ pluginId: 'shared-plugin' });
    const a2 = createPortalPlugin({ pluginId: 'shared-plugin' });
    a1.pushHealthStatus({ state: 'READY', message: 'up' });
    // a2 should see the status pushed by a1.
    expect(a2.getHealthStatus().state).toBe('READY');
  });
});
