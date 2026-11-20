/**
 * @jest-environment node
 */
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import {
  createServiceFactory,
  SchedulerServiceTaskScheduleDefinition,
} from '@backstage/backend-plugin-api';
import catalogPlugin from '@backstage/plugin-catalog-backend';
import { catalogModelExtensionPoint } from '@backstage/plugin-catalog-node/alpha';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { signalsServiceRef } from '@backstage/plugin-signals-node';

import ansibleServiceFactory from '@ansible/aap-backend';
import { AAPEntityProvider } from './providers/AAPEntityProvider';
import { AAPJobTemplateProvider } from './providers/AAPJobTemplateProvider';
import { createCatalogModule } from './registerModule';
import { MOCK_CONFIG } from './mock';
import { resetCatalogModuleSliceGuardForTests } from './sliceGuard';
import type { ContentCatalogRegistration } from './contentProviderContracts';

const mockSignalsServiceFactory = createServiceFactory({
  service: signalsServiceRef,
  deps: {},
  factory: () => ({
    publish: async () => undefined,
  }),
});

const mockSetAapSignals = jest.fn();
const mockSetJobSignals = jest.fn();

jest.mock('./providers/AAPEntityProvider', () => ({
  AAPEntityProvider: {
    fromConfig: jest.fn(() => [
      {
        getProviderName: () => 'AAPEntityProvider:test',
        setSignals: mockSetAapSignals,
        connect: jest.fn(),
      },
    ]),
  },
}));

jest.mock('./providers/AAPJobTemplateProvider', () => ({
  AAPJobTemplateProvider: {
    fromConfig: jest.fn(() => [
      {
        getProviderName: () => 'AAPJobTemplateProvider:test',
        setSignals: mockSetJobSignals,
        connect: jest.fn(),
      },
    ]),
  },
}));

jest.mock('./router', () => ({
  createRouter: jest.fn(
    async () => (_req: unknown, _res: unknown, next: () => void) => next(),
  ),
}));

jest.mock('./EERegistrationLock', () => ({
  createEERegistrationLock: jest.fn(
    () => async (_ref: string, op: any) =>
      op({
        assertLockHeld: () => undefined,
        beginMutation: async () => undefined,
        beginRegistrationMutation: async () => undefined,
        completeRegistration: async () => undefined,
        clearRegistration: async () => undefined,
        registrationState: 'none',
      }),
  ),
}));

const splitBackendConfig = mockServices.rootConfig.factory({
  data: {
    ansible: {
      rhaap: {
        baseUrl: 'https://aap.example.test',
        token: 'test-token',
        checkSSL: false,
      },
    },
    backend: {
      baseUrl: 'http://localhost:7007',
      auth: {
        externalAccess: [
          { options: { subject: 'plugin:catalog' } },
          { options: {} },
        ],
      },
    },
  },
});

const mockContentRegistration: ContentCatalogRegistration = {
  createProviders: jest.fn(async () => ({
    eeEntityProvider: {
      getProviderName: () => 'EEEntityProvider',
      connect: async () => undefined,
      registerExecutionEnvironment: async () => undefined,
      unregisterExecutionEnvironment: async () => undefined,
    },
    pahCollectionProviders: [],
    ansibleGitContentsProviders: [],
  })),
};

