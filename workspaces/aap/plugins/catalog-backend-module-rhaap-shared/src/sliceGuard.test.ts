import {
  assertCatalogModuleSliceAllowed,
  resetCatalogModuleSliceGuardForTests,
} from './sliceGuard';

describe('sliceGuard', () => {
  afterEach(() => {
    resetCatalogModuleSliceGuardForTests();
  });

  it('allows split modules together', () => {
    assertCatalogModuleSliceAllowed('aap', 'aap');
    assertCatalogModuleSliceAllowed('interim-content', 'content');
    assertCatalogModuleSliceAllowed('self-service-ee', 'ee');
  });

  it('rejects shim with split modules', () => {
    assertCatalogModuleSliceAllowed('aap', 'aap');
    expect(() => assertCatalogModuleSliceAllowed('rhaap', 'all')).toThrow(
      /deprecated catalog-backend-module-rhaap/,
    );
  });

  it('rejects split after shim', () => {
    assertCatalogModuleSliceAllowed('rhaap', 'all');
    expect(() => assertCatalogModuleSliceAllowed('aap', 'aap')).toThrow(
      /while deprecated catalog-backend-module-rhaap/,
    );
  });
});
