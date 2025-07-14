import {
  catalogModelExtensionPoint,
  catalogProcessingExtensionPoint,
} from '@backstage/plugin-catalog-node/alpha';
import { catalogModuleRhaap } from './module';
import { SchedulerServiceTaskScheduleDefinition } from '@backstage/backend-plugin-api';
import { AAPEntityProvider } from './providers/AAPEntityProvider';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { MOCK_CONFIG } from './mock';

describe('catalogModuleRHAAPEntityProvider', () => {
  it('should register provider at the catalog extension point', async () => {
    let addedProviders: Array<AAPEntityProvider> | undefined;
    let usedSchedule: SchedulerServiceTaskScheduleDefinition | undefined;
    const modelExtensionPoint = {
      setFieldValidators: (validators: any) => jest.fn(validators),
    };
    const extensionPoint = {
      addEntityProvider: (providers: any) => {
        addedProviders = providers;
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
        [catalogModelExtensionPoint, modelExtensionPoint],
        [catalogProcessingExtensionPoint, extensionPoint],
      ],
      features: [
        catalogModuleRhaap,
        mockServices.rootConfig.factory(MOCK_CONFIG),
        scheduler.factory,
      ],
    });

    expect(usedSchedule?.frequency).toEqual({ months: 1 });
    expect(usedSchedule?.timeout).toEqual({ minutes: 3 });
    expect(addedProviders?.length).toEqual(1);
    expect(addedProviders?.pop()?.getProviderName()).toEqual(
      'AapEntityProvider:development',
    );
    expect(runner).not.toHaveBeenCalled();
  });
});
