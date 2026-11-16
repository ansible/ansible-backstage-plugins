import { mockServices } from '@backstage/backend-test-utils';
import { ConfigReader } from '@backstage/config';
import { createEEEntityLifecycleService } from '@ansible/content-development-common';
import { createEEDefinitionAction as createContentDevelopmentEEDefinitionAction } from '@ansible/plugin-scaffolder-backend-module-content-development';
import { createEEDefinitionAction } from './createEEDefinition';

jest.mock('@ansible/content-development-common', () => ({
  createEEEntityLifecycleService: jest.fn(),
}));

jest.mock(
  '@ansible/plugin-scaffolder-backend-module-content-development',
  () => ({
    createEEDefinitionAction: jest.fn(),
  }),
);

describe('legacy createEEDefinitionAction adapter', () => {
  it('keeps the legacy factory signature and delegates to the shared implementation', () => {
    const auth = mockServices.auth.mock();
    const discovery = mockServices.discovery.mock();
    const config = new ConfigReader({});
    const lifecycle = {
      registerExecutionEnvironment: jest.fn(),
      unregisterExecutionEnvironment: jest.fn(),
    };
    const action = { id: 'ansible:create:ee-definition' };
    jest
      .mocked(createEEEntityLifecycleService)
      .mockReturnValue(lifecycle as any);
    jest
      .mocked(createContentDevelopmentEEDefinitionAction)
      .mockReturnValue(action as any);

    const result = createEEDefinitionAction({
      frontendUrl: 'https://portal.example.com',
      auth,
      discovery,
      config,
    });

    expect(createEEEntityLifecycleService).toHaveBeenCalledWith({
      auth,
      discovery,
    });
    expect(createContentDevelopmentEEDefinitionAction).toHaveBeenCalledWith({
      frontendUrl: 'https://portal.example.com',
      eeLifecycle: lifecycle,
      config,
    });
    expect(result).toBe(action);
  });
});
