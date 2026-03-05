import { render, screen, waitFor, act } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { NotificationProvider } from '../notifications';
import { useSyncStatusPolling } from './useSyncStatusPolling';
import { TRACKING_TIMEOUT_MS, FAST_POLL_INTERVAL_MS } from './constants';

const theme = createTheme();

const mockShowNotification = jest.fn();

jest.mock('../notifications', () => {
  const actual = jest.requireActual('../notifications');
  return {
    ...actual,
    useNotifications: () => ({
      showNotification: mockShowNotification,
      removeNotification: jest.fn(),
      clearAll: jest.fn(),
      notifications: [],
    }),
  };
});

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};

const mockFetchApi = {
  fetch: jest.fn(),
};

function TestConsumer() {
  const { isSyncInProgress, startTracking } = useSyncStatusPolling();
  return (
    <div>
      <span data-testid="sync-in-progress">{String(isSyncInProgress)}</span>
      <button
        type="button"
        onClick={() =>
          startTracking([
            {
              sourceId: 'src-1',
              displayName: 'github.com/org1',
              lastSyncTime: null,
            },
          ])
        }
      >
        Start tracking
      </button>
      <button
        type="button"
        onClick={() =>
          startTracking([
            {
              sourceId: 'src-1',
              displayName: 'github.com/org1',
              lastSyncTime: '2024-01-01T10:00:00Z',
            },
          ])
        }
      >
        Start tracking with previous sync
      </button>
    </div>
  );
}

function renderHook() {
  return render(
    <ThemeProvider theme={theme}>
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      </TestApiProvider>
    </ThemeProvider>,
  );
}

describe('useSyncStatusPolling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShowNotification.mockClear();
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: {
          providers: [],
        },
      }),
    });
  });

  it('returns isSyncInProgress false initially', async () => {
    renderHook();

    await waitFor(() => {
      expect(screen.getByTestId('sync-in-progress')).toHaveTextContent('false');
    });
  });

  it('fetches sync status on mount', async () => {
    renderHook();

    await waitFor(() => {
      expect(mockDiscoveryApi.getBaseUrl).toHaveBeenCalledWith('catalog');
    });
    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/catalog/ansible/sync/status?ansible_contents=true',
    );
  });

  it('sets isSyncInProgress true when any provider has syncInProgress', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: {
          providers: [
            {
              sourceId: 'src-1',
              syncInProgress: true,
              lastSyncTime: null,
              lastSyncStatus: null,
              collectionsFound: 0,
              collectionsDelta: 0,
            },
          ],
        },
      }),
    });

    renderHook();

    await waitFor(() => {
      expect(screen.getByTestId('sync-in-progress')).toHaveTextContent('true');
    });
  });

  it('startTracking triggers fetch and schedules polling', async () => {
    const { getByText } = renderHook();

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalled();
    });

    await act(async () => {
      getByText('Start tracking').click();
    });

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('returns empty providers when response is not ok', async () => {
    mockFetchApi.fetch.mockResolvedValue({ ok: false });

    renderHook();

    await waitFor(() => {
      expect(screen.getByTestId('sync-in-progress')).toHaveTextContent('false');
    });
  });

  it('returns empty providers when fetch throws', async () => {
    mockFetchApi.fetch.mockRejectedValue(new Error('Network error'));

    renderHook();

    await waitFor(() => {
      expect(screen.getByTestId('sync-in-progress')).toHaveTextContent('false');
    });
  });

  it('shows Sync completed notification when tracked sync finishes with success', async () => {
    mockFetchApi.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: { providers: [] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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

    const { getByText } = renderHook();

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalled();
    });

    await act(async () => {
      getByText('Start tracking').click();
    });

    await waitFor(
      () => {
        expect(mockShowNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Sync completed',
            severity: 'success',
            description: expect.stringContaining('5 collections synced'),
          }),
        );
      },
      { timeout: 3000 },
    );
  });

  it('shows Sync failed notification when tracked sync finishes with failure', async () => {
    mockFetchApi.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: { providers: [] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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

    const { getByText } = renderHook();

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalled();
    });

    await act(async () => {
      getByText('Start tracking').click();
    });

    await waitFor(
      () => {
        expect(mockShowNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Sync failed',
            severity: 'error',
            description: 'Failed to sync content from github.com/org1.',
          }),
        );
      },
      { timeout: 3000 },
    );
  });

  it('Sync completed message contains +N when collectionsDelta > 0 (not first sync)', async () => {
    mockFetchApi.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: { providers: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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

    const { getByText } = renderHook();

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalled();
    });

    await act(async () => {
      getByText('Start tracking with previous sync').click();
    });

    await waitFor(
      () => {
        expect(mockShowNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Sync completed',
            description: expect.stringContaining('+3 since last sync'),
          }),
        );
      },
      { timeout: 3000 },
    );
  });

  it('Sync completed message contains negative delta when collectionsDelta < 0 (not first sync)', async () => {
    mockFetchApi.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: { providers: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: {
            providers: [
              {
                sourceId: 'src-1',
                syncInProgress: false,
                lastSyncTime: '2024-01-01T12:00:00Z',
                lastSyncStatus: 'success',
                collectionsFound: 8,
                collectionsDelta: -2,
              },
            ],
          },
        }),
      });

    const { getByText } = renderHook();

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalled();
    });

    await act(async () => {
      getByText('Start tracking with previous sync').click();
    });

    await waitFor(
      () => {
        expect(mockShowNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Sync completed',
            description: expect.stringContaining('-2 since last sync'),
          }),
        );
      },
      { timeout: 3000 },
    );
  });

  it('Sync completed message contains no change when collectionsDelta === 0 (not first sync)', async () => {
    mockFetchApi.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: { providers: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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

    const { getByText } = renderHook();

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalled();
    });

    await act(async () => {
      getByText('Start tracking with previous sync').click();
    });

    await waitFor(
      () => {
        expect(mockShowNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Sync completed',
            description: expect.stringContaining('no change since last sync'),
          }),
        );
      },
      { timeout: 3000 },
    );
  });

  it('calls console.warn and removes tracked sync when tracking times out', async () => {
    jest.useFakeTimers();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let now = 0;
    const dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: {
          providers: [
            {
              sourceId: 'src-1',
              syncInProgress: true,
              lastSyncTime: null,
              lastSyncStatus: null,
              collectionsFound: 0,
              collectionsDelta: 0,
            },
          ],
        },
      }),
    });

    const { getByText } = renderHook();

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalled();
    });

    await act(async () => {
      getByText('Start tracking').click();
    });

    now = TRACKING_TIMEOUT_MS + 1000;
    dateNowSpy.mockImplementation(() => now);

    await act(async () => {
      jest.advanceTimersByTime(FAST_POLL_INTERVAL_MS);
    });

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        'Notification tracking timed out for github.com/org1',
      );
    });

    dateNowSpy.mockRestore();
    warnSpy.mockRestore();
    jest.useRealTimers();
  });

  it('scheduleNextPoll does not call checkSyncStatus after unmount', async () => {
    jest.useFakeTimers();

    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: { providers: [] },
      }),
    });

    const { unmount } = renderHook();

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalled();
    });

    const fetchCountAfterMount = mockFetchApi.fetch.mock.calls.length;

    unmount();

    await act(async () => {
      jest.advanceTimersByTime(20000);
    });

    expect(mockFetchApi.fetch.mock.calls.length).toBe(fetchCountAfterMount);

    jest.useRealTimers();
  });
});
