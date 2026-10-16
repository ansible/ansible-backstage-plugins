import { useEffect } from 'react';
import { Route, Routes, Navigate, Outlet, useLocation } from 'react-router-dom';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import {
  executionEnvironmentsViewPermission,
  collectionsViewPermission,
  gitRepositoriesViewPermission,
  templatesViewPermission,
  historyViewPermission,
} from '@ansible/backstage-rhaap-common/permissions';

import { HomeComponent } from '../Home';
import { JobTemplatesProvider } from '../Home/JobTemplatesProvider';
import { CatalogImport } from '../CatalogImport';
import { RequireSuperuser } from '../CatalogImport/RequireSuperuser';
import { CreateTask } from '../CreateTask';
import { RunTask } from '../RunTask';
import { FeedbackFooter } from '../feedback/FeedbackFooter';
import { TaskList } from '../TaskList';
import { CatalogItemsDetails } from '../CatalogItemDetails';
import { EETabs } from '../ExecutionEnvironments';
import { EEDetailsPage } from '../ExecutionEnvironments/catalog/EEDetailsPage';
import { CollectionsCatalogPage } from '../CollectionsCatalog';
import { CollectionDetailsPage } from '../CollectionsCatalog/CollectionDetailsPage';
import { invalidateCollections } from '../CollectionsCatalog/collectionsInvalidation';
import { GitRepositoriesPage } from '../GitRepositories';
import { RepositoryDetailsPage } from '../GitRepositories/RepositoryDetailsPage';
import { gitReposCache } from '../GitRepositories/gitReposCache';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
  syncPollingService,
} from '../notifications';
import { DynamicExtensionDiscovery } from '../../extensions';
import { selfServiceManifest } from '../../selfServiceManifest';

const RouteViewContent = () => {
  const { notifications, removeNotification } = useNotifications();
  const location = useLocation();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  // Initialize the global sync polling service
  useEffect(() => {
    syncPollingService.initialize(discoveryApi, fetchApi);
  }, [discoveryApi, fetchApi]);

  // Register page-specific cache invalidators. These live here (rather than
  // inside syncPollingService) so the service has no direct dependency on
  // domain-specific cache modules.
  useEffect(() => {
    const unsubCollections = syncPollingService.addInvalidator(() =>
      invalidateCollections(),
    );
    const unsubRepos = syncPollingService.addInvalidator(() =>
      gitReposCache.invalidateFetchedData(),
    );
    return () => {
      unsubCollections();
      unsubRepos();
    };
  }, []);

  return (
    <>
      <Routes>
        <Route
          element={
            <RequirePermission permission={templatesViewPermission}>
              <JobTemplatesProvider>
                <Outlet />
              </JobTemplatesProvider>
            </RequirePermission>
          }
        >
          <Route
            path="catalog"
            element={<HomeComponent key={location.key} />}
          />
          <Route
            path="catalog/:namespace/:templateName"
            element={<CatalogItemsDetails />}
          />
        </Route>
        <Route
          path="catalog-import"
          element={
            <RequirePermission permission={catalogEntityCreatePermission}>
              <RequireSuperuser>
                <CatalogImport />
              </RequireSuperuser>
            </RequirePermission>
          }
        />
        <Route path="create">
          <Route
            path="templates/:namespace/:templateName"
            element={
              <RequirePermission permission={templatesViewPermission}>
                <CreateTask />
              </RequirePermission>
            }
          />
          <Route
            path="tasks"
            element={
              <RequirePermission permission={historyViewPermission}>
                <TaskList />
              </RequirePermission>
            }
          />
          <Route
            path="tasks/:taskId"
            element={
              <RequirePermission permission={historyViewPermission}>
                <RunTask />
              </RequirePermission>
            }
          />
        </Route>
        <Route
          path="ee"
          element={
            <RequirePermission permission={executionEnvironmentsViewPermission}>
              <Outlet />
            </RequirePermission>
          }
        >
          <Route index element={<Navigate to="catalog" replace />} />
          <Route path="catalog" element={<EETabs />} />
          <Route path="create" element={<EETabs />} />
          <Route path="*" element={<Navigate to="catalog" replace />} />
        </Route>
        <Route
          path="catalog/:templateName"
          element={
            <RequirePermission permission={executionEnvironmentsViewPermission}>
              <EEDetailsPage />
            </RequirePermission>
          }
        />
        <Route
          path="collections"
          element={
            <RequirePermission permission={collectionsViewPermission}>
              <CollectionsCatalogPage />
            </RequirePermission>
          }
        />
        <Route
          path="collections/:collectionName"
          element={
            <RequirePermission permission={collectionsViewPermission}>
              <CollectionDetailsPage />
            </RequirePermission>
          }
        />
        <Route
          path="repositories"
          element={
            <RequirePermission permission={gitRepositoriesViewPermission}>
              <Outlet />
            </RequirePermission>
          }
        >
          <Route index element={<Navigate to="catalog" replace />} />
          <Route path="catalog" element={<GitRepositoriesPage />} />
          <Route path="ci-activity" element={<GitRepositoriesPage />} />
          <Route path=":repositoryName" element={<RepositoryDetailsPage />} />
        </Route>
        {/* Default redirects */}
        <Route
          path="/catalog/*"
          element={<Navigate to="/self-service/catalog" />}
        />
        <Route path="*" element={<Navigate to="/self-service/catalog" />} />
      </Routes>
      <FeedbackFooter />
      <NotificationStack
        notifications={notifications}
        onClose={removeNotification}
      />
    </>
  );
};

export const RouteView = () => {
  return (
    <NotificationProvider>
      <DynamicExtensionDiscovery manifests={[selfServiceManifest]} />
      <RouteViewContent />
    </NotificationProvider>
  );
};
