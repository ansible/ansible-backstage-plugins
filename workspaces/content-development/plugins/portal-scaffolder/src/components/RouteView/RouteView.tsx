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
  templatesViewPermission,
} from '@ansible/portal-extension-common';

import { HomeComponent } from '../Home';
import { JobTemplatesProvider } from '../Home/JobTemplatesProvider';
import { CatalogImport } from '../CatalogImport';
import { RequireSuperuser } from '../CatalogImport/RequireSuperuser';
import { CreateTask } from '../CreateTask';
import { FeedbackFooter } from '../feedback/FeedbackFooter';
import { CatalogItemsDetails } from '../CatalogItemDetails';
import { EETabs } from '../ExecutionEnvironments';
import { EEDetailsPage } from '../ExecutionEnvironments/catalog/EEDetailsPage';
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
          <Route path="create" element={<Navigate to="/create" replace />} />
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
