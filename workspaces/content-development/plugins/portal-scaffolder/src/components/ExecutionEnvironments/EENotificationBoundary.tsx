import { useEffect, type ReactNode } from 'react';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
  syncPollingService,
} from '../notifications';

const EENotificationContent = ({ children }: { children: ReactNode }) => {
  const { notifications, removeNotification } = useNotifications();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  useEffect(() => {
    syncPollingService.initialize(discoveryApi, fetchApi);
  }, [discoveryApi, fetchApi]);

  return (
    <>
      {children}
      <NotificationStack
        notifications={notifications}
        onClose={removeNotification}
      />
    </>
  );
};

/** Shared notification lifecycle for EE section and direct detail routes. */
export const EENotificationBoundary = ({
  children,
}: {
  children: ReactNode;
}) => (
  <NotificationProvider>
    <EENotificationContent>{children}</EENotificationContent>
  </NotificationProvider>
);
