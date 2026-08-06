import { SyncStateTracker } from './SyncStateTracker';
import { mockServices } from '@backstage/backend-test-utils';

describe('SyncStateTracker', () => {
  let tracker: SyncStateTracker;

  beforeEach(() => {
    tracker = new SyncStateTracker();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-06-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initial state', () => {
    it('should have null lastSyncTime', () => {
      expect(tracker.getLastSyncTime()).toBeNull();
    });

    it('should have null lastFailedSyncTime', () => {
      expect(tracker.getLastFailedSyncTime()).toBeNull();
    });

    it('should have null lastSyncStatus', () => {
      expect(tracker.getLastSyncStatus()).toBeNull();
    });

    it('should not be syncing', () => {
      expect(tracker.getIsSyncing()).toBe(false);
    });

    it('should have undefined taskId', () => {
      expect(tracker.getTaskId()).toBeUndefined();
    });
  });

  describe('markSyncStarted', () => {
    it('should set isSyncing to true', () => {
      tracker.markSyncStarted();
      expect(tracker.getIsSyncing()).toBe(true);
    });
  });

  describe('markSyncSucceeded', () => {
    it('should record the sync time and set status to success', () => {
      tracker.markSyncStarted();
      tracker.markSyncSucceeded();

      expect(tracker.getLastSyncTime()).toBe('2025-06-01T12:00:00.000Z');
      expect(tracker.getLastSyncStatus()).toBe('success');
      expect(tracker.getIsSyncing()).toBe(false);
    });

    it('should not update lastFailedSyncTime', () => {
      tracker.markSyncSucceeded();
      expect(tracker.getLastFailedSyncTime()).toBeNull();
    });

    it('should update lastSyncTime on subsequent calls', () => {
      tracker.markSyncSucceeded();
      jest.setSystemTime(new Date('2025-06-01T13:00:00.000Z'));
      tracker.markSyncSucceeded();

      expect(tracker.getLastSyncTime()).toBe('2025-06-01T13:00:00.000Z');
    });
  });

  describe('markSyncFailed', () => {
    it('should record the failed sync time and set status to failure', () => {
      tracker.markSyncStarted();
      tracker.markSyncFailed();

      expect(tracker.getLastFailedSyncTime()).toBe('2025-06-01T12:00:00.000Z');
      expect(tracker.getLastSyncStatus()).toBe('failure');
      expect(tracker.getIsSyncing()).toBe(false);
    });

    it('should not update lastSyncTime', () => {
      tracker.markSyncFailed();
      expect(tracker.getLastSyncTime()).toBeNull();
    });
  });

  describe('state transitions', () => {
    it('should track success after failure', () => {
      tracker.markSyncFailed();
      expect(tracker.getLastSyncStatus()).toBe('failure');

      jest.setSystemTime(new Date('2025-06-01T13:00:00.000Z'));
      tracker.markSyncSucceeded();

      expect(tracker.getLastSyncStatus()).toBe('success');
      expect(tracker.getLastSyncTime()).toBe('2025-06-01T13:00:00.000Z');
      expect(tracker.getLastFailedSyncTime()).toBe('2025-06-01T12:00:00.000Z');
    });

    it('should track failure after success', () => {
      tracker.markSyncSucceeded();
      expect(tracker.getLastSyncStatus()).toBe('success');

      jest.setSystemTime(new Date('2025-06-01T13:00:00.000Z'));
      tracker.markSyncFailed();

      expect(tracker.getLastSyncStatus()).toBe('failure');
      expect(tracker.getLastSyncTime()).toBe('2025-06-01T12:00:00.000Z');
      expect(tracker.getLastFailedSyncTime()).toBe('2025-06-01T13:00:00.000Z');
    });
  });

  describe('signals integration', () => {
    it('should publish signal on markSyncStarted when signals is set', () => {
      const mockSignals = { publish: jest.fn().mockResolvedValue(undefined) };
      tracker.setSignals(mockSignals as any, 'test-provider');

      tracker.markSyncStarted();

      expect(mockSignals.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'catalog:aap-sync-status',
          message: expect.objectContaining({
            provider: 'test-provider',
            syncInProgress: true,
          }),
        }),
      );
    });

    it('should publish signal on markSyncSucceeded', () => {
      const mockSignals = { publish: jest.fn().mockResolvedValue(undefined) };
      tracker.setSignals(mockSignals as any, 'test-provider');

      tracker.markSyncSucceeded();

      expect(mockSignals.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            syncInProgress: false,
            lastSyncStatus: 'success',
            lastSyncTime: '2025-06-01T12:00:00.000Z',
          }),
        }),
      );
    });

    it('should publish signal on markSyncFailed', () => {
      const mockSignals = { publish: jest.fn().mockResolvedValue(undefined) };
      tracker.setSignals(mockSignals as any, 'test-provider');

      tracker.markSyncFailed();

      expect(mockSignals.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            syncInProgress: false,
            lastSyncStatus: 'failure',
            lastFailedSyncTime: '2025-06-01T12:00:00.000Z',
          }),
        }),
      );
    });

    it('should not throw when signals publish fails', () => {
      const mockSignals = {
        publish: jest.fn().mockRejectedValue(new Error('publish failed')),
      };
      tracker.setSignals(mockSignals as any, 'test-provider');

      expect(() => tracker.markSyncStarted()).not.toThrow();
    });

    it('should not publish when signals is not set', () => {
      tracker.markSyncStarted();
      tracker.markSyncSucceeded();
      tracker.markSyncFailed();

      expect(tracker.getLastSyncStatus()).toBe('failure');
    });
  });

  describe('createScheduleFn', () => {
    let logger: ReturnType<typeof mockServices.logger.mock>;
    let mockTaskRunner: { run: jest.Mock };

    beforeEach(() => {
      logger = mockServices.logger.mock();
      mockTaskRunner = { run: jest.fn() };
    });

    it('should return a function', () => {
      const fn = tracker.createScheduleFn(
        mockTaskRunner,
        'test-provider',
        async () => {},
        logger,
        'test context',
      );
      expect(typeof fn).toBe('function');
    });

    it('should set taskId on successful schedule', async () => {
      mockTaskRunner.run.mockImplementation(async ({ fn }) => {
        await fn();
      });

      const scheduleFn = tracker.createScheduleFn(
        mockTaskRunner,
        'my-provider',
        async () => {},
        logger,
        'test context',
      );

      await scheduleFn();
      expect(tracker.getTaskId()).toBe('my-provider:run');
    });

    it('should pass the correct task id to taskRunner', async () => {
      mockTaskRunner.run.mockResolvedValue(undefined);

      const scheduleFn = tracker.createScheduleFn(
        mockTaskRunner,
        'my-provider',
        async () => {},
        logger,
        'test context',
      );

      await scheduleFn();
      expect(mockTaskRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'my-provider:run' }),
      );
    });

    it('should call runFn with the abort signal', async () => {
      const runFn = jest.fn();
      const fakeSignal = new AbortController().signal;

      mockTaskRunner.run.mockImplementation(async ({ fn }) => {
        await fn(fakeSignal);
      });

      const scheduleFn = tracker.createScheduleFn(
        mockTaskRunner,
        'test-provider',
        runFn,
        logger,
        'test context',
      );

      await scheduleFn();
      expect(runFn).toHaveBeenCalledWith(fakeSignal);
    });

    it('should log and rethrow errors from runFn', async () => {
      const error = new Error('sync failed');
      const runFn = jest.fn().mockRejectedValue(error);

      mockTaskRunner.run.mockImplementation(async ({ fn }) => {
        await fn();
      });

      const scheduleFn = tracker.createScheduleFn(
        mockTaskRunner,
        'test-provider',
        runFn,
        logger,
        'AAP instance',
      );

      await expect(scheduleFn()).rejects.toThrow('sync failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Error while syncing resources from AAP instance',
        expect.objectContaining({
          name: 'Error',
          message: 'sync failed',
        }),
      );
    });

    it('should clear taskId when taskRunner.run itself throws', async () => {
      mockTaskRunner.run.mockRejectedValue(new Error('runner error'));

      const scheduleFn = tracker.createScheduleFn(
        mockTaskRunner,
        'test-provider',
        async () => {},
        logger,
        'test context',
      );

      await expect(scheduleFn()).rejects.toThrow('runner error');
      expect(tracker.getTaskId()).toBeUndefined();
    });

    it('should not log non-Error objects thrown by runFn', async () => {
      const nonError = { code: 'NOT_AN_ERROR' };
      mockTaskRunner.run.mockImplementation(async ({ fn }) => {
        await fn();
      });

      const scheduleFn = tracker.createScheduleFn(
        mockTaskRunner,
        'test-provider',
        async () => {
          throw nonError; // eslint-disable-line no-throw-literal
        },
        logger,
        'test context',
      );

      await expect(scheduleFn()).rejects.toBe(nonError);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should include response status in error log when available', async () => {
      const error = Object.assign(new Error('api failed'), {
        response: { status: '503' },
      });

      mockTaskRunner.run.mockImplementation(async ({ fn }) => {
        await fn();
      });

      const scheduleFn = tracker.createScheduleFn(
        mockTaskRunner,
        'test-provider',
        async () => {
          throw error;
        },
        logger,
        'remote API',
      );

      await expect(scheduleFn()).rejects.toThrow('api failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Error while syncing resources from remote API',
        expect.objectContaining({
          status: '503',
        }),
      );
    });

    it('should call runFn without signal when none is provided', async () => {
      const runFn = jest.fn();

      mockTaskRunner.run.mockImplementation(async ({ fn }) => {
        await fn();
      });

      const scheduleFn = tracker.createScheduleFn(
        mockTaskRunner,
        'test-provider',
        runFn,
        logger,
        'test context',
      );

      await scheduleFn();
      expect(runFn).toHaveBeenCalledWith(undefined);
    });
  });
});
