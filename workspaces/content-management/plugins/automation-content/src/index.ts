export { automationContentPlugin, AutomationContentPage } from './plugin';
export { AutomationContentSidebarItem } from './components/SidebarItem';
export { automationContentApiRef, AutomationContentClient } from './api';
export type {
  AutomationContentApi,
  ExecutionEnvironment,
  Collection,
  ContentItem,
  ContentItemSummary,
  Registry,
  RegistryCapabilities,
  Enumeration,
} from './api';
export { rootRouteRef } from './routes';
export { automationContentManifest } from './manifest';

// Compatibility exports consumed by the legacy /self-service shell while
// Git and collection ownership moves to content-management.
export {
  CollectionsCatalogPage,
  CollectionsRoutesPage,
  CollectionDetailsPage,
  invalidateCollections,
} from './components/CollectionsCatalog';
export {
  GitRepositoriesPage,
  GitRepositoriesRoutesPage,
  RepositoryDetailsPage,
  gitReposCache,
} from './components/GitRepositories';
export {
  CatalogSyncButton,
  CatalogSyncHeader,
  CollectionsEmptyState,
  CONFIGURATION_DOCS_URL,
  fetchGitFileContentFromBackend,
  fetchReadmeFromBackend,
} from './components/common';
export type {
  CatalogSyncHeaderProps,
  CollectionsEmptyStateProps,
  FetchReadmeParams,
  FetchGitFileOutcome,
} from './components/common';
export { CollectionsPickerFieldExtension } from './components/Scaffolder/CollectionsPicker';
export { ScmSelectorFieldExtension } from './components/Scaffolder/ScmSelector';
export type {
  ScmSelectorData,
  ScmSelectorOptions,
} from './components/Scaffolder/ScmSelector';