describe('createCatalogModule', () => {
  beforeEach(() => {
    resetCatalogModuleSliceGuardForTests();
    jest.clearAllMocks();
  });

  it('starts an AAP-only slice and wires signals onto AAP providers', async () => {
    const backend = await startTestBackend({
      features: [
        catalogPlugin,
        createCatalogModule({ moduleId: 'aap', slice: 'aap' }),
        ansibleServiceFactory,
        mockSignalsServiceFactory,
        splitBackendConfig,
      ],
    });

    try {
      expect(backend.server.listening).toBe(true);
      expect(mockSetAapSignals).toHaveBeenCalled();
      expect(mockSetJobSignals).toHaveBeenCalled();
    } finally {
      await backend.stop();
    }
  });

  it('starts a content slice when registration is provided', async () => {
    const backend = await startTestBackend({
      features: [
        catalogPlugin,
        createCatalogModule({
          moduleId: 'content',
          slice: 'content',
          contentCatalogRegistration: mockContentRegistration,
        }),
        ansibleServiceFactory,
        mockSignalsServiceFactory,
        splitBackendConfig,
      ],
    });

    try {
      expect(backend.server.listening).toBe(true);
      expect(mockContentRegistration.createProviders).toHaveBeenCalled();
    } finally {
      await backend.stop();
    }
  });

  it('throws when a content slice is missing registration', async () => {
    await expect(
      startTestBackend({
        features: [
          catalogPlugin,
          createCatalogModule({ moduleId: 'content', slice: 'content' }),
          ansibleServiceFactory,
          mockSignalsServiceFactory,
          splitBackendConfig,
        ],
      }),
    ).rejects.toThrow(/Content slice requires contentCatalogRegistration/);
  });

  it('starts an EE-only slice without content providers', async () => {
    const backend = await startTestBackend({
      features: [
        catalogPlugin,
        createCatalogModule({ moduleId: 'ee', slice: 'ee' }),
        ansibleServiceFactory,
        mockSignalsServiceFactory,
        splitBackendConfig,
      ],
    });

    try {
      expect(backend.server.listening).toBe(true);
      expect(mockContentRegistration.createProviders).not.toHaveBeenCalled();
    } finally {
      await backend.stop();
    }
  });

  it('starts the deprecated rhaap shim with content registration', async () => {
    const backend = await startTestBackend({
      features: [
        catalogPlugin,
        createCatalogModule({
          moduleId: 'rhaap',
          slice: 'all',
          deprecated: true,
          contentCatalogRegistration: mockContentRegistration,
        }),
        ansibleServiceFactory,
        mockSignalsServiceFactory,
        splitBackendConfig,
      ],
    });

    try {
      expect(backend.server.listening).toBe(true);
      expect(mockContentRegistration.createProviders).toHaveBeenCalled();
    } finally {
      await backend.stop();
    }
  });

  it('registers AAP entity providers from catalog.providers.aap with rhaap fallback', async () => {
    const { AAPEntityProvider: ActualAAPEntityProvider } = jest.requireActual(
      './providers/AAPEntityProvider',
    );
    const { AAPJobTemplateProvider: ActualAAPJobTemplateProvider } =
      jest.requireActual('./providers/AAPJobTemplateProvider');
    (AAPEntityProvider.fromConfig as jest.Mock).mockImplementation(
      ActualAAPEntityProvider.fromConfig.bind(ActualAAPEntityProvider),
    );
    (AAPJobTemplateProvider.fromConfig as jest.Mock).mockImplementation(
      ActualAAPJobTemplateProvider.fromConfig.bind(
        ActualAAPJobTemplateProvider,
      ),
    );

    let addedProviderCount = 0;
    let usedSchedule: SchedulerServiceTaskScheduleDefinition | undefined;

    const extensionPoint = {
      addEntityProvider: (...providers: unknown[]) => {
        addedProviderCount += providers.length;
      },
    };

    const runner = jest.fn();
    const scheduler = mockServices.scheduler.mock({
      createScheduledTaskRunner(schedule) {
        usedSchedule = schedule;
        return { run: runner };
      },
    });

    await startTestBackend({
      extensionPoints: [
        [catalogModelExtensionPoint, { setFieldValidators: () => undefined }],
        [catalogProcessingExtensionPoint, extensionPoint],
      ],
      features: [
        createCatalogModule({ moduleId: 'aap', slice: 'aap' }),
        ansibleServiceFactory,
        mockSignalsServiceFactory,
        mockServices.rootConfig.factory(MOCK_CONFIG),
        scheduler.factory,
      ],
    });

    expect(usedSchedule?.frequency).toEqual({ months: 1 });
    expect(addedProviderCount).toBeGreaterThan(0);
  });
});
