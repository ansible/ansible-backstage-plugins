import { useEffect } from 'react';
import { Route, Routes, Navigate, Outlet } from 'react-router-dom';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import { taskReadPermission } from '@backstage/plugin-scaffolder-common/alpha';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import {
  executionEnvironmentsViewPermission,
  collectionsViewPermission,
  gitRepositoriesViewPermission,
} from '@ansible/backstage-rhaap-common/permissions';

import { HomeComponent } from '../Home';
import { CatalogImport } from '../CatalogImport';
import { CreateTask } from '../CreateTask';
import { RunTask } from '../RunTask';
import { FeedbackFooter } from '../feedback/FeedbackFooter';
import { TaskList } from '../TaskList';
import { CatalogItemsDetails } from '../CatalogItemDetails';
import { EETabs } from '../ExecutionEnvironments';
import { EEDetailsPage } from '../ExecutionEnvironments/catalog/EEDetailsPage';
import { CollectionsCatalogPage } from '../CollectionsCatalog';
import { CollectionDetailsPage } from '../CollectionsCatalog/CollectionDetailsPage';
import { GitRepositoriesPage } from '../GitRepositories';
import { RepositoryDetailsPage } from '../GitRepositories/RepositoryDetailsPage';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
  syncPollingService,
} from '../notifications';

const RouteViewContent = () => {
  const { notifications, removeNotification } = useNotifications();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  // Initialize the global sync polling service
  useEffect(() => {
    syncPollingService.initialize(discoveryApi, fetchApi);
  }, [discoveryApi, fetchApi]);

  return (
    <>
      <Routes>
        <Route path="catalog" element={<HomeComponent />} />
        <Route
          path="catalog/:namespace/:templateName"
          element={<CatalogItemsDetails />}
        />
        <Route
          path="catalog-import"
          element={
            <RequirePermission permission={catalogEntityCreatePermission}>
              <CatalogImport />
            </RequirePermission>
          }
        />
        <Route path="create">
          <Route
            path="templates/:namespace/:templateName"
            element={<CreateTask />}
          />
          <Route
            path="tasks"
            element={
              <RequirePermission
                permission={taskReadPermission}
                resourceRef="scaffolder-task"
              >
                <TaskList />
              </RequirePermission>
            }
          />
          <Route
            path="tasks/:taskId"
            element={
              <RequirePermission
                permission={taskReadPermission}
                resourceRef="scaffolder-task"
              >
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
      <RouteViewContent />
    </NotificationProvider>
  );
};
