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
      config,
      auth: {},
      discovery: {},
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
        auth: env.auth,
        discovery: env.discovery,
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
});
