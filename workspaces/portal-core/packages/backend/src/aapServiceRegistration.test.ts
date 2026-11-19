import { signalsServiceRef } from '@backstage/plugin-signals-node';
import { resetCatalogModuleSliceGuardForTests } from '@ansible/backstage-rhaap-common/catalog';
import {
  createBackendModule,
  createBackendPlugin,
  createServiceFactory,
  type BackendFeature,
} from '@backstage/backend-plugin-api';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import {
  catalogProcessingExtensionPoint,
  type EntityProvider,
} from '@backstage/plugin-catalog-node';
import { catalogModelExtensionPoint } from '@backstage/plugin-catalog-node/alpha';
import { authProvidersExtensionPoint } from '@backstage/plugin-auth-node';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import {
  scaffolderAutocompleteExtensionPoint,
  scaffolderTemplatingExtensionPoint,
} from '@backstage/plugin-scaffolder-node/alpha';
import aapBackend from '@ansible/aap-backend';
import {
  AAPClient,
  ansibleServiceRef,
  userProvisionerRef,
  type IAAPService,
  type IUserProvisioner,
} from '@ansible/aap-node';
import catalogLoader, {
  catalogModuleRhaap,
} from '@ansible/backstage-plugin-catalog-backend-module-rhaap';
import alphaCatalogLoader from '@ansible/backstage-plugin-catalog-backend-module-rhaap/alpha';
import authLoader, {
  authModuleRhaapProvider,
} from '@ansible/backstage-plugin-auth-backend-module-rhaap-provider';
import scaffolderLoader, {
  scaffolderModuleAap,
} from '@ansible/plugin-scaffolder-backend-module-aap';
import provisionerLoader, {
  catalogModuleRhaapUserProvisioner,
} from '@ansible/backstage-plugin-catalog-backend-module-rhaap-user-provisioner';

const config = {
  app: { baseUrl: 'http://localhost:3000' },
  backend: { baseUrl: 'http://localhost:7007' },
  ansible: {
    rhaap: {
      baseUrl: 'https://aap.example.com',
      token: 'test-token',
      checkSSL: true,
    },
  },
  catalog: {
    providers: {
      rhaap: {
        development: {
          orgs: 'Default',
          sync: {
            orgsUsersTeams: { enabled: false },
            jobTemplates: { enabled: false },
            pahCollections: { enabled: false },
            ansibleGitContents: { enabled: false },
          },
        },
      },
    },
  },
};

