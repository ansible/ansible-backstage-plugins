import { notificationStore } from './notificationStore';

describe('notificationStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    notificationStore.clearAll();
  });

  afterEach(() => {
    jest.useRealTimers();
    notificationStore.clearAll();
  });

  describe('showNotification', () => {
    it('adds a notification and returns an id', () => {
      const id = notificationStore.showNotification({
        title: 'Test',
        description: 'Test description',
      });

      expect(id).toMatch(/^notif-/);
      const notifications = notificationStore.getNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Test');
      expect(notifications[0].description).toBe('Test description');
    });

    it('uses default severity of info when not provided', () => {
      notificationStore.showNotification({ title: 'Test' });

      const notifications = notificationStore.getNotifications();
      expect(notifications[0].severity).toBe('info');
    });

    it('uses provided severity', () => {
      notificationStore.showNotification({ title: 'Test', severity: 'error' });

      const notifications = notificationStore.getNotifications();
      expect(notifications[0].severity).toBe('error');
    });

    it('uses default autoHideDuration based on severity', () => {
      notificationStore.showNotification({ title: 'Info', severity: 'info' });
      notificationStore.showNotification({
        title: 'Success',
        severity: 'success',
      });
      notificationStore.showNotification({
        title: 'Warning',
        severity: 'warning',
      });
      notificationStore.showNotification({ title: 'Error', severity: 'error' });

      const notifications = notificationStore.getNotifications();
      expect(notifications[0].autoHideDuration).toBe(15000);
      expect(notifications[1].autoHideDuration).toBe(15000);
      expect(notifications[2].autoHideDuration).toBe(15000);
      expect(notifications[3].autoHideDuration).toBe(0);
    });

    it('uses provided autoHideDuration', () => {
      notificationStore.showNotification({
        title: 'Test',
        autoHideDuration: 5000,
      });

      const notifications = notificationStore.getNotifications();
      expect(notifications[0].autoHideDuration).toBe(5000);
    });

    it('sets collapsible to false by default', () => {
      notificationStore.showNotification({ title: 'Test' });

      const notifications = notificationStore.getNotifications();
      expect(notifications[0].collapsible).toBe(false);
    });

    it('sets collapsible when provided', () => {
      notificationStore.showNotification({ title: 'Test', collapsible: true });

      const notifications = notificationStore.getNotifications();
      expect(notifications[0].collapsible).toBe(true);
    });

    it('includes items when provided', () => {
      const items = ['Item 1', 'Item 2'];
      notificationStore.showNotification({ title: 'Test', items });

      const notifications = notificationStore.getNotifications();
      expect(notifications[0].items).toEqual(items);
    });

    it('includes category when provided', () => {
      notificationStore.showNotification({ title: 'Test', category: 'sync' });

      const notifications = notificationStore.getNotifications();
      expect(notifications[0].category).toBe('sync');
    });

    it('sets timestamp', () => {
      const before = new Date();
      notificationStore.showNotification({ title: 'Test' });
      const after = new Date();

      const notifications = notificationStore.getNotifications();
      expect(notifications[0].timestamp.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(notifications[0].timestamp.getTime()).toBeLessThanOrEqual(
        after.getTime(),
      );
    });

    it('sets isExiting to false initially', () => {
      notificationStore.showNotification({ title: 'Test' });

      const notifications = notificationStore.getNotifications();
      expect(notifications[0].isExiting).toBe(false);
    });
  });

  describe('auto-hide', () => {
    it('auto-hides notification after autoHideDuration', () => {
      notificationStore.showNotification({
        title: 'Test',
        autoHideDuration: 5000,
      });

      expect(notificationStore.getNotifications()).toHaveLength(1);

      // Advance past autoHideDuration
      jest.advanceTimersByTime(5000);

      // Should be in exit animation
      expect(notificationStore.getNotifications()[0].isExiting).toBe(true);

      // Advance past exit animation
      jest.advanceTimersByTime(300);

      expect(notificationStore.getNotifications()).toHaveLength(0);
    });

    it('does not auto-hide when autoHideDuration is 0', () => {
      notificationStore.showNotification({
        title: 'Test',
        autoHideDuration: 0,
      });

      jest.advanceTimersByTime(60000);

      expect(notificationStore.getNotifications()).toHaveLength(1);
      expect(notificationStore.getNotifications()[0].isExiting).toBe(false);
    });
  });

  describe('removeNotification', () => {
    it('removes notification after exit animation', () => {
      const id = notificationStore.showNotification({
        title: 'Test',
        autoHideDuration: 0,
      });

      notificationStore.removeNotification(id);

      // Should be in exit animation
      expect(notificationStore.getNotifications()[0].isExiting).toBe(true);

      // Advance past exit animation
      jest.advanceTimersByTime(300);

      expect(notificationStore.getNotifications()).toHaveLength(0);
    });

    it('clears auto-hide timeout when manually removed', () => {
      const id = notificationStore.showNotification({
        title: 'Test',
        autoHideDuration: 10000,
      });

      // Remove before auto-hide
      notificationStore.removeNotification(id);
      jest.advanceTimersByTime(300);

      expect(notificationStore.getNotifications()).toHaveLength(0);

      // Original auto-hide should not cause issues
      jest.advanceTimersByTime(10000);
    });
  });

  describe('dismissCategories', () => {
    it('dismisses notifications of specified categories', () => {
      notificationStore.showNotification({
        title: 'First',
        category: 'cat-a',
        autoHideDuration: 0,
      });
      notificationStore.showNotification({
        title: 'Second',
        category: 'cat-b',
        autoHideDuration: 0,
      });

      notificationStore.showNotification({
        title: 'Third',
        category: 'cat-c',
        dismissCategories: ['cat-a'],
      });

      // cat-a should be exiting
      const notifications = notificationStore.getNotifications();
      expect(notifications.find(n => n.title === 'First')?.isExiting).toBe(
        true,
      );
      expect(notifications.find(n => n.title === 'Second')?.isExiting).toBe(
        false,
      );

      // After animation, cat-a is removed
      jest.advanceTimersByTime(300);

      const remaining = notificationStore.getNotifications();
      expect(remaining.find(n => n.title === 'First')).toBeUndefined();
      expect(remaining.find(n => n.title === 'Second')).toBeDefined();
      expect(remaining.find(n => n.title === 'Third')).toBeDefined();
    });

    it('clears auto-hide timeouts for dismissed notifications', () => {
      notificationStore.showNotification({
        title: 'First',
        category: 'cat-a',
        autoHideDuration: 10000,
      });

      notificationStore.showNotification({
        title: 'Second',
        dismissCategories: ['cat-a'],
      });

      jest.advanceTimersByTime(300);

      // Should not throw when original timeout fires
      jest.advanceTimersByTime(10000);

      expect(notificationStore.getNotifications()).toHaveLength(1);
    });
  });

  describe('clearAll', () => {
    it('removes all notifications', () => {
      notificationStore.showNotification({ title: 'First' });
      notificationStore.showNotification({ title: 'Second' });
      notificationStore.showNotification({ title: 'Third' });

      expect(notificationStore.getNotifications()).toHaveLength(3);

      notificationStore.clearAll();

      expect(notificationStore.getNotifications()).toHaveLength(0);
    });

    it('clears all auto-hide timeouts', () => {
      notificationStore.showNotification({
        title: 'Test',
        autoHideDuration: 5000,
      });

      notificationStore.clearAll();

      // Advance past the original auto-hide time - should not throw or re-add
      jest.advanceTimersByTime(5000);

      expect(notificationStore.getNotifications()).toHaveLength(0);
    });

    it('cancels exit-animation timers so removal does not run after clearAll', () => {
      const id = notificationStore.showNotification({
        title: 'Test',
        autoHideDuration: 0,
      });

      notificationStore.removeNotification(id);
      expect(notificationStore.getNotifications()[0].isExiting).toBe(true);

      notificationStore.clearAll();

      jest.advanceTimersByTime(300);

      expect(notificationStore.getNotifications()).toHaveLength(0);
    });

    it('cancels dismissCategories batch timer so category removal does not run after clearAll', () => {
      notificationStore.showNotification({
        title: 'First',
        category: 'cat-a',
        autoHideDuration: 0,
      });
      notificationStore.showNotification({
        title: 'Second',
        dismissCategories: ['cat-a'],
      });

      expect(notificationStore.getNotifications()).toHaveLength(2);

      notificationStore.clearAll();

      notificationStore.showNotification({
        title: 'New',
        category: 'cat-a',
        autoHideDuration: 0,
      });

      jest.advanceTimersByTime(300);

      expect(notificationStore.getNotifications()).toHaveLength(1);
      expect(notificationStore.getNotifications()[0].title).toBe('New');
    });
  });

  describe('subscribe', () => {
    it('notifies listener when notification is added', () => {
      const listener = jest.fn();
      notificationStore.subscribe(listener);

      notificationStore.showNotification({ title: 'Test' });

      expect(listener).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ title: 'Test' })]),
      );
    });

    it('notifies listener when notification is removed', () => {
      const listener = jest.fn();
      const id = notificationStore.showNotification({
        title: 'Test',
        autoHideDuration: 0,
      });

      notificationStore.subscribe(listener);
      listener.mockClear();

      notificationStore.removeNotification(id);

      // Called for isExiting = true
      expect(listener).toHaveBeenCalled();

      jest.advanceTimersByTime(300);

      // Called for actual removal
      expect(listener).toHaveBeenLastCalledWith([]);
    });

    it('returns unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = notificationStore.subscribe(listener);

      listener.mockClear();
      unsubscribe();

      notificationStore.showNotification({ title: 'Test' });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getNotifications', () => {
    it('returns the same array reference until the store updates', () => {
      notificationStore.showNotification({ title: 'Test' });

      const notifications1 = notificationStore.getNotifications();
      const notifications2 = notificationStore.getNotifications();

      expect(notifications1).toBe(notifications2);

      notificationStore.showNotification({ title: 'Second' });
      const notifications3 = notificationStore.getNotifications();
      expect(notifications3).not.toBe(notifications1);
    });
  });
});
