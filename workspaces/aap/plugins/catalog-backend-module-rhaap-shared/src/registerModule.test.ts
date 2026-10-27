import {
  catalogModelExtensionPoint,
  catalogProcessingExtensionPoint,
} from '@backstage/plugin-catalog-node/alpha';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { SchedulerServiceTaskScheduleDefinition } from '@backstage/backend-plugin-api';

import { createCatalogModule } from './registerModule';
import { MOCK_CONFIG } from './mock';
import { resetCatalogModuleSliceGuardForTests } from './sliceGuard';

jest.mock('./router', () => ({
  createRouter: jest
    .fn()
    .mockResolvedValue((_req: unknown, _res: unknown, next: () => void) =>
      next(),
    ),
}));

describe('createCatalogModule', () => {
  afterEach(() => {
    resetCatalogModuleSliceGuardForTests();
  });

  it('registers AAP entity providers from catalog.providers.aap with rhaap fallback', async () => {
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
        [
          catalogModelExtensionPoint,
          { setFieldValidators: () => undefined },
        ],
        [catalogProcessingExtensionPoint, extensionPoint],
      ],
      features: [
        createCatalogModule({ moduleId: 'aap', slice: 'aap' }),
        mockServices.rootConfig.factory(MOCK_CONFIG),
        scheduler.factory,
      ],
    });

    expect(usedSchedule?.frequency).toEqual({ months: 1 });
    expect(addedProviderCount).toBeGreaterThan(0);
  });
});
