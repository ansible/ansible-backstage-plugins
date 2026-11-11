import {
  createBackendFeatureLoader,
  createBackendPlugin,
  createServiceFactory,
  type BackendFeature,
} from '@backstage/backend-plugin-api';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { authProvidersExtensionPoint } from '@backstage/plugin-auth-node';
import {
  catalogProcessingExtensionPoint,
  type EntityProvider,
} from '@backstage/plugin-catalog-node';
import type { Entity } from '@backstage/catalog-model';
import type { ConfigReader } from '@backstage/config';
import { catalogModelExtensionPoint } from '@backstage/plugin-catalog-node/alpha';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import {
  scaffolderAutocompleteExtensionPoint,
  scaffolderTemplatingExtensionPoint,
} from '@backstage/plugin-scaffolder-node/alpha';
import {
  ansibleServiceFactory,
  ansibleServiceRef,
  type IUserProvisioner,
} from '@ansible/backstage-rhaap-common';
import catalogLoader, {
  catalogModuleRhaap,
} from '@ansible/backstage-plugin-catalog-backend-module-rhaap';
import catalogAlphaLoader from '@ansible/backstage-plugin-catalog-backend-module-rhaap/alpha';
import authLoader, {
  authModuleRhaapProvider,
} from '@ansible/backstage-plugin-auth-backend-module-rhaap-provider';
import provisionerLoader, {
  catalogModuleRhaapUserProvisioner,
} from '@ansible/backstage-plugin-catalog-backend-module-rhaap-user-provisioner';
import scaffolderLoader, {
  scaffolderModuleAnsible,
} from '@ansible/plugin-scaffolder-backend-module-backstage-rhaap';

const config = {
  app: { baseUrl: 'http://localhost:3000' },
  backend: { baseUrl: 'http://localhost:7007' },
  ansible: { rhaap: { baseUrl: 'https://aap.example.test' } },
};

async function startAapModules(
  features: BackendFeature[],
  options: {
    config?: ConstructorParameters<typeof ConfigReader>[0];
    verify?: (providers: EntityProvider[]) => Promise<void>;
  } = {},
) {
  const providers: EntityProvider[] = [];
  const addEntityProvider = jest.fn(
    (...added: Array<EntityProvider | EntityProvider[]>) => {
      providers.push(...added.flat());
    },
  );
  const registerProvider = jest.fn();
  const addActions = jest.fn();
  const backend = await startTestBackend({
    features: [
      mockServices.rootConfig.factory({ data: options.config ?? config }),
      createBackendPlugin({
        pluginId: 'catalog',
        register(reg) {
          reg.registerExtensionPoint(catalogProcessingExtensionPoint, {
            addEntityProvider,
            addProcessor: jest.fn(),
            addPlaceholderResolver: jest.fn(),
            setOnProcessingErrorHandler: jest.fn(),
          });
          reg.registerExtensionPoint(catalogModelExtensionPoint, {
            setFieldValidators: jest.fn(),
            setEntityDataParser: jest.fn(),
            addModelSource: jest.fn(),
          });
          reg.registerInit({ deps: {}, async init() {} });
        },
      }),
      createBackendPlugin({
        pluginId: 'auth',
        register(reg) {
          reg.registerExtensionPoint(authProvidersExtensionPoint, {
            registerProvider,
          });
          reg.registerInit({ deps: {}, async init() {} });
        },
      }),
      createBackendPlugin({
        pluginId: 'scaffolder',
        register(reg) {
          reg.registerExtensionPoint(scaffolderActionsExtensionPoint, {
            addActions,
          });
          reg.registerExtensionPoint(scaffolderTemplatingExtensionPoint, {
            addTemplateFilters: jest.fn(),
            addTemplateGlobals: jest.fn(),
          });
          reg.registerExtensionPoint(scaffolderAutocompleteExtensionPoint, {
            addAutocompleteProvider: jest.fn(),
          });
          reg.registerInit({ deps: {}, async init() {} });
        },
      }),
      ...features,
    ],
  });
  try {
    expect(addEntityProvider).toHaveBeenCalledTimes(2);
    expect(registerProvider).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'rhaap' }),
    );
    expect(addActions).toHaveBeenCalledTimes(1);
    await options.verify?.(providers);
  } finally {
    await backend.stop();
  }
}