function setup(features: BackendFeature[]) {
  const providers: EntityProvider[] = [];
  const addActions = jest.fn();
  const registerProvider = jest.fn();
  const setFieldValidators = jest.fn();
  const services = new Map<
    string,
    { client: IAAPService; provisioner: IUserProvisioner }
  >();
  const probes = ['auth', 'catalog', 'scaffolder'].map(pluginId =>
    createBackendModule({
      pluginId,
      moduleId: 'aap-service-registration-test',
      register(reg) {
        reg.registerInit({
          deps: { client: ansibleServiceRef, provisioner: userProvisionerRef },
          async init(deps) {
            services.set(pluginId, deps);
          },
        });
      },
    }),
  );
  const hosts = [
    createBackendPlugin({
      pluginId: 'catalog',
      register(reg) {
        reg.registerExtensionPoint(catalogProcessingExtensionPoint, {
          addProcessor: jest.fn(),
          addPlaceholderResolver: jest.fn(),
          setOnProcessingErrorHandler: jest.fn(),
          addEntityProvider: (...added) => {
            providers.push(...added.flat());
          },
        });
        reg.registerExtensionPoint(catalogModelExtensionPoint, {
          setFieldValidators,
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
  ];
  return {
    providers,
    addActions,
    registerProvider,
    setFieldValidators,
    services,
    start: () =>
      startTestBackend({
        features: [
          ...hosts,
          createServiceFactory({
            service: signalsServiceRef,
            deps: {},
            factory: () => ({ publish: async () => undefined }),
          }),
          ...features,
          ...probes,
          mockServices.rootConfig.factory({ data: config }),
        ],
      }),
  };
}

const modules = [
  catalogModuleRhaap,
  authModuleRhaapProvider,
  scaffolderModuleAap,
  catalogModuleRhaapUserProvisioner,
];
const loaders = [
  catalogLoader,
  authLoader,
  scaffolderLoader,
  provisionerLoader,
];

describe('explicit AAP backend installation', () => {
  beforeEach(() => {
    resetCatalogModuleSliceGuardForTests();
  });
  it.each([
    ['named modules', modules],
    ['package loaders', loaders],
    [
      'alpha catalog loader',
      [alphaCatalogLoader, authLoader, scaffolderLoader, provisionerLoader],
    ],
  ] as const)(
    'starts all four AAP modules with %s and preserves service scopes',
    async (_name, features) => {
      const {
        start,
        services,
        providers,
        addActions,
        registerProvider,
        setFieldValidators,
      } = setup([aapBackend, ...features]);
      await start();
      expect(
        addActions.mock.calls.flat().map((action: { id: string }) => action.id),
      ).toEqual([
        'rhaap:create-project',
        'rhaap:create-execution-environment',
        'rhaap:create-job-template',
        'rhaap:launch-job-template',
        'rhaap:clean-up',
      ]);
      expect(registerProvider).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'rhaap' }),
      );
      expect(setFieldValidators).toHaveBeenCalledWith(
        expect.objectContaining({ isValidEntityName: expect.any(Function) }),
      );
      expect(providers.map(provider => provider.getProviderName())).toContain(
        'rhaap-user-provisioner',
      );
      const auth = services.get('auth')!;
      const catalog = services.get('catalog')!;
      const scaffolder = services.get('scaffolder')!;
      expect(auth.client).toBeInstanceOf(AAPClient);
      expect(catalog.client).toBeInstanceOf(AAPClient);
      expect(scaffolder.client).toBeInstanceOf(AAPClient);
      expect(auth.client).not.toBe(catalog.client);
      expect(scaffolder.client).not.toBe(catalog.client);
      expect(auth.provisioner).toBe(catalog.provisioner);
      expect(scaffolder.provisioner).toBe(catalog.provisioner);
    },
  );

  it('fails startup when the explicit service owner is absent', async () => {
    await expect(setup(loaders).start()).rejects.toThrow(
      /rhaap.client.service/,
    );
  });

  it('supports an explicit host service override without installing the concrete factory', async () => {
    const client = {} as IAAPService;
    const override = createServiceFactory({
      service: ansibleServiceRef,
      deps: {},
      factory: () => client,
    });
    const { start, services } = setup([override, ...loaders]);
    await start();
    expect(
      [...services.values()].every(service => service.client === client),
    ).toBe(true);
  });

  it('registers the shared JIT callback before use and requires a connected catalog provider', async () => {
    const { start, services, providers } = setup([aapBackend, ...loaders]);
    await start();
    const { client, provisioner } = services.get('catalog')!;
    await expect(provisioner.createUser('alice', 42)).rejects.toThrow(
      /not connected to catalog/,
    );
    const provider = providers.find(
      p => p.getProviderName() === 'rhaap-user-provisioner',
    )!;
    const applyMutation = jest.fn().mockResolvedValue(undefined);
    await provider.connect({ applyMutation, refresh: jest.fn() });
    jest.spyOn(client, 'getUserInfoById').mockResolvedValue({
      id: 42,
      username: 'alice',
      url: '/api/gateway/v1/users/42/',
      first_name: 'Alice',
      last_name: 'Example',
      email: 'alice@example.com',
      is_superuser: false,
    });
    jest
      .spyOn(client, 'getOrgsByUserId')
      .mockResolvedValue([{ id: 1, name: 'Default', groupName: 'default' }]);
    jest.spyOn(client, 'getTeamsByUserId').mockResolvedValue([]);
    await expect(
      services.get('auth')!.provisioner.createUser('alice', 42),
    ).resolves.toBe(true);
    expect(applyMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'delta',
        added: [
          expect.objectContaining({
            entity: expect.objectContaining({
              kind: 'User',
              metadata: expect.objectContaining({ name: 'alice' }),
            }),
          }),
        ],
      }),
    );
    jest
      .spyOn(client, 'getOrgsByUserId')
      .mockRejectedValue(new Error('AAP unavailable'));
    await expect(provisioner.createUser('alice', 42)).rejects.toThrow(
      /Failed to fetch user details/,
    );
    expect(applyMutation).toHaveBeenCalledTimes(1);
  });
});
