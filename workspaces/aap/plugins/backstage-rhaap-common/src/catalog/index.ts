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
export type {
  ContentCatalogRegistration,
  ContentCatalogProviderInitContext,
  ContentCatalogProviders,
  ContentAnsibleGitContentsProvider,
  ContentEeEntityProvider,
  ContentPahCollectionProvider,
} from './contentProviderContracts';
export { readAapApiEntityConfigs } from './providers/config';
export type { AapConfig, PAHRepositoryConfig } from './providers/types';
export {
  pahCollectionParser,
  scmCollectionParser,
  repositoryParser,
} from './providers/entityParser';
export { stampLatestVersionAnnotations } from './providers/versionUtils';
export type {
  CollectionParserOptions,
  RepositoryParserOptions,
} from './providers/ansible-collections/utils';
export {
  createCollectionIdentifier,
  createCollectionKey,
  createRepositoryKey,
  generateCollectionEntityName,
  generateRepositoryEntityName,
  generateSourceId,
  getDefaultHost,
  sanitizeEntityName,
  sanitizeHostName,
  sanitizeTagForBackstage,
} from './providers/ansible-collections/utils';
