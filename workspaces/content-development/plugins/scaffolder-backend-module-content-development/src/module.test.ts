import { scaffolderModuleContentDevelopment } from './module';
import {
  createAnsibleContentAction,
  createEEDefinitionAction,
  prepareForPublishAction,
} from './actions';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import scaffolderFeatureLoader from './index';

const scaffolderBackend =
  require('@backstage/plugin-scaffolder-backend').default;

describe('scaffolderModuleContentDevelopment', () => {
  it('starts with its lifecycle factory provided by the package feature loader', async () => {
    const backend = await startTestBackend({
      features: [
        scaffolderFeatureLoader,
        scaffolderBackend,
        mockServices.rootConfig.factory({
          data: { app: { baseUrl: 'http://localhost:3000' } },
        } as any),
      ],
    });

    try {
      expect(backend).toBeDefined();
    } finally {
      await backend.stop();
    }
  });

  it('registers the three content-development actions', async () => {
    const config: any = {
      getString: (key: string) =>
        key === 'app.baseUrl' ? 'http://localhost:3000' : '',
    };
    const env: any = {
      scaffolder: { addActions: jest.fn() },
      autocomplete: { addAutocompleteProvider: jest.fn() },
      config,
      auth: {},
      discovery: {},
      httpAuth: {},
      httpRouter: { use: jest.fn() },
      eeLifecycle: {
        registerExecutionEnvironment: jest.fn(),
        unregisterExecutionEnvironment: jest
          .fn()
          .mockResolvedValue({ mode: 'noop' }),
      },
      logger: { debug: jest.fn() },
    };

    const registrations = (
      scaffolderModuleContentDevelopment as any
    ).getRegistrations();
    for (const registration of registrations) {
      await registration.init.func(env);
    }

    const actions = env.scaffolder.addActions.mock.calls[0];
    expect(actions.map((action: any) => action.id)).toEqual([
      createAnsibleContentAction(config).id,
      createEEDefinitionAction({
        frontendUrl: config.getString('app.baseUrl'),
        eeLifecycle: env.eeLifecycle,
        config,
      }).id,
      prepareForPublishAction({ rootConfig: config }).id,
    ]);
    expect(actions.map((action: any) => action.id)).toEqual([
      'ansible:content:create',
      'ansible:create:ee-definition',
      'ansible:prepare:publish',
    ]);
  });

  it('registers an authenticated collections route', async () => {
    const config: any = { getString: () => 'http://localhost:3000' };
    const env: any = {
      scaffolder: { addActions: jest.fn() },
      config,
      auth: {},
      discovery: {},
      httpAuth: {},
      httpRouter: { use: jest.fn() },
      eeLifecycle: {
        registerExecutionEnvironment: jest.fn(),
        unregisterExecutionEnvironment: jest
          .fn()
          .mockResolvedValue({ mode: 'noop' }),
      },
      logger: { debug: jest.fn() },
    };
    const registrations = (
      scaffolderModuleContentDevelopment as any
    ).getRegistrations();
    for (const registration of registrations) {
      await registration.init.func(env);
    }

    expect(env.httpRouter.use).toHaveBeenCalledTimes(1);
  });
});
