import { ContentCatalogBoundary } from './ContentCatalogBoundary';
import { CollectionsRoutesPage } from './CollectionsCatalog';
import { GitRepositoriesRoutesPage } from './GitRepositories';

export function AutomationContentCollectionsPage() {
  return (
    <ContentCatalogBoundary>
      <CollectionsRoutesPage />
    </ContentCatalogBoundary>
  );
}

export function AutomationContentGitRepositoriesPage() {
  return (
    <ContentCatalogBoundary>
      <GitRepositoriesRoutesPage />
    </ContentCatalogBoundary>
  );
}
