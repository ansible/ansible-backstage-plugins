import { assertAapScaffolderModuleIsUnique } from './scaffolderModuleOwnership';

describe('assertAapScaffolderModuleIsUnique', () => {
  it('allows either AAP scaffolder module to register by itself', () => {
    expect(() =>
      assertAapScaffolderModuleIsUnique({}, 'scaffolderModuleAap'),
    ).not.toThrow();
    expect(() =>
      assertAapScaffolderModuleIsUnique({}, 'scaffolderModuleAnsible'),
    ).not.toThrow();
  });

  it('rejects a second AAP module before it registers duplicate actions', () => {
    const extensionPoint = {};
    assertAapScaffolderModuleIsUnique(
      extensionPoint,
      'scaffolderModuleAnsible',
    );

    expect(() =>
      assertAapScaffolderModuleIsUnique(extensionPoint, 'scaffolderModuleAap'),
    ).toThrow(/Install only one AAP scaffolder module/);
  });
});

it('shares ownership across separately loaded module copies', () => {
  const extensionPoint = {};
  jest.isolateModules(() => {
    const copy = jest.requireActual<
      typeof import('./scaffolderModuleOwnership')
    >('./scaffolderModuleOwnership');
    copy.assertAapScaffolderModuleIsUnique(
      extensionPoint,
      'scaffolderModuleAnsible',
    );
  });
  jest.isolateModules(() => {
    const copy = jest.requireActual<
      typeof import('./scaffolderModuleOwnership')
    >('./scaffolderModuleOwnership');
    expect(() =>
      copy.assertAapScaffolderModuleIsUnique(
        extensionPoint,
        'scaffolderModuleAap',
      ),
    ).toThrow(/Install only one AAP scaffolder module/);
  });
});
