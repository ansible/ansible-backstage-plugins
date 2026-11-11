import { Navigate, Route, Routes } from 'react-router-dom';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { executionEnvironmentsViewPermission } from '@ansible/aap-common/permissions';

import { EENotificationBoundary } from './EENotificationBoundary';
import { EETabs } from './TabviewPage';

/**
 * Standalone mount for the dynamic-plugin EE route (e.g. RHDH at /self-service/ee).
 */
export const EERoutesPage = () => (
  <RequirePermission permission={executionEnvironmentsViewPermission}>
    <EENotificationBoundary>
      <Routes>
        <Route index element={<Navigate to="catalog" replace />} />
        <Route path="catalog" element={<EETabs />} />
        <Route path="create" element={<EETabs />} />
        <Route path="*" element={<Navigate to="catalog" replace />} />
      </Routes>
    </EENotificationBoundary>
  </RequirePermission>
);
