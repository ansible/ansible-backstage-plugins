/**
 * scaffolderModuleAnsible.test.ts
 */

import { scaffolderModuleAnsible } from './module';

// --- Mock dependencies ---
jest.mock('./actions', () => ({
  createAnsibleContentAction: jest.fn(() => 'action1'),
  createProjectAction: jest.fn(() => 'action2'),
  createExecutionEnvironment: jest.fn(() => 'action3'),
  createJobTemplate: jest.fn(() => 'action4'),
  launchJobTemplate: jest.fn(() => 'action5'),
  cleanUp: jest.fn(() => 'action6'),
  createShowCases: jest.fn(() => 'action7'),
  createEEDefinitionAction: jest.fn(() => 'action8'),
  createEETemplateAction: jest.fn(() => 'action9'),
  prepareForPublishAction: jest.fn(() => 'action10'),
  createEECatalogInfoAction: jest.fn(() => 'action11'),
}));

jest.mock('./filters', () => ({
  multiResourceFilter: 'multiResourceFilterValue',
  resourceFilter: 'resourceFilterValue',
  useCaseNameFilter: 'useCaseNameFilterValue',
}));

jest.mock('./autocomplete', () => ({
  handleAutocompleteRequest: jest.fn(() => Promise.resolve({ results: [] })),
}));

jest.mock('./router', () => ({
  createRouter: jest.fn(() => Promise.resolve(jest.fn())),
}));

jest.mock('@ansible/backstage-rhaap-common', () => ({
  getAnsibleConfig: jest.fn(() => ({ ansible: 'config' })),
  ansibleServiceRef: Symbol('ansibleServiceRef'),
}));

// import mocks for assertions
import { createShowCases } from './actions';
import {
  multiResourceFilter,
  resourceFilter,
  useCaseNameFilter,
} from './filters';
import { handleAutocompleteRequest } from './autocomplete';
import { getAnsibleConfig } from '@ansible/backstage-rhaap-common';

describe('scaffolderModuleAnsible', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('init registers actions, template filters, and autocomplete provider', async () => {
    // --- Fake environment ---
    const fakeEnv: any = {
      scaffolder: { addActions: jest.fn() },
      scaffolderTemplating: { addTemplateFilters: jest.fn() },
      autocomplete: { addAutocompleteProvider: jest.fn() },
      config: {
        getString: jest.fn((key: string) => {
          if (key === 'app.baseUrl') {
            return 'http://localhost:3000';
          }
          return '';
        }),
      },
      logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn() },
      ansibleService: { name: 'ansibleService' },
      httpRouter: { use: jest.fn() },
      auth: {
        getOwnServiceCredentials: jest.fn(),
        getPluginRequestToken: jest.fn(),
      },
      discovery: {
        getBaseUrl: jest.fn(),
      },
    };

    // --- Get registrations from module ---
    const registrations = (scaffolderModuleAnsible as any).getRegistrations();
    expect(registrations.length).toBeGreaterThan(0);

    // --- Call init function ---
    for (const reg of registrations) {
      await reg.init.func(fakeEnv);
    }

    // --- Verify actions registered ---
    expect(fakeEnv.scaffolder.addActions).toHaveBeenCalledTimes(1);
    const actions = fakeEnv.scaffolder.addActions.mock.calls[0];
    expect(actions).toContain('action1');
    expect(actions).toContain('action2');
    expect(actions).toContain('action3');
    expect(actions).toContain('action4');
    expect(actions).toContain('action5');
    expect(actions).toContain('action6');
    expect(actions).toContain('action7');

    // --- Verify template filters ---
    expect(
      fakeEnv.scaffolderTemplating.addTemplateFilters,
    ).toHaveBeenCalledTimes(1);
    const filtersArg =
      fakeEnv.scaffolderTemplating.addTemplateFilters.mock.calls[0][0];
    expect(filtersArg).toEqual({
      useCaseNameFilter,
      resourceFilter,
      multiResourceFilter,
    });

    // --- Verify autocomplete provider ---
    expect(fakeEnv.autocomplete.addAutocompleteProvider).toHaveBeenCalledTimes(
      1,
    );
    const providerArg =
      fakeEnv.autocomplete.addAutocompleteProvider.mock.calls[0][0];
    expect(providerArg).toHaveProperty('id', 'aap-api-cloud');
    expect(typeof providerArg.handler).toBe('function');

    // --- Test autocomplete handler forwarding ---
    const handlerResult = await providerArg.handler({
      resource: 'my-resource',
      token: 'my-token',
      context: {},
    });

    expect(handleAutocompleteRequest).toHaveBeenCalledTimes(1);
    const calledWith = (handleAutocompleteRequest as jest.Mock).mock
      .calls[0][0];
    expect(calledWith).toMatchObject({
      resource: 'my-resource',
      token: 'my-token',
      context: {},
      config: fakeEnv.config,
      logger: fakeEnv.logger,
      ansibleService: fakeEnv.ansibleService,
    });
    expect(handlerResult).toEqual({ results: [] });

    // --- Verify createShowCases call ---
    expect(createShowCases).toHaveBeenCalledWith(
      fakeEnv.ansibleService,
      (getAnsibleConfig as jest.Mock).mock.results[0].value,
    );

    // --- Verify httpRouter.use call ---
    expect(fakeEnv.httpRouter.use).toHaveBeenCalledTimes(1);
  });
});
