import { ConfigReader } from '@backstage/config';
import type {
  CreateBackendModuleOptions,
  BackendModuleRegistrationPoints,
} from '@backstage/backend-plugin-api';
import {
  automationContentSyncPermission,
  automationContentViewPermission,
} from '@ansible/automation-content-common/permissions';
import { catalogModuleAutomationContent } from './module';

jest.mock('@backstage/backend-plugin-api', () => ({
  ...jest.requireActual('@backstage/backend-plugin-api'),
  createBackendModule: (options: CreateBackendModuleOptions) => options,
}));

it('publishes view and sync permissions even without configured registries', async () => {
  const addPermissions = jest.fn();
  const addEntityProvider = jest.fn();
  const dependencies = {
    config: new ConfigReader({}),
    logger: { info: jest.fn() },
    catalog: { addEntityProvider },
    scheduler: { createScheduledTaskRunner: jest.fn() },
    permissionsRegistry: { addPermissions },
  };
  const registerInit = jest.fn() as jest.MockedFunction<
    BackendModuleRegistrationPoints['registerInit']
  >;
  const module =
    catalogModuleAutomationContent as unknown as CreateBackendModuleOptions;
  module.register({ registerInit, registerExtensionPoint: jest.fn() });
  const init = registerInit.mock.calls[0][0].init as (
    deps: typeof dependencies,
  ) => Promise<void>;
  await init(dependencies);
  expect(addPermissions).toHaveBeenCalledWith([
    automationContentViewPermission,
    automationContentSyncPermission,
  ]);
  expect(addEntityProvider).not.toHaveBeenCalled();
  expect(
    dependencies.scheduler.createScheduledTaskRunner,
  ).not.toHaveBeenCalled();
});
