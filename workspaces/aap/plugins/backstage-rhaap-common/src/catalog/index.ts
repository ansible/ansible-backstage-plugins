/** @packageDocumentation */
export {
  createCatalogModule,
  type CreateCatalogModuleOptions,
} from './registerModule';
export { createRouter } from './router';
export type { CatalogModuleSlice } from './sliceGuard';
export {
  assertCatalogModuleSliceAllowed,
  resetCatalogModuleSliceGuardForTests,
} from './sliceGuard';
