import { useEffect, type PropsWithChildren } from 'react';
import { matchPath, Navigate, useLocation } from 'react-router-dom';
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

export const SELF_SERVICE_EE = '/self-service/ee';
export const SELF_SERVICE_EE_CATALOG = '/self-service/ee/catalog';
export const SELF_SERVICE_EE_CREATE = '/self-service/ee/create';

const resolveEERouteElement = (pathname: string) => {
  if (pathname === SELF_SERVICE_EE || pathname === `${SELF_SERVICE_EE}/`) {
    return <Navigate to={SELF_SERVICE_EE_CATALOG} replace />;
  }
  if (
    pathname === SELF_SERVICE_EE_CREATE ||
    matchPath({ path: SELF_SERVICE_EE_CREATE, end: true }, pathname) ||
    matchPath({ path: 'create', end: true }, pathname) ||
    pathname.includes('/ee/create')
  ) {
    return <EETabs />;
  }
  if (
    pathname === SELF_SERVICE_EE_CATALOG ||
    matchPath({ path: SELF_SERVICE_EE_CATALOG, end: true }, pathname) ||
    matchPath({ path: 'catalog', end: true }, pathname) ||
    pathname.includes('/ee/catalog')
  ) {
    return <EETabs />;
  }
  return <Navigate to={SELF_SERVICE_EE_CATALOG} replace />;
};

const EEPageProviders = ({ children }: PropsWithChildren) => (
  <RequirePermission permission={executionEnvironmentsViewPermission}>
    <NotificationProvider>{children}</NotificationProvider>
  </RequirePermission>
);

const EEPageContent = () => {
  const { pathname } = useLocation();
  const { notifications, removeNotification } = useNotifications();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  useEffect(() => {
    syncPollingService.initialize(discoveryApi, fetchApi);
  }, [discoveryApi, fetchApi]);

  return (
    <>
      {resolveEERouteElement(pathname)}
      <NotificationStack
        notifications={notifications}
        onClose={removeNotification}
      />
    </>
  );
};

/** RHDH 2.1 NFS: mounted at `/self-service/ee/catalog` or `/self-service/ee/create`. */
export const EESectionPage = () => (
  <EEPageProviders>
    <EEPageContent />
  </EEPageProviders>
);

/**
 * Standalone mount for the dynamic-plugin EE route (e.g. RHDH at /self-service/ee).
 * Scalprum / RHDH 1.10: mounted once at `/self-service/ee/*`.
 */
export const EERoutesPage = () => (
  <EEPageProviders>
    <EEPageContent />
  </EEPageProviders>
);
