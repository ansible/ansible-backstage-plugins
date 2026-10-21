import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useSyncExternalStore,
  ReactNode,
} from 'react';
import { NotificationContextValue, ShowNotificationOptions } from './types';
import { notificationStore } from './notificationStore';

const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined,
);

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider = ({
  children,
}: NotificationProviderProps) => {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      notificationStore.subscribe(() => {
        onStoreChange();
      }),
    [],
  );

  const notifications = useSyncExternalStore(
    subscribe,
    () => notificationStore.getNotifications(),
    () => [],
  );

  const showNotification = useCallback(
    (options: ShowNotificationOptions): string => {
      return notificationStore.showNotification(options);
    },
    [],
  );

  const removeNotification = useCallback((id: string) => {
    notificationStore.removeNotification(id);
  }, []);

  const clearAll = useCallback(() => {
    notificationStore.clearAll();
  }, []);

  const contextValue = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      showNotification,
      removeNotification,
      clearAll,
    }),
    [notifications, showNotification, removeNotification, clearAll],
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      'useNotifications must be used within a NotificationProvider',
    );
  }
  return context;
};