describe('AAP service registration', () => {
  it.each([
    ['catalog', catalogLoader],
    ['catalog alpha', catalogAlphaLoader],
  ])(
    'starts all dynamic modules with only the %s factory owner',
    async (_, owner) => {
      // Dynamic discovery returns independent package features without a host factory.
      await startAapModules([
        createBackendFeatureLoader({
          loader: () => [
            scaffolderLoader,
            authLoader,
            provisionerLoader,
            owner,
          ],
        }),
      ]);
    },
  );

  it('starts named modules with an explicitly registered host factory', async () => {
    await startAapModules([
      catalogModuleRhaap,
      scaffolderModuleAnsible,
      authModuleRhaapProvider,
      catalogModuleRhaapUserProvisioner,
      ansibleServiceFactory,
    ]);
  });

  it.each([
    ['alpha', catalogAlphaLoader, true],
    ['default', catalogLoader, false],
  ] as const)(
    'checks JIT callbacks across embedded copies with the %s loader',
    async (_name, owner, shared) => {
      let embeddedAuth!: typeof import('@ansible/backstage-plugin-auth-backend-module-rhaap-provider');
      let embeddedProvisioner!: typeof import('@ansible/backstage-plugin-catalog-backend-module-rhaap-user-provisioner');
      let authRef!: typeof import('@ansible/backstage-rhaap-common').userProvisionerRef;
      let catalogRef!: typeof authRef;
      // Each dynamic artifact has an independent module cache and default factory.
      jest.isolateModules(() => {
        embeddedAuth = jest.requireActual(
          '@ansible/backstage-plugin-auth-backend-module-rhaap-provider',
        );
        authRef = jest.requireActual(
          '@ansible/backstage-rhaap-common',
        ).userProvisionerRef;
      });
      jest.isolateModules(() => {
        embeddedProvisioner = jest.requireActual(
          '@ansible/backstage-plugin-catalog-backend-module-rhaap-user-provisioner',
        );
        catalogRef = jest.requireActual(
          '@ansible/backstage-rhaap-common',
        ).userProvisionerRef;
      });
      expect(authRef).not.toBe(catalogRef);
      expect(authRef.id).toBe(catalogRef.id);

      let authProvisioner!: IUserProvisioner;
      const getUserInfoById = jest.fn().mockResolvedValue({
        id: 42,
        username: 'alice',
        first_name: 'Alice',
        last_name: '',
        email: 'alice@example.test',
        is_superuser: false,
      });
      await startAapModules(
        [
          createServiceFactory({
            service: ansibleServiceRef,
            deps: {},
            factory: () =>
              ({
                getUserInfoById,
                getOrgsByUserId: jest
                  .fn()
                  .mockResolvedValue([{ id: 1, name: 'Default' }]),
                getTeamsByUserId: jest.fn().mockResolvedValue([]),
              }) as unknown as typeof ansibleServiceRef.T,
          }),
          createBackendPlugin({
            pluginId: 'jit-auth-consumer',
            register(reg) {
              reg.registerInit({
                deps: { provisioner: authRef },
                async init({ provisioner }) {
                  authProvisioner = provisioner;
                },
              });
            },
          }),
          owner,
          embeddedAuth.default,
          embeddedProvisioner.default,
          scaffolderLoader,
        ],
        {
          config: {
            ...config,
            catalog: {
              providers: {
                rhaap: {
                  dev: {
                    orgs: ['Default'],
                    sync: {
                      orgsUsersTeams: { enabled: false },
                      jobTemplates: { enabled: false },
                      pahCollections: { enabled: false },
                    },
                  },
                },
              },
            },
          },
          async verify(providers) {
            const provider = providers.find(
              p => p.getProviderName() === 'rhaap-user-provisioner',
            );
            expect(provider).toBeDefined();
            let createdUser: Entity | undefined;
            const applyMutation = jest.fn(async mutation => {
              createdUser = mutation.added.find(
                (entry: { entity: Entity }) => entry.entity.kind === 'User',
              )?.entity;
            });
            await provider!.connect({ applyMutation, refresh: jest.fn() });
            const factory =
              embeddedAuth.AAPAuthSignInResolvers.allowNewAAPUserSignIn({
                userProvisioner: authProvisioner,
              });
            const resolver = factory();
            const findCatalogUser = jest.fn(async () => {
              if (!createdUser) throw new Error('User missing from catalog');
              return { entity: createdUser };
            });
            const issueToken = jest
              .fn()
              .mockResolvedValue({ token: 'signed-in' });
            const signIn = resolver(
              {
                profile: { email: 'alice@example.test', displayName: 'Alice' },
                result: {
                  fullProfile: {
                    id: '42',
                    username: 'alice',
                    provider: 'aap',
                    displayName: 'Alice',
                  },
                  session: {
                    accessToken: 'test-token',
                    tokenType: 'Bearer',
                    scope: 'read',
                    expiresInSeconds: 3600,
                    refreshToken: 'refresh',
                  },
                },
              },
              {
                findCatalogUser,
                issueToken,
                signInWithCatalogUser: jest.fn(),
                resolveOwnershipEntityRefs: jest.fn(),
              },
            );
            const [outcome] = await Promise.allSettled([signIn]);
            expect(outcome).toEqual(
              shared
                ? { status: 'fulfilled', value: { token: 'signed-in' } }
                : {
                    status: 'rejected',
                    reason: new Error(
                      'UserProvisioner: no create user function registered for "alice". ' +
                        'Install catalog-backend-module-rhaap-user-provisioner to enable JIT user provisioning.',
                    ),
                  },
            );
            expect(getUserInfoById.mock.calls).toEqual(shared ? [[42]] : []);
            expect(applyMutation).toHaveBeenCalledTimes(Number(shared));
            expect(createdUser?.metadata.name).toBe(
              shared ? 'alice' : undefined,
            );
            expect(findCatalogUser).toHaveBeenCalledTimes(shared ? 2 : 1);
            expect(issueToken).toHaveBeenCalledTimes(Number(shared));
          },
        },
      );
    },
  );
});
