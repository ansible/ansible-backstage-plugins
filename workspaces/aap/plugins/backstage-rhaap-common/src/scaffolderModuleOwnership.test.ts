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
