import { syncPollingService } from './syncPollingService';
import { notificationStore } from './notificationStore';
import {
  TRACKING_TIMEOUT_MS,
  FAST_POLL_INTERVAL_MS,
  SLOW_POLL_INTERVAL_MS,
} from '../common/constants';

jest.mock('./notificationStore', () => ({
  notificationStore: {
    showNotification: jest.fn(),
  },
}));

const mockShowNotification = notificationStore.showNotification as jest.Mock;

describe('syncPollingService', () => {
  let mockDiscoveryApi: { getBaseUrl: jest.Mock };
  let mockFetchApi: { fetch: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    syncPollingService.clear();

    mockDiscoveryApi = {
      getBaseUrl: jest
        .fn()
        .mockResolvedValue('http://localhost:7007/api/catalog'),
    };
    mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: { providers: [] } }),
      }),
    };
  });

  afterEach(() => {
    syncPollingService.clear();
    jest.useRealTimers();
  });

  describe('initialize', () => {
    it('stores the APIs', async () => {
      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );

      await jest.advanceTimersByTimeAsync(0);

      expect(mockDiscoveryApi.getBaseUrl).toHaveBeenCalledWith('catalog');
    });

    it('does not start a second poll loop when initialize is called again', async () => {
      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );

      await jest.advanceTimersByTimeAsync(0);

      expect(mockFetchApi.fetch.mock.calls.length).toBe(1);
    });

    it('starts polling on first init', async () => {
      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );

      await jest.advanceTimersByTimeAsync(0);

      expect(mockFetchApi.fetch).toHaveBeenCalled();
    });

    it('does not start duplicate polling on re-init', async () => {
      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      const callCount = mockFetchApi.fetch.mock.calls.length;

      // Re-initialize - should not start a new poll since one is already scheduled
      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      // Should be same or slightly more (but not doubled)
      expect(mockFetchApi.fetch.mock.calls.length).toBeLessThanOrEqual(
        callCount + 1,
      );
    });
  });

  describe('subscribe', () => {
    it('immediately notifies listener with current state', () => {
      const listener = jest.fn();
      syncPollingService.subscribe(listener);

      expect(listener).toHaveBeenCalledWith(false);
    });

    it('returns unsubscribe function that stops future notifications', async () => {
      mockFetchApi.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: { providers: [] },
          }),
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      const listener = jest.fn();
      const unsubscribe = syncPollingService.subscribe(listener);
      expect(listener).toHaveBeenCalledWith(false);
      listener.mockClear();

      unsubscribe();

      mockFetchApi.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: {
              providers: [{ sourceId: 'src-1', syncInProgress: true }],
            },
          }),
      });

      await jest.advanceTimersByTimeAsync(SLOW_POLL_INTERVAL_MS);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getIsSyncInProgress', () => {
    it('returns false initially', () => {
      expect(syncPollingService.getIsSyncInProgress()).toBe(false);
    });

    it('returns true when sync is in progress', async () => {
      mockFetchApi.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: {
              providers: [{ sourceId: 'src-1', syncInProgress: true }],
            },
          }),
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );

      await jest.advanceTimersByTimeAsync(0);

      expect(syncPollingService.getIsSyncInProgress()).toBe(true);
    });
  });

  describe('startTracking', () => {
    it('does nothing when syncs array is empty', () => {
      const listener = jest.fn();
      syncPollingService.subscribe(listener);
      listener.mockClear();

      syncPollingService.startTracking([]);

      expect(listener).not.toHaveBeenCalled();
    });

    it('immediately sets isSyncInProgress to true', () => {
      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );

      const listener = jest.fn();
      syncPollingService.subscribe(listener);
      listener.mockClear();

      syncPollingService.startTracking([
        { sourceId: 'src-1', displayName: 'Source 1', lastSyncTime: null },
      ]);

      expect(listener).toHaveBeenCalledWith(true);
      expect(syncPollingService.getIsSyncInProgress()).toBe(true);
    });

    it('does not notify if already in progress', async () => {
      mockFetchApi.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: {
              providers: [{ sourceId: 'src-1', syncInProgress: true }],
            },
          }),
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      expect(syncPollingService.getIsSyncInProgress()).toBe(true);

      const listener = jest.fn();
      syncPollingService.subscribe(listener);

      // listener is called immediately with current state (true)
      expect(listener).toHaveBeenCalledWith(true);
      listener.mockClear();

      syncPollingService.startTracking([
        { sourceId: 'src-2', displayName: 'Source 2', lastSyncTime: null },
      ]);

      // Since already in progress, startTracking should not notify again
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('sync completion notifications', () => {
    it('shows success notification when sync completes successfully', async () => {
      let callCount = 0;
      mockFetchApi.fetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: sync in progress
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                content: {
                  providers: [
                    {
                      sourceId: 'src-1',
                      syncInProgress: true,
                      lastSyncTime: null,
                    },
                  ],
                },
              }),
          });
        }
        // Subsequent calls: sync completed
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              content: {
                providers: [
                  {
                    sourceId: 'src-1',
                    syncInProgress: false,
                    lastSyncTime: '2024-01-01T12:00:00Z',
                    lastSyncStatus: 'success',
                    collectionsFound: 5,
                    collectionsDelta: 2,
                  },
                ],
              },
            }),
        });
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      syncPollingService.startTracking([
        { sourceId: 'src-1', displayName: 'Source 1', lastSyncTime: null },
      ]);

      // Advance timer to trigger next poll
      await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS);

      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sync completed',
          severity: 'success',
          description: expect.stringContaining('5 collections synced'),
        }),
      );
    });

    it('shows failure notification when sync fails', async () => {
      let callCount = 0;
      mockFetchApi.fetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                content: {
                  providers: [
                    {
                      sourceId: 'src-1',
                      syncInProgress: true,
                      lastSyncTime: null,
                    },
                  ],
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              content: {
                providers: [
                  {
                    sourceId: 'src-1',
                    syncInProgress: false,
                    lastSyncTime: '2024-01-01T12:00:00Z',
                    lastSyncStatus: 'failure',
                    collectionsFound: 0,
                    collectionsDelta: 0,
                  },
                ],
              },
            }),
        });
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      syncPollingService.startTracking([
        { sourceId: 'src-1', displayName: 'Source 1', lastSyncTime: null },
      ]);

      await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS);

      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sync failed',
          severity: 'error',
          description: 'Failed to sync content from Source 1.',
          autoHideDuration: 0,
        }),
      );
    });

    it('includes delta in message for non-first sync', async () => {
      let callCount = 0;
      mockFetchApi.fetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                content: {
                  providers: [
                    {
                      sourceId: 'src-1',
                      syncInProgress: true,
                      lastSyncTime: '2024-01-01T10:00:00Z',
                    },
                  ],
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              content: {
                providers: [
                  {
                    sourceId: 'src-1',
                    syncInProgress: false,
                    lastSyncTime: '2024-01-01T12:00:00Z',
                    lastSyncStatus: 'success',
                    collectionsFound: 10,
                    collectionsDelta: 3,
                  },
                ],
              },
            }),
        });
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      syncPollingService.startTracking([
        {
          sourceId: 'src-1',
          displayName: 'Source 1',
          lastSyncTime: '2024-01-01T10:00:00Z',
        },
      ]);

      await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS);

      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('+3 since last sync'),
        }),
      );
    });

    it('shows negative delta correctly', async () => {
      let callCount = 0;
      mockFetchApi.fetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                content: {
                  providers: [
                    {
                      sourceId: 'src-1',
                      syncInProgress: true,
                      lastSyncTime: '2024-01-01T10:00:00Z',
                    },
                  ],
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              content: {
                providers: [
                  {
                    sourceId: 'src-1',
                    syncInProgress: false,
                    lastSyncTime: '2024-01-01T12:00:00Z',
                    lastSyncStatus: 'success',
                    collectionsFound: 5,
                    collectionsDelta: -2,
                  },
                ],
              },
            }),
        });
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      syncPollingService.startTracking([
        {
          sourceId: 'src-1',
          displayName: 'Source 1',
          lastSyncTime: '2024-01-01T10:00:00Z',
        },
      ]);

      await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS);

      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('-2 since last sync'),
        }),
      );
    });

    it('shows no change message when delta is 0', async () => {
      let callCount = 0;
      mockFetchApi.fetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                content: {
                  providers: [
                    {
                      sourceId: 'src-1',
                      syncInProgress: true,
                      lastSyncTime: '2024-01-01T10:00:00Z',
                    },
                  ],
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              content: {
                providers: [
                  {
                    sourceId: 'src-1',
                    syncInProgress: false,
                    lastSyncTime: '2024-01-01T12:00:00Z',
                    lastSyncStatus: 'success',
                    collectionsFound: 5,
                    collectionsDelta: 0,
                  },
                ],
              },
            }),
        });
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      syncPollingService.startTracking([
        {
          sourceId: 'src-1',
          displayName: 'Source 1',
          lastSyncTime: '2024-01-01T10:00:00Z',
        },
      ]);

      await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS);

      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('no change since last sync'),
        }),
      );
    });

    it('uses singular "collection" when only 1 found', async () => {
      let callCount = 0;
      mockFetchApi.fetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                content: {
                  providers: [
                    {
                      sourceId: 'src-1',
                      syncInProgress: true,
                      lastSyncTime: null,
                    },
                  ],
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              content: {
                providers: [
                  {
                    sourceId: 'src-1',
                    syncInProgress: false,
                    lastSyncTime: '2024-01-01T12:00:00Z',
                    lastSyncStatus: 'success',
                    collectionsFound: 1,
                    collectionsDelta: 0,
                  },
                ],
              },
            }),
        });
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      syncPollingService.startTracking([
        { sourceId: 'src-1', displayName: 'Source 1', lastSyncTime: null },
      ]);

      await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS);

      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('1 collection synced'),
        }),
      );
    });
  });

  describe('tracking timeout', () => {
    it('removes tracked sync after timeout', async () => {
      const dateNowSpy = jest.spyOn(Date, 'now');
      let currentTime = 1000000;
      dateNowSpy.mockImplementation(() => currentTime);

      mockFetchApi.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: {
              providers: [
                {
                  sourceId: 'src-1',
                  syncInProgress: true,
                  lastSyncTime: null,
                },
              ],
            },
          }),
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      syncPollingService.startTracking([
        { sourceId: 'src-1', displayName: 'Source 1', lastSyncTime: null },
      ]);

      // Advance time past timeout
      currentTime = 1000000 + TRACKING_TIMEOUT_MS + 1000;

      await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS);

      // Should not show notification since it timed out (not completed)
      expect(mockShowNotification).not.toHaveBeenCalled();

      dateNowSpy.mockRestore();
    });
  });

  describe('polling intervals', () => {
    it('uses fast polling when sync is in progress', async () => {
      mockFetchApi.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: {
              providers: [{ sourceId: 'src-1', syncInProgress: true }],
            },
          }),
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      const callsBefore = mockFetchApi.fetch.mock.calls.length;

      // Advance by fast poll interval
      await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS);

      expect(mockFetchApi.fetch.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it('uses slow polling when no sync is in progress', async () => {
      mockFetchApi.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: { providers: [] },
          }),
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      const callsBefore = mockFetchApi.fetch.mock.calls.length;

      // Advance by fast poll interval - should not poll yet
      await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS);

      // Since no sync in progress, should use slow interval
      const callsAfterFast = mockFetchApi.fetch.mock.calls.length;
      // Should not have polled yet since slow interval is longer
      expect(callsAfterFast).toBe(callsBefore);

      // Advance to slow poll interval
      await jest.advanceTimersByTimeAsync(
        SLOW_POLL_INTERVAL_MS - FAST_POLL_INTERVAL_MS,
      );

      expect(mockFetchApi.fetch.mock.calls.length).toBeGreaterThan(
        callsAfterFast,
      );
    });
  });

  describe('error handling', () => {
    it('does not change sync state when fetch fails on poll', async () => {
      mockFetchApi.fetch.mockRejectedValue(new Error('Network error'));

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      expect(syncPollingService.getIsSyncInProgress()).toBe(false);
    });

    it('does not change sync state when response is not ok', async () => {
      mockFetchApi.fetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      expect(syncPollingService.getIsSyncInProgress()).toBe(false);
    });

    it('preserves in-progress flag and tracking when a later poll fails', async () => {
      const inProgressPayload = {
        ok: true,
        json: () =>
          Promise.resolve({
            content: {
              providers: [
                {
                  sourceId: 'src-1',
                  syncInProgress: true,
                  lastSyncTime: null,
                },
              ],
            },
          }),
      };

      mockFetchApi.fetch
        .mockResolvedValueOnce(inProgressPayload)
        .mockRejectedValue(new Error('Network error'));

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      expect(syncPollingService.getIsSyncInProgress()).toBe(true);

      syncPollingService.startTracking([
        { sourceId: 'src-1', displayName: 'Source 1', lastSyncTime: null },
      ]);

      await jest.advanceTimersByTimeAsync(0);

      expect(syncPollingService.getIsSyncInProgress()).toBe(true);
      expect(mockShowNotification).not.toHaveBeenCalled();

      // Further scheduled polls also fail — state must not reset to empty providers.
      await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS);

      expect(syncPollingService.getIsSyncInProgress()).toBe(true);
      expect(mockShowNotification).not.toHaveBeenCalled();
    });

    it('returns false when not initialized', () => {
      // Don't initialize - just check status
      expect(syncPollingService.getIsSyncInProgress()).toBe(false);
    });
  });

  describe('clear', () => {
    it('stops polling', async () => {
      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      const callsBefore = mockFetchApi.fetch.mock.calls.length;

      syncPollingService.clear();

      await jest.advanceTimersByTimeAsync(SLOW_POLL_INTERVAL_MS * 2);

      expect(mockFetchApi.fetch.mock.calls.length).toBe(callsBefore);
    });

    it('does not reschedule polling when clear runs while fetch is in flight', async () => {
      let finishFetch!: (value: unknown) => void;
      const fetchGate = new Promise(resolve => {
        finishFetch = resolve;
      });

      mockFetchApi.fetch.mockImplementation(() =>
        fetchGate.then(() => ({
          ok: true,
          json: () => Promise.resolve({ content: { providers: [] } }),
        })),
      );

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );

      await jest.advanceTimersByTimeAsync(0);
      expect(mockFetchApi.fetch).toHaveBeenCalledTimes(1);

      syncPollingService.clear();
      finishFetch(undefined);

      await jest.advanceTimersByTimeAsync(0);

      await jest.advanceTimersByTimeAsync(SLOW_POLL_INTERVAL_MS * 2);

      expect(mockFetchApi.fetch.mock.calls.length).toBe(1);
    });

    it('clears tracked syncs', () => {
      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      syncPollingService.startTracking([
        { sourceId: 'src-1', displayName: 'Source 1', lastSyncTime: null },
      ]);

      syncPollingService.clear();

      expect(syncPollingService.getIsSyncInProgress()).toBe(false);
    });

    it('clears listeners', () => {
      const listener = jest.fn();
      syncPollingService.subscribe(listener);
      listener.mockClear();

      syncPollingService.clear();
      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      syncPollingService.startTracking([
        { sourceId: 'src-1', displayName: 'Source 1', lastSyncTime: null },
      ]);

      // Listener should not be called since it was cleared
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('provider not found', () => {
    it('removes tracked sync when provider disappears', async () => {
      let callCount = 0;
      mockFetchApi.fetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                content: {
                  providers: [
                    {
                      sourceId: 'src-1',
                      syncInProgress: true,
                      lastSyncTime: null,
                    },
                  ],
                },
              }),
          });
        }
        // Provider disappeared
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              content: { providers: [] },
            }),
        });
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.advanceTimersByTimeAsync(0);

      syncPollingService.startTracking([
        { sourceId: 'src-1', displayName: 'Source 1', lastSyncTime: null },
      ]);

      await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS);

      // Should not show notification since provider disappeared
      expect(mockShowNotification).not.toHaveBeenCalled();
    });
  });

  describe('concurrent check protection', () => {
    it('prevents concurrent checks', async () => {
      let resolveFirst!: () => void;
      const firstFetchPromise = new Promise<void>(resolve => {
        resolveFirst = resolve;
      });

      mockFetchApi.fetch.mockImplementation(() => {
        return firstFetchPromise.then(() => ({
          ok: true,
          json: () => Promise.resolve({ content: { providers: [] } }),
        }));
      });

      syncPollingService.initialize(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );

      await jest.advanceTimersByTimeAsync(0);
      expect(mockFetchApi.fetch).toHaveBeenCalledTimes(1);

      // While first fetch is still pending, startTracking triggers another
      // checkSyncStatus; it must return early (isChecking) and not call fetch again.
      syncPollingService.startTracking([
        { sourceId: 'src-1', displayName: 'Source 1', lastSyncTime: null },
      ]);

      expect(mockFetchApi.fetch).toHaveBeenCalledTimes(1);
      expect(syncPollingService.getIsSyncInProgress()).toBe(true);

      resolveFirst();
      await jest.advanceTimersByTimeAsync(0);
    });
  });
});
