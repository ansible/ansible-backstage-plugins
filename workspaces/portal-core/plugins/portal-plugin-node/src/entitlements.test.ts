import { ConfigReader } from '@backstage/config';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import {
  createBackendPlugin,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type { EntitlementDefinition } from '@ansible/portal-extension-common';
import {
  ConfiguredOrganizationResolver,
  PortalEntitlements,
  portalActiveOrganizationServiceRef,
  portalEntitlementsServiceRef,
} from './entitlements';

describe('host entitlements', () => {
  const auth = mockServices.auth();
  const user = {
    $$type: '@backstage/BackstageCredentials' as const,
    principal: {
      type: 'user' as const,
      userEntityRef: 'user:not-the-org/alice',
    },
    expiresAt: undefined,
  };
  const definition: EntitlementDefinition = {
    id: 'scanner.scan',
    displayName: 'Scan',
    description: 'Scan content',
    scope: 'organization',
    permissionName: 'scanner.scan.use',
  };
  const permissions = mockServices.permissions.mock();
  function setup(
    organization?: string,
    organizations: string[] = ['acme'],
    scope = definition.scope,
  ) {
    const config = new ConfigReader({
      portal: {
        ...(organization === undefined
          ? {}
          : { organization: { id: organization } }),
        entitlements: { grants: [{ id: definition.id, organizations }] },
      },
    });
    const resolver = new ConfiguredOrganizationResolver(config);
    const service = new PortalEntitlements(config, resolver);
    service.register('scanner', [{ ...definition, scope }]);
    return { service, resolver };
  }
  beforeEach(() => {
    jest.clearAllMocks();
    permissions.authorize.mockResolvedValue([
      { result: AuthorizeResult.ALLOW },
    ]);
  });
  it('uses the deployment organization service override through root DI', async () => {
    const resolver = { resolve: jest.fn().mockResolvedValue('acme') };
    const backend = await startTestBackend({
      features: [
        mockServices.rootConfig.factory({
          data: {
            portal: {
              entitlements: {
                grants: [{ id: definition.id, organizations: ['acme'] }],
              },
            },
          },
        }),
        createServiceFactory({
          service: portalActiveOrganizationServiceRef,
          deps: {},
          factory: async () => resolver,
        }),
        createBackendPlugin({
          pluginId: 'entitlement-test',
          register(env) {
            env.registerInit({
              deps: { entitlements: portalEntitlementsServiceRef },
              async init({ entitlements }) {
                entitlements.register('scanner', [definition]);
                await expect(
                  entitlements.check(definition.id, user, permissions),
                ).resolves.toEqual({ allowed: true, organizationId: 'acme' });
              },
            });
          },
        }),
      ],
    });
    try {
      expect(resolver.resolve).toHaveBeenCalledWith(user);
    } finally {
      await backend.stop();
    }
  });
  it('uses only the server organization, not the identity namespace', async () => {
    const { service, resolver } = setup('acme');
    await expect(resolver.resolve(user)).resolves.toBe('acme');
    await expect(
      service.check(definition.id, user, permissions),
    ).resolves.toEqual({ allowed: true, organizationId: 'acme' });
    expect(permissions.authorize).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          permission: expect.objectContaining({
            name: definition.permissionName,
          }),
        }),
      ],
      { credentials: user },
    );
  });
  it.each([undefined, '', '   '])(
    'denies missing organization %j even for an all-org grant',
    async organization => {
      await expect(
        setup(organization, ['*']).service.check(
          definition.id,
          user,
          permissions,
        ),
      ).resolves.toMatchObject({ allowed: false });
      expect(permissions.authorize).not.toHaveBeenCalled();
    },
  );
  it.each([['other'], []])(
    'denies unavailable organization grants %j',
    async (...organizations) => {
      await expect(
        setup('acme', organizations).service.check(
          definition.id,
          user,
          permissions,
        ),
      ).resolves.toMatchObject({ allowed: false });
      expect(permissions.authorize).not.toHaveBeenCalled();
    },
  );
  it.each([['other', 'acme'], ['*']])(
    'supports multiple or all organizations %j',
    async (...organizations) => {
      await expect(
        setup('acme', organizations).service.check(
          definition.id,
          user,
          permissions,
        ),
      ).resolves.toMatchObject({ allowed: true });
    },
  );
  it('requires permission even when available to all organizations', async () => {
    permissions.authorize.mockResolvedValue([{ result: AuthorizeResult.DENY }]);
    await expect(
      setup('acme', ['*']).service.check(definition.id, user, permissions),
    ).resolves.toMatchObject({ allowed: false });
  });
  it('denies permission service failure', async () => {
    permissions.authorize.mockRejectedValue(new Error('Unavailable'));
    await expect(
      setup('acme').service.check(definition.id, user, permissions),
    ).resolves.toEqual({ allowed: false });
  });
  it('supports explicitly granted global scope without an active organization', async () => {
    await expect(
      setup(undefined, ['*'], 'global').service.check(
        definition.id,
        user,
        permissions,
      ),
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      setup('acme', ['acme'], 'global').service.check(
        definition.id,
        user,
        permissions,
      ),
    ).resolves.toMatchObject({ allowed: false });
  });
  it('denies unknown IDs and service principals without calling permissions', async () => {
    const service = setup('acme').service;
    await expect(
      service.check('unknown.scan', user, permissions),
    ).resolves.toEqual({ allowed: false });
    await expect(
      service.check(
        definition.id,
        await auth.getOwnServiceCredentials(),
        permissions,
      ),
    ).resolves.toEqual({ allowed: false });
    expect(permissions.authorize).not.toHaveBeenCalled();
  });
  it('rejects duplicates and mismatched ownership atomically', () => {
    const service = setup('acme').service;
    expect(() => service.register('other', [definition])).toThrow(
      'owner-prefixed',
    );
    expect(() => service.register('scanner', [definition])).toThrow(
      'Duplicate',
    );
    expect(() =>
      service.register('scanner', [
        { ...definition, id: 'scanner.new' },
        definition,
      ]),
    ).toThrow('Duplicate');
    expect(() =>
      service.register('scanner', [{ ...definition, id: 'scanner.new' }]),
    ).not.toThrow();
  });
  it('denies malformed grants and missing policy', async () => {
    for (const config of [
      new ConfigReader({}),
      new ConfigReader({
        portal: {
          organization: { id: 'acme' },
          entitlements: { grants: [{ id: definition.id }] },
        },
      }),
    ]) {
      const service = new PortalEntitlements(
        config,
        new ConfiguredOrganizationResolver(config),
      );
      service.register('scanner', [definition]);
      await expect(
        service.check(definition.id, user, permissions),
      ).resolves.toMatchObject({ allowed: false });
    }
  });
});
