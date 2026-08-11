import { catalogModuleApme } from './module';
import { createRouter } from './router';
import { registerApmeCatalogSyncTasks } from './apmeCatalogSyncScheduler';
import { registerPortalGalaxyServersSync } from './portalGalaxyServersSync';
import { ApmeLearnedDepsEntityProvider } from './providers/ApmeLearnedDepsEntityProvider';
import { isApmeEnabled, getApmeConfig } from '@ansible/backstage-apme-common';

jest.mock('@backstage/backend-plugin-api', () => ({
  coreServices: {
    logger: 'logger',
    rootConfig: 'rootConfig',
    httpRouter: 'httpRouter',
    httpAuth: 'httpAuth',
    scheduler: 'scheduler',
    discovery: 'discovery',
    auth: 'auth',
    permissions: 'permissions',
  },
  createBackendModule: (opts: unknown) => opts,
}));

jest.mock('@ansible/backstage-apme-common', () => ({
  apmeServiceRef: 'apmeServiceRef',
  isApmeEnabled: jest.fn(),
  getApmeConfig: jest.fn(),
  resolveScanTargetVersion: jest.fn().mockResolvedValue('2.18'),
  APME_SETTINGS_CAPABILITY: 'apme',
}));

jest.mock('@backstage/plugin-catalog-node/alpha', () => ({
  catalogProcessingExtensionPoint: 'catalogProcessingExtensionPoint',
}));

jest.mock('@ansible/backstage-rhaap-common/permissions/extensionPoint', () => ({
  ansibleSettingsCapabilitiesExtensionPoint:
    'ansibleSettingsCapabilitiesExtensionPoint',
}));

jest.mock('./router', () => ({
  createRouter: jest.fn(),
}));

jest.mock('./apmeCatalogSyncScheduler', () => ({
  registerApmeCatalogSyncTasks: jest.fn(),
}));

jest.mock('./portalGalaxyServersSync', () => ({
  registerPortalGalaxyServersSync: jest.fn(),
}));

jest.mock('./providers/ApmeLearnedDepsEntityProvider', () => ({
  ApmeLearnedDepsEntityProvider: jest.fn(),
}));

describe('catalogModuleApme', () => {
  const mockCreateRouter = createRouter as jest.MockedFunction<
    typeof createRouter
  >;
  const mockRegisterCatalogSync =
    registerApmeCatalogSyncTasks as jest.MockedFunction<
      typeof registerApmeCatalogSyncTasks
    >;
  const mockRegisterGalaxySync =
    registerPortalGalaxyServersSync as jest.MockedFunction<
      typeof registerPortalGalaxyServersSync
    >;
  const mockIsApmeEnabled = isApmeEnabled as jest.MockedFunction<
    typeof isApmeEnabled
  >;
  const mockGetApmeConfig = getApmeConfig as jest.MockedFunction<
    typeof getApmeConfig
  >;
  const mockLearnedDepsProvider =
    ApmeLearnedDepsEntityProvider as unknown as jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsApmeEnabled.mockReturnValue(true);
    mockGetApmeConfig.mockReturnValue({
      portalSettingsPath: '/tmp/apme-settings.json',
      targetAnsibleCoreVersion: '2.18',
    } as any);
    mockCreateRouter.mockResolvedValue({} as any);
    mockRegisterGalaxySync.mockResolvedValue(undefined as any);
    mockLearnedDepsProvider.mockImplementation(() => ({
      schedule: jest.fn().mockResolvedValue(undefined),
    }));
  });

  function getInit() {
    const registerInit = jest.fn();
    (catalogModuleApme as any).register({ registerInit });
    return registerInit.mock.calls[0][0].init;
  }

  it('skips initialization when APME is disabled', async () => {
    mockIsApmeEnabled.mockReturnValue(false);
    const init = getInit();

    const logger = { info: jest.fn() };
    const settingsCapabilities = { addCapability: jest.fn() };

    await init({
      logger,
      rootConfig: {},
      apmeService: {},
      httpRouter: { use: jest.fn() },
      httpAuth: {},
      scheduler: {},
      discovery: {},
      auth: {},
      catalogProcessing: { addEntityProvider: jest.fn() },
      settingsCapabilities,
      permissions: {},
    });

    expect(logger.info).toHaveBeenCalledWith(
      'APME is disabled; skipping catalog module registration',
    );
    expect(settingsCapabilities.addCapability).not.toHaveBeenCalled();
    expect(mockCreateRouter).not.toHaveBeenCalled();
  });

  it('registers capability and initializes services when enabled', async () => {
    const init = getInit();

    const logger = { info: jest.fn() };
    const httpRouter = { use: jest.fn() };
    const settingsCapabilities = { addCapability: jest.fn() };
    const catalogProcessing = { addEntityProvider: jest.fn() };
    const scheduler = {};
    const apmeService = {};
    const auth = {};
    const discovery = {};
    const permissions = {};
    const httpAuth = {};
    const rootConfig = {};

    await init({
      logger,
      rootConfig,
      apmeService,
      httpRouter,
      httpAuth,
      scheduler,
      discovery,
      auth,
      catalogProcessing,
      settingsCapabilities,
      permissions,
    });

    expect(settingsCapabilities.addCapability).toHaveBeenCalledWith({
      id: 'apme',
      label: 'APME Quality',
    });

    expect(mockCreateRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        apmeService,
        logger,
        httpAuth,
        rootConfig,
        permissions,
      }),
    );
    expect(httpRouter.use).toHaveBeenCalledTimes(1);
    expect(mockRegisterCatalogSync).toHaveBeenCalledTimes(1);
    expect(mockRegisterGalaxySync).toHaveBeenCalledTimes(1);
    expect(catalogProcessing.addEntityProvider).toHaveBeenCalledTimes(1);
    expect(mockLearnedDepsProvider).toHaveBeenCalledTimes(1);
  });
});
