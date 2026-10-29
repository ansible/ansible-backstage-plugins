import { scaffolderModulePortalScaffolder } from './module';
import {
  createAnsibleContentAction,
  createEEDefinitionAction,
  prepareForPublishAction,
} from './actions';

describe('scaffolderModulePortalScaffolder', () => {
  it('registers the three portal-scaffolder actions', async () => {
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
      eeLifecycle: {
        registerExecutionEnvironment: jest.fn(),
        unregisterExecutionEnvironment: jest.fn().mockResolvedValue({ mode: 'noop' }),
      },
      logger: { debug: jest.fn() },
    };

    const registrations = (
      scaffolderModulePortalScaffolder as any
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

  it('registers the portal collection autocomplete provider', async () => {
    const config: any = { getString: () => 'http://localhost:3000' };
    const env: any = {
      scaffolder: { addActions: jest.fn() },
      autocomplete: { addAutocompleteProvider: jest.fn() },
      config,
      auth: {},
      discovery: {},
      eeLifecycle: {
        registerExecutionEnvironment: jest.fn(),
        unregisterExecutionEnvironment: jest.fn().mockResolvedValue({ mode: 'noop' }),
      },
      logger: { debug: jest.fn() },
    };
    const registrations = (
      scaffolderModulePortalScaffolder as any
    ).getRegistrations();
    for (const registration of registrations) {
      await registration.init.func(env);
    }

    expect(env.autocomplete.addAutocompleteProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'portal-catalog' }),
    );
  });
});
