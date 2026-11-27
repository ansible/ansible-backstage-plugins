import { Notification, ShowNotificationOptions } from './types';

type NotificationListener = (notifications: Notification[]) => void;

const DEFAULT_AUTO_HIDE_DURATIONS: Record<string, number> = {
  info: 15000,
  success: 15000,
  warning: 15000,
  error: 0,
};

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `notif-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

class NotificationStore {
  private notifications: Notification[] = [];
  private readonly listeners: Set<NotificationListener> = new Set();
  private readonly autoHideTimeouts: Map<string, NodeJS.Timeout> = new Map();
  /** Per-notification exit timers from {@link startExitAnimation} */
  private readonly exitAnimationTimeouts: Map<string, NodeJS.Timeout> =
    new Map();
  /** Batch timers from {@link showNotification} dismissCategories path */
  private readonly pendingDismissTimeouts: Set<NodeJS.Timeout> = new Set();

  private static readonly EXIT_ANIMATION_DURATION = 300;

  getNotifications(): Notification[] {
    return this.notifications;
  }

  subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const currentNotifications = this.getNotifications();
    this.listeners.forEach(listener => listener(currentNotifications));
  }

  private removeNotificationById(id: string): void {
    const exitT = this.exitAnimationTimeouts.get(id);
    if (exitT) {
      clearTimeout(exitT);
      this.exitAnimationTimeouts.delete(id);
    }
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.notifyListeners();
  }

  private removeNotificationsByCategories(categories: string[]): void {
    const idsBeingRemoved = this.notifications
      .filter(n => n.category && categories.includes(n.category))
      .map(n => n.id);
    for (const id of idsBeingRemoved) {
      const exitT = this.exitAnimationTimeouts.get(id);
      if (exitT) {
        clearTimeout(exitT);
        this.exitAnimationTimeouts.delete(id);
      }
    }
    this.notifications = this.notifications.filter(
      n => !n.category || !categories.includes(n.category),
    );
    this.notifyListeners();
  }

  private startExitAnimation(id: string): void {
    const existing = this.exitAnimationTimeouts.get(id);
    if (existing) {
      clearTimeout(existing);
      this.exitAnimationTimeouts.delete(id);
    }

    this.notifications = this.notifications.map(n =>
      n.id === id ? { ...n, isExiting: true } : n,
    );
    this.notifyListeners();

    const timeout = setTimeout(() => {
      this.removeNotificationById(id);
    }, NotificationStore.EXIT_ANIMATION_DURATION);
    this.exitAnimationTimeouts.set(id, timeout);
  }

  showNotification(options: ShowNotificationOptions): string {
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

    if (hasDismissCategories) {
      this.notifications
        .filter(
          n =>
            n.category &&
            categoriesToDismiss.includes(n.category) &&
            !n.isExiting,
        )
        .forEach(n => {
          const timeout = this.autoHideTimeouts.get(n.id);
          if (timeout) {
            clearTimeout(timeout);
            this.autoHideTimeouts.delete(n.id);
          }
        });

      this.notifications = this.notifications.map(n =>
        n.category && categoriesToDismiss.includes(n.category) && !n.isExiting
          ? { ...n, isExiting: true }
          : n,
      );

      const dismissTimeout = setTimeout(() => {
        this.pendingDismissTimeouts.delete(dismissTimeout);
        this.removeNotificationsByCategories(categoriesToDismiss);
      }, NotificationStore.EXIT_ANIMATION_DURATION);
      this.pendingDismissTimeouts.add(dismissTimeout);
    }

    this.notifications = [...this.notifications, newNotification];
    this.notifyListeners();

    if (autoHideDuration > 0) {
      const timeout = setTimeout(() => {
        this.autoHideTimeouts.delete(id);
        this.startExitAnimation(id);
      }, autoHideDuration);
      this.autoHideTimeouts.set(id, timeout);
    }

    return id;
  }

  removeNotification(id: string): void {
    const timeout = this.autoHideTimeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.autoHideTimeouts.delete(id);
    }
    this.startExitAnimation(id);
  }

  clearAll(): void {
    this.autoHideTimeouts.forEach(t => clearTimeout(t));
    this.autoHideTimeouts.clear();

    this.exitAnimationTimeouts.forEach(t => clearTimeout(t));
    this.exitAnimationTimeouts.clear();

    this.pendingDismissTimeouts.forEach(t => clearTimeout(t));
    this.pendingDismissTimeouts.clear();

    this.notifications = [];
    this.notifyListeners();
  }
}

export const notificationStore = new NotificationStore();
