import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { createBackendPlugin } from '@backstage/backend-plugin-api';
import {
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
import { PortalOperations, portalOperationsServiceRef } from './operations';
import { ConfigReader } from '@backstage/config';
import {
  ConfiguredOrganizationResolver,
  PortalEntitlements,
} from './entitlements';

describe('PortalOperations', () => {
  const logger = mockServices.logger.mock();
  const permissions = mockServices.permissions.mock();
  const context = {
    credentials: {
      $$type: '@backstage/BackstageCredentials' as const,
      principal: { type: 'user' as const, userEntityRef: 'user:acme/alice' },
    },
    userId: 'alice',
    userEntityRef: 'user:acme/alice',
    organizationId: 'acme',
  };
  const request = { subject: { entityRef: 'component:acme/repo' }, input: {} };
  const descriptor = {
    id: 'test.scan',
    version: '1.0.0',
    exposure: { rest: true },
    permission: createPermission({
      name: 'test.scan',
      attributes: { action: 'create' },
    }),
    inputSchema: { type: 'object', additionalProperties: false },
  };
  let registry: PortalOperations;
  let handler: jest.Mock;
  const organizations = { resolve: jest.fn() };
  const entitlements = { check: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    organizations.resolve.mockResolvedValue('acme');
    entitlements.check.mockResolvedValue({
      allowed: true,
      organizationId: 'acme',
    });
    registry = new PortalOperations(logger, organizations, entitlements);
    handler = jest.fn().mockResolvedValue({ jobId: 'scan-1' });
    permissions.authorize.mockResolvedValue([
      { result: AuthorizeResult.ALLOW },
    ]);
    registry.register({ pluginId: 'test', descriptor, handler });
  });

  it('authorizes, invokes and audits a registered handler', async () => {
    await expect(
      registry.execute('test.scan', request, context, permissions),
    ).resolves.toEqual({ jobId: 'scan-1' });
    expect(handler).toHaveBeenCalledWith(request, context);
    expect(logger.info).toHaveBeenCalledWith(
      '[portal-audit]',
      expect.objectContaining({ outcome: 'SUCCESS', organizationId: 'acme' }),
    );
  });
  it('does not execute a denied operation', async () => {
    permissions.authorize.mockResolvedValue([{ result: AuthorizeResult.DENY }]);
    await expect(
      registry.execute('test.scan', request, context, permissions),
    ).rejects.toThrow('permission denied');
    expect(handler).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      '[portal-audit]',
      expect.objectContaining({ outcome: 'FAILURE' }),
    );
  });
  it('rejects extra input fields before executing', async () => {
    await expect(
      registry.execute(
        'test.scan',
        { ...request, input: { projectId: 'untrusted' } },
        context,
        permissions,
      ),
    ).rejects.toThrow('schema');
    expect(handler).not.toHaveBeenCalled();
  });
  it('rejects unknown and unexposed operations', async () => {
    await expect(
      registry.execute('unknown', request, context, permissions),
    ).rejects.toThrow('not available');
    registry.register({
      pluginId: 'test',
      descriptor: { ...descriptor, id: 'test.internal', exposure: {} },
      handler,
    });
    await expect(
      registry.execute('test.internal', request, context, permissions),
    ).rejects.toThrow('not available');
    expect(handler).not.toHaveBeenCalled();
  });
  it('rejects duplicate or unowned registrations', () => {
    expect(() =>
      registry.register({ pluginId: 'test', descriptor, handler }),
    ).toThrow('Duplicate');
    expect(() =>
      registry.register({ pluginId: 'other', descriptor, handler }),
    ).toThrow('owner-prefixed');
  });
  it('audits handler failure without logging private input or backend errors', async () => {
    handler.mockRejectedValue(new Error('secret upstream token'));
    await expect(
      registry.execute('test.scan', request, context, permissions),
    ).rejects.toThrow('secret');
    expect(logger.info).toHaveBeenCalledWith(
      '[portal-audit]',
      expect.objectContaining({
        outcome: 'FAILURE',
        input: { entityRef: 'component:acme/repo' },
      }),
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('secret');
  });
  it('validates output before reporting success', async () => {
    registry.register({
      pluginId: 'test',
      descriptor: {
        ...descriptor,
        id: 'test.output',
        outputSchema: { type: 'string' },
      },
      handler,
    });
    await expect(
      registry.execute('test.output', request, context, permissions),
    ).rejects.toThrow('output');
  });

  it.each([undefined, '', 'other'])(
    'rejects missing or inconsistent organization %j',
    async organization => {
      organizations.resolve.mockResolvedValue(organization);
      await expect(
        registry.execute('test.scan', request, context, permissions),
      ).rejects.toThrow(/organization/i);
      expect(handler).not.toHaveBeenCalled();
      expect(permissions.authorize).not.toHaveBeenCalled();
    },
  );
  it('denies resolver failure without falling back to the user namespace', async () => {
    organizations.resolve.mockRejectedValue(new Error('Unavailable'));
    await expect(
      registry.execute('test.scan', request, context, permissions),
    ).rejects.toThrow('could not be resolved');
    expect(handler).not.toHaveBeenCalled();
  });
  it.each([
    { allowed: false, organizationId: 'acme' },
    { allowed: true, organizationId: 'other' },
    { allowed: true },
  ])('denies an unavailable or mismatched entitlement %j', async decision => {
    registry.register({
      pluginId: 'test',
      descriptor: {
        ...descriptor,
        id: 'test.entitled',
        requiredEntitlements: ['test.scanning'],
      },
      handler,
    });
    entitlements.check.mockResolvedValue(decision);
    await expect(
      registry.execute('test.entitled', request, context, permissions),
    ).rejects.toThrow('entitlement denied');
    expect(handler).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      '[portal-audit]',
      expect.objectContaining({ outcome: 'FAILURE', organizationId: 'acme' }),
    );
  });
  it('enforces every declared entitlement with the authenticated principal', async () => {
    registry.register({
      pluginId: 'test',
      descriptor: {
        ...descriptor,
        id: 'test.entitled',
        requiredEntitlements: ['test.scanning', 'test.policy'],
      },
      handler,
    });
    await registry.execute('test.entitled', request, context, permissions);
    expect(entitlements.check).toHaveBeenCalledTimes(2);
    expect(entitlements.check).toHaveBeenCalledWith(
      'test.scanning',
      context.credentials,
      permissions,
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it('does not let later descriptor mutations remove a registered entitlement gate', async () => {
    const requirements = ['test.scanning'];
    registry.register({
      pluginId: 'test',
      descriptor: {
        ...descriptor,
        id: 'test.entitled',
        requiredEntitlements: requirements,
      },
      handler,
    });
    requirements.length = 0;
    entitlements.check.mockResolvedValue({ allowed: false });
    await expect(
      registry.execute('test.entitled', request, context, permissions),
    ).rejects.toThrow('entitlement denied');
    expect(handler).not.toHaveBeenCalled();
  });
  it('fails closed on entitlement service failure', async () => {
    registry.register({
      pluginId: 'test',
      descriptor: {
        ...descriptor,
        id: 'test.entitled',
        requiredEntitlements: ['test.scanning'],
      },
      handler,
    });
    entitlements.check.mockRejectedValue(new Error('Policy unavailable'));
    await expect(
      registry.execute('test.entitled', request, context, permissions),
    ).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
  it('rejects malformed entitlement declarations', () => {
    [[''], ['invalid'], ['test.scan', 'test.scan']].forEach(
      requiredEntitlements => {
        expect(() =>
          registry.register({
            pluginId: 'test',
            descriptor: {
              ...descriptor,
              id: 'test.invalid',
              requiredEntitlements,
            },
            handler,
          }),
        ).toThrow('entitlement requirements');
      },
    );
  });

  it('shares the injected root registry across different backend plugins', async () => {
    const instances: PortalOperations[] = [];
    const makePlugin = (pluginId: string) =>
      createBackendPlugin({
        pluginId,
        register(env) {
          env.registerInit({
            deps: { operations: portalOperationsServiceRef },
            async init({ operations }) {
              instances.push(operations);
            },
          });
        },
      });
    const backend = await startTestBackend({
      features: [
        mockServices.rootConfig.factory({
          data: { portal: { organization: { id: 'acme' } } },
        }),
        makePlugin('contributor'),
        makePlugin('host'),
      ],
    });
    try {
      expect(instances).toHaveLength(2);
      expect(instances[0]).toBe(instances[1]);
      instances[0].register({ pluginId: 'test', descriptor, handler });
      await expect(
        instances[1].execute('test.scan', request, context, permissions),
      ).resolves.toEqual({ jobId: 'scan-1' });
    } finally {
      await backend.stop();
    }
  });

  it.each([
    [['engineering'], ['engineering'], true],
    [['finance'], ['finance'], true],
    [['engineering', 'finance'], ['finance'], true],
    [['engineering', 'finance'], ['*'], true],
    [['finance'], ['engineering'], false],
  ] as const)(
    'checks shared-resource grants for memberships %j and policy %j',
    async (memberships, grants, allowed) => {
      const resolver = {
        resolve: async () =>
          memberships.length === 1 ? memberships[0] : undefined,
        resolveAll: async () => memberships,
      };
      const policy = new PortalEntitlements(
        new ConfigReader({
          portal: {
            entitlements: {
              grants: [{ id: 'test.scanning', organizations: [...grants] }],
            },
          },
        }),
        resolver,
      );
      policy.register('test', [
        {
          id: 'test.scanning',
          scope: 'organization',
          permissionName: 'test.scanning.use',
          displayName: 'Scanning',
          description: 'Shared content scanning',
        },
      ]);
      const operations = new PortalOperations(logger, resolver, policy);
      operations.register({
        pluginId: 'test',
        descriptor: {
          ...descriptor,
          organizationScope: 'shared',
          requiredEntitlements: ['test.scanning'],
        },
        handler,
      });
      const multiContext = {
        ...context,
        organizationId: memberships.length === 1 ? memberships[0] : undefined,
        organizationIds: [...memberships],
      };
      const [result] = await Promise.allSettled([
        operations.execute(
          'test.scan',
          { subject: { entityRef: 'component:default/shared-repo' } },
          multiContext,
          permissions,
        ),
      ]);
      expect(result.status).toBe(allowed ? 'fulfilled' : 'rejected');
      expect(handler).toHaveBeenCalledTimes(allowed ? 1 : 0);
    },
  );

  it('does not invent a tenant for an organization-scoped handler with multiple memberships', async () => {
    const resolver = {
      resolve: async () => undefined,
      resolveAll: async () => ['engineering', 'finance'],
    };
    const operations = new PortalOperations(logger, resolver, entitlements);
    operations.register({ pluginId: 'test', descriptor, handler });
    await expect(
      operations.execute(
        'test.scan',
        request,
        {
          ...context,
          organizationId: undefined,
          organizationIds: ['engineering', 'finance'],
        },
        permissions,
      ),
    ).rejects.toThrow('organization context');
    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts an explicit global entitlement without treating it as an organization grant', async () => {
    entitlements.check.mockResolvedValue({ allowed: true, scope: 'global' });
    registry.register({
      pluginId: 'test',
      descriptor: {
        ...descriptor,
        id: 'test.global',
        requiredEntitlements: ['test.global-use'],
      },
      handler,
    });
    await expect(
      registry.execute('test.global', request, context, permissions),
    ).resolves.toEqual({ jobId: 'scan-1' });
    expect(handler).toHaveBeenCalledWith(request, context);
  });

  it.each([false, true])(
    'enforces actual configured entitlement policy (granted=%s)',
    async granted => {
      const config = new ConfigReader({
        portal: {
          organization: { id: 'acme' },
          entitlements: {
            grants: granted
              ? [{ id: 'test.scanning', organizations: ['acme'] }]
              : [],
          },
        },
      });
      const resolver = new ConfiguredOrganizationResolver(config);
      const policy = new PortalEntitlements(config, resolver);
      policy.register('test', [
        {
          id: 'test.scanning',
          scope: 'organization',
          permissionName: 'test.scanning.use',
          displayName: 'Scanning',
          description: 'Allow scans for this organization',
        },
      ]);
      const operations = new PortalOperations(logger, resolver, policy);
      operations.register({
        pluginId: 'test',
        descriptor: { ...descriptor, requiredEntitlements: ['test.scanning'] },
        handler,
      });
      const execution = operations.execute(
        'test.scan',
        request,
        context,
        permissions,
      );
      const [result] = await Promise.allSettled([execution]);
      expect(result.status).toBe(granted ? 'fulfilled' : 'rejected');
      expect(handler).toHaveBeenCalledTimes(granted ? 1 : 0);
    },
  );
});
