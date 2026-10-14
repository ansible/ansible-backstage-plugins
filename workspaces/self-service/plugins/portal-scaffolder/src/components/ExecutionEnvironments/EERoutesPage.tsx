import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequirePermission } from '@backstage/plugin-permission-react';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { executionEnvironmentsViewPermission } from '@ansible/backstage-rhaap-common/permissions';

import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
  syncPollingService,
} from '../notifications';
import { EETabs } from './TabviewPage';

/**
 * Standalone mount for the dynamic-plugin EE route (e.g. RHDH at /self-service/ee).
 */
const EERoutesContent = () => {
  const { notifications, removeNotification } = useNotifications();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  useEffect(() => {
    syncPollingService.initialize(discoveryApi, fetchApi);
  }, [discoveryApi, fetchApi]);

  return (
    <>
      <Routes>
        <Route index element={<Navigate to="catalog" replace />} />
        <Route path="catalog" element={<EETabs />} />
        <Route path="create" element={<EETabs />} />
        <Route path="*" element={<Navigate to="catalog" replace />} />
      </Routes>
      <NotificationStack
        notifications={notifications}
        onClose={removeNotification}
      />
    </>
  );
};

export const EERoutesPage = () => (
  <RequirePermission permission={executionEnvironmentsViewPermission}>
    <NotificationProvider>
      <EERoutesContent />
    </NotificationProvider>
  </RequirePermission>
);
