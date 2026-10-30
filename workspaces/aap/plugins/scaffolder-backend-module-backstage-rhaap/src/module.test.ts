/**
 * scaffolderModuleAnsible.test.ts
 */

import { scaffolderModuleAnsible } from './module';

// --- Mock dependencies ---
// NOTE: './actions' is intentionally left unmocked here. This test asserts
// the registered action IDs by invoking the real action constructors (see
// "Verify actions registered" below), so a drift in a real action's `id`
// fails this test instead of being hidden behind a mock. See the Phase 0
// contract-freeze test (contractFreeze.test.ts) and
// .sdlc/research/scaffolder-implementation-guide.md §2.5/§6.

jest.mock('./filters', () => ({
  multiResourceFilter: 'multiResourceFilterValue',
  resourceFilter: 'resourceFilterValue',
  useCaseNameFilter: 'useCaseNameFilterValue',
  uuidFilter: 'uuidFilterValue',
}));

jest.mock('./autocomplete', () => ({
  handleAutocompleteRequest: jest.fn(() => Promise.resolve({ results: [] })),
}));

jest.mock('@ansible/backstage-rhaap-common', () => ({
  getAnsibleConfig: jest.fn(() => ({ ansible: 'config' })),
  ansibleServiceRef: Symbol('ansibleServiceRef'),
}));

// import mocks for assertions
import { createEEDefinitionAction, prepareForPublishAction } from './actions';
import {
  multiResourceFilter,
  resourceFilter,
  useCaseNameFilter,
  uuidFilter,
} from './filters';
import { handleAutocompleteRequest } from './autocomplete';

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
      logger: {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      },
      ansibleService: { name: 'ansibleService' },
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

    expect(fakeEnv.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Deprecated scaffolder module loaded'),
    );

    // --- Verify actions registered ---
    // Real action constructors run here (see note above), so these IDs come
    // from production code, not from a mock standing in for it. This is the
    // full set of 8 actions the monolithic module registers today — 5
    // `rhaap:*` (target: scaffolder-backend-module-aap) + 3 `ansible:*`
    // (target: portal-scaffolder-backend-module).
    expect(fakeEnv.scaffolder.addActions).toHaveBeenCalledTimes(1);
    const actions = fakeEnv.scaffolder.addActions.mock.calls[0];
    const actionIds = actions.map((action: any) => action.id);
    expect(actionIds).toEqual([
      'ansible:content:create',
      'rhaap:create-project',
      'rhaap:create-execution-environment',
      'rhaap:create-job-template',
      'rhaap:launch-job-template',
      'rhaap:clean-up',
      'ansible:create:ee-definition',
      'ansible:prepare:publish',
    ]);

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
      uuidFilter,
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
  });
});
