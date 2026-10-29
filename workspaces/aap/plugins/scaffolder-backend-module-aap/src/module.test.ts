import { scaffolderModuleAap } from './module';

jest.mock('@ansible/backstage-rhaap-common', () => ({
  ansibleServiceRef: Symbol('ansibleServiceRef'),
}));

import {
  createProjectAction,
  createExecutionEnvironment,
  createJobTemplate,
  launchJobTemplate,
  cleanUp,
} from './actions';
import {
  multiResourceFilter,
  resourceFilter,
  useCaseNameFilter,
  uuidFilter,
} from './filters';
import { handleAutocompleteRequest } from './autocomplete';

jest.mock('./autocomplete', () => ({
  handleAutocompleteRequest: jest.fn().mockResolvedValue({ results: [] }),
}));

const config = {
  getString: (key: string) =>
    key === 'app.baseUrl' ? 'http://localhost:3000' : '',
} as any;

describe('scaffolderModuleAap', () => {
  it('registers its actions, filters, and autocomplete provider', async () => {
    const env: any = {
      scaffolder: { addActions: jest.fn() },
      scaffolderTemplating: { addTemplateFilters: jest.fn() },
      autocomplete: { addAutocompleteProvider: jest.fn() },
      config,
      logger: {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      },
      ansibleService: {},
      auth: {},
      discovery: {},
    };

    const registrations = (scaffolderModuleAap as any).getRegistrations();
    for (const registration of registrations) {
      await registration.init.func(env);
    }

    const actions = env.scaffolder.addActions.mock.calls[0];
    expect(actions.map((action: any) => action.id)).toEqual([
      createProjectAction({} as any).id,
      createExecutionEnvironment({} as any).id,
      createJobTemplate({} as any).id,
      launchJobTemplate({} as any, config).id,
      cleanUp({} as any).id,
    ]);
    expect(actions.map((action: any) => action.id)).toEqual([
      'rhaap:create-project',
      'rhaap:create-execution-environment',
      'rhaap:create-job-template',
      'rhaap:launch-job-template',
      'rhaap:clean-up',
    ]);

    expect(env.scaffolderTemplating.addTemplateFilters).toHaveBeenCalledWith({
      useCaseNameFilter,
      resourceFilter,
      multiResourceFilter,
      uuidFilter,
    });

    const [provider] = env.autocomplete.addAutocompleteProvider.mock.calls[0];
    expect(provider.id).toBe('aap-api');
    await expect(
      provider.handler({ resource: 'x', token: 't', context: {} }),
    ).resolves.toEqual({ results: [] });
    expect(handleAutocompleteRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'x',
        token: 't',
        context: {},
        config: env.config,
        logger: env.logger,
        ansibleService: env.ansibleService,
      }),
    );
  });
});
