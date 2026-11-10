import {
  createBackendFeatureLoader,
  createBackendPlugin,
  type BackendFeature,
} from '@backstage/backend-plugin-api';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { authProvidersExtensionPoint } from '@backstage/plugin-auth-node';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { catalogModelExtensionPoint } from '@backstage/plugin-catalog-node/alpha';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import {
  scaffolderAutocompleteExtensionPoint,
  scaffolderTemplatingExtensionPoint,
} from '@backstage/plugin-scaffolder-node/alpha';
import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';
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

async function startAapModules(features: BackendFeature[]) {
  const addEntityProvider = jest.fn();
  const registerProvider = jest.fn();
  const addActions = jest.fn();
  const backend = await startTestBackend({
    features: [
      mockServices.rootConfig.factory({ data: config }),
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
  await backend.stop();
  expect(addEntityProvider).toHaveBeenCalledTimes(2);
  expect(registerProvider).toHaveBeenCalledWith(
    expect.objectContaining({ providerId: 'rhaap' }),
  );
  expect(addActions).toHaveBeenCalledTimes(1);
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
});
