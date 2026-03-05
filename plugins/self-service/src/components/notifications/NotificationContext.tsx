import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import {
  Notification,
  NotificationContextValue,
  ShowNotificationOptions,
} from './types';

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `notif-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const DEFAULT_AUTO_HIDE_DURATIONS: Record<string, number> = {
  info: 15000,
  success: 15000,
  warning: 15000,
  error: 0,
};

const EXIT_ANIMATION_DURATION = 300;

const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined,
);

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider = ({
  children,
}: NotificationProviderProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const autoHideTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const removeNotificationById = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const removeNotificationsByCategories = useCallback(
    (categories: string[]) => {
      setNotifications(prev =>
        prev.filter(n => !n.category || !categories.includes(n.category)),
      );
    },
    [],
  );

  const startExitAnimation = useCallback(
    (id: string) => {
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isExiting: true } : n)),
      );
      setTimeout(() => removeNotificationById(id), EXIT_ANIMATION_DURATION);
    },
    [removeNotificationById],
  );

  const showNotification = useCallback(
    (options: ShowNotificationOptions): string => {
      const id = generateId();
      const severity = options.severity ?? 'info';
      const autoHideDuration =
        options.autoHideDuration ??
        DEFAULT_AUTO_HIDE_DURATIONS[severity] ??
        15000;

      const newNotification: Notification = {
        id,
        title: options.title,
        description: options.description,
        items: options.items,
        severity,
        collapsible: options.collapsible ?? false,
        category: options.category,
        timestamp: new Date(),
        autoHideDuration,
        isExiting: false,
      };

      const categoriesToDismiss = options.dismissCategories ?? [];
      const hasDismissCategories = categoriesToDismiss.length > 0;

      setNotifications(prev => {
        if (hasDismissCategories) {
          prev
            .filter(
              n =>
                n.category &&
                categoriesToDismiss.includes(n.category) &&
                !n.isExiting,
            )
            .forEach(n => {
              const timeout = autoHideTimeoutsRef.current.get(n.id);
              if (timeout) {
                clearTimeout(timeout);
                autoHideTimeoutsRef.current.delete(n.id);
              }
            });
        }

        const updated = hasDismissCategories
          ? prev.map(n =>
              n.category &&
              categoriesToDismiss.includes(n.category) &&
              !n.isExiting
                ? { ...n, isExiting: true }
                : n,
            )
          : prev;

        return [...updated, newNotification];
      });

      if (hasDismissCategories) {
        setTimeout(
          () => removeNotificationsByCategories(categoriesToDismiss),
          EXIT_ANIMATION_DURATION,
        );
      }

      if (autoHideDuration > 0) {
        const timeout = setTimeout(() => {
          autoHideTimeoutsRef.current.delete(id);
          startExitAnimation(id);
        }, autoHideDuration);
        autoHideTimeoutsRef.current.set(id, timeout);
      }

      return id;
    },
    [startExitAnimation, removeNotificationsByCategories],
  );

  const removeNotification = useCallback(
    (id: string) => {
      const timeout = autoHideTimeoutsRef.current.get(id);
      if (timeout) {
        clearTimeout(timeout);
        autoHideTimeoutsRef.current.delete(id);
      }
      startExitAnimation(id);
    },
    [startExitAnimation],
  );

  const clearAll = useCallback(() => {
    autoHideTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    autoHideTimeoutsRef.current.clear();
    setNotifications([]);
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
