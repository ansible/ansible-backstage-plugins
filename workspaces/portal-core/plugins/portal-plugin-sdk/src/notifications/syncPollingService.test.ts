import { SyncPollingService, syncPollingService } from './syncPollingService';
import { notificationStore } from './notificationStore';
import { FAST_POLL_INTERVAL_MS } from '../utils';

describe('SDK sync polling recovery', () => {
  const discoveryApi = { getBaseUrl: jest.fn().mockResolvedValue('/catalog') };
  const fetchApi = {
    fetch: jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: { providers: [] } }),
    }),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    syncPollingService.clear();
  });

  afterEach(() => {
    syncPollingService.clear();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('retries a rejected poll instead of terminating the polling chain', async () => {
    const poll = jest
      .spyOn(syncPollingService as any, 'checkSyncStatus')
      .mockRejectedValueOnce(new Error('Unexpected poll failure'));

    syncPollingService.initialize(discoveryApi, fetchApi);
    await jest.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('does not restart a cleared session when an earlier poll rejects', async () => {
    let rejectPoll!: (error: Error) => void;
    const poll = jest
      .spyOn(syncPollingService as any, 'checkSyncStatus')
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectPoll = reject;
        }),
      );

    syncPollingService.initialize(discoveryApi, fetchApi);
    syncPollingService.clear();
    rejectPoll(new Error('Old session poll failed'));
    await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS * 2);

    expect(poll).toHaveBeenCalledTimes(1);
  });
});

describe('SDK sync polling instances', () => {
  const instances: SyncPollingService[] = [];

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    instances.forEach(service => service.clear());
    instances.length = 0;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each([
    ['success', 'Sync completed'],
    ['failure', 'Sync failed'],
    [null, 'Sync finished'],
    ['missing', 'Sync failed'],
  ])(
    'sends %s outcomes only to the injected notification sink',
    async (status, title) => {
      const sink = {
        showNotification: jest.fn().mockReturnValue('notification'),
      };
      const defaultNotification = jest.spyOn(
        notificationStore,
        'showNotification',
      );
      const service = new SyncPollingService(sink);
      instances.push(service);
      service.startTracking([
        {
          sourceId: 'source',
          displayName: 'Source',
          lastSyncTime: null,
          lastSyncStatus: null,
          lastFailedSyncTime: null,
        },
      ]);
      await jest.advanceTimersByTimeAsync(0);
      service.initialize(
        { getBaseUrl: jest.fn().mockResolvedValue('/catalog') },
        {
          fetch: jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
              content: {
                providers:
                  status === 'missing'
                    ? []
                    : [
                        {
                          sourceId: 'source',
                          syncInProgress: false,
                          lastSyncTime: '2026-01-01T12:00:00Z',
                          lastSyncStatus: status,
                          collectionsFound: 1,
                          collectionsDelta: 1,
                        },
                      ],
              },
            }),
          }),
        },
      );
      await jest.advanceTimersByTimeAsync(0);
      expect(sink.showNotification).toHaveBeenCalledTimes(1);
      expect(sink.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title }),
      );
      expect(defaultNotification).not.toHaveBeenCalled();
      expect(service.getIsSyncInProgress()).toBe(false);
    },
  );

  it('keeps tracking, listeners, invalidators and clearing scoped to each instance', async () => {
    const first = new SyncPollingService({ showNotification: jest.fn() });
    const second = new SyncPollingService({ showNotification: jest.fn() });
    instances.push(first, second);
    const firstListener = jest.fn();
    const secondListener = jest.fn();
    const firstInvalidator = jest.fn();
    const secondInvalidator = jest.fn();
    first.subscribe(firstListener);
    second.subscribe(secondListener);
    first.addInvalidator(firstInvalidator);
    second.addInvalidator(secondInvalidator);
    first.startTracking([
      {
        sourceId: 'shared',
        displayName: 'First',
        lastSyncTime: null,
        lastSyncStatus: null,
        lastFailedSyncTime: null,
      },
    ]);
    await jest.advanceTimersByTimeAsync(0);
    expect(firstListener).toHaveBeenLastCalledWith(true);
    expect(secondListener).toHaveBeenCalledTimes(1);
    expect(second.getSyncProgress()).toEqual([]);
    second.startTracking([
      {
        sourceId: 'shared',
        displayName: 'Second',
        lastSyncTime: null,
        lastSyncStatus: null,
        lastFailedSyncTime: null,
      },
    ]);
    await jest.advanceTimersByTimeAsync(0);
    first.clear();
    expect(first.getSyncProgress()).toEqual([]);
    expect(second.getSyncProgress()).toEqual([
      { sourceId: 'shared', displayName: 'Second', outcome: 'pending' },
    ]);
    expect(second.getIsSyncInProgress()).toBe(true);
    second.initialize(
      { getBaseUrl: jest.fn().mockResolvedValue('/catalog') },
      {
        fetch: jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ content: { providers: [] } }),
        }),
      },
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(secondInvalidator).toHaveBeenCalledTimes(1);
    expect(firstInvalidator).not.toHaveBeenCalled();
    expect(secondListener).toHaveBeenLastCalledWith(false);
  });
});
