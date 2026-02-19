import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { SyncNotification, SyncNotificationContextValue } from './types';

const generateId = (): string => {
  return `sync-notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const AUTO_HIDE_DURATIONS = {
  SYNC_STARTED: 30000,
  SYNC_COMPLETED: 8000,
  SYNC_FAILED: 0,
};

const SyncNotificationContext = createContext<
  SyncNotificationContextValue | undefined
>(undefined);

interface SyncNotificationProviderProps {
  children: ReactNode;
}

export const SyncNotificationProvider = ({
  children,
}: SyncNotificationProviderProps) => {
  const [notifications, setNotifications] = useState<SyncNotification[]>([]);

  const removeByCategory = useCallback((category: string) => {
    setNotifications(prev => prev.filter(n => n.category !== category));
  }, []);

  const addNotification = useCallback(
    (notification: Omit<SyncNotification, 'id' | 'timestamp'>): string => {
      const id = generateId();
      const newNotification: SyncNotification = {
        ...notification,
        id,
        timestamp: new Date(),
      };

      setNotifications(prev => [...prev, newNotification]);

      if (notification.autoHideDuration && notification.autoHideDuration > 0) {
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== id));
        }, notification.autoHideDuration);
      }

      return id;
    },
    [],
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const showSyncStarted = useCallback(
    (sources: string[]): string => {
      return addNotification({
        title: 'Sync started',
        description: `Syncing content from ${sources.length} source${sources.length > 1 ? 's' : ''}`,
        sources,
        severity: 'info',
        collapsible: true,
        category: 'sync-started',
        autoHideDuration: AUTO_HIDE_DURATIONS.SYNC_STARTED,
      });
    },
    [addNotification],
  );

  const showSyncCompleted = useCallback(
    (sourceName: string): string => {
      removeByCategory('sync-started');

      return addNotification({
        title: 'Sync completed',
        description: `Content from ${sourceName} has been synced.`,
        severity: 'success',
        collapsible: false,
        category: 'sync-completed',
        autoHideDuration: AUTO_HIDE_DURATIONS.SYNC_COMPLETED,
      });
    },
    [addNotification, removeByCategory],
  );

  const showSyncFailed = useCallback(
    (sourceName: string, error?: string): string => {
      removeByCategory('sync-started');

      return addNotification({
        title: 'Sync failed',
        description: error
          ? `Failed to sync ${sourceName}: ${error}`
          : `Failed to sync content from ${sourceName}.`,
        severity: 'error',
        collapsible: false,
        category: 'sync-failed',
        autoHideDuration: AUTO_HIDE_DURATIONS.SYNC_FAILED,
      });
    },
    [addNotification, removeByCategory],
  );

  const contextValue = useMemo<SyncNotificationContextValue>(
    () => ({
      notifications,
      addNotification,
      removeNotification,
      clearAll,
      showSyncStarted,
      showSyncCompleted,
      showSyncFailed,
    }),
    [
      notifications,
      addNotification,
      removeNotification,
      clearAll,
      showSyncStarted,
      showSyncCompleted,
      showSyncFailed,
    ],
  );

  return (
    <SyncNotificationContext.Provider value={contextValue}>
      {children}
    </SyncNotificationContext.Provider>
  );
};

export const useSyncNotifications = (): SyncNotificationContextValue => {
  const context = useContext(SyncNotificationContext);
  if (!context) {
    throw new Error(
      'useSyncNotifications must be used within a SyncNotificationProvider',
    );
  }
  return context;
};
