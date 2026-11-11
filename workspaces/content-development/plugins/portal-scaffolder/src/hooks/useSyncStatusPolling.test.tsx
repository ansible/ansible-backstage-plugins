import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { useSyncStatusPolling } from './useSyncStatusPolling';
import { syncPollingService } from '../components/notifications/syncPollingService';

const theme = createTheme();

// Mock the syncPollingService
jest.mock('../components/notifications/syncPollingService', () => {
  const listeners = new Set<(inProgress: boolean) => void>();
  const progressListeners = new Set<(entries: unknown[]) => void>();
  let currentSyncInProgress = false;
  let currentProgress: unknown[] = [];

  return {
    syncPollingService: {
      initialize: jest.fn(),
      subscribe: jest.fn((listener: (inProgress: boolean) => void) => {
        listeners.add(listener);
        listener(currentSyncInProgress);
        return () => listeners.delete(listener);
      }),
      subscribeProgress: jest.fn((listener: (entries: unknown[]) => void) => {
        progressListeners.add(listener);
        listener(currentProgress);
        return () => progressListeners.delete(listener);
      }),
      getIsSyncInProgress: jest.fn(() => currentSyncInProgress),
      getSyncProgress: jest.fn(() => currentProgress),
      startTracking: jest.fn(),
      clear: jest.fn(),
      // Test helpers
      _setIsSyncInProgress: (value: boolean) => {
        currentSyncInProgress = value;
        listeners.forEach(l => l(value));
      },
      _reset: () => {
        currentSyncInProgress = false;
        currentProgress = [];
        listeners.clear();
        progressListeners.clear();
      },
    },
  };
});

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};

const mockFetchApi = {
  fetch: jest.fn(),
};

function TestConsumer() {
  const { isSyncInProgress, syncProgress, startTracking } =
    useSyncStatusPolling();
  return (
    <div>
      <span data-testid="sync-in-progress">{String(isSyncInProgress)}</span>
      <span data-testid="sync-progress-count">{syncProgress.length}</span>
      <button
        type="button"
        onClick={() =>
          startTracking([
            {
              sourceId: 'src-1',
              displayName: 'github.com:org1',
              lastSyncTime: null,
              lastSyncStatus: null,
              lastFailedSyncTime: null,
            },
          ])
        }
      >
        Start tracking
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
        <TestConsumer />
      </TestApiProvider>
    </ThemeProvider>,
  );
}

describe('useSyncStatusPolling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (syncPollingService as any)._reset();
  });

  it('subscribes on mount and calls initialize with catalog discovery and fetch', async () => {
    renderHook();

    await waitFor(() => {
      expect(syncPollingService.subscribe).toHaveBeenCalled();
    });

    expect(syncPollingService.subscribeProgress).toHaveBeenCalled();
    expect(syncPollingService.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        getBaseUrl: expect.any(Function),
      }),
      expect.objectContaining({
        fetch: expect.any(Function),
      }),
    );
  });

  it('returns isSyncInProgress from syncPollingService', async () => {
    renderHook();

    expect(screen.getByTestId('sync-in-progress')).toHaveTextContent('false');

    // Simulate sync starting
    (syncPollingService as any)._setIsSyncInProgress(true);

    await waitFor(() => {
      expect(screen.getByTestId('sync-in-progress')).toHaveTextContent('true');
    });
  });

  it('startTracking calls syncPollingService.startTracking', async () => {
    const { getByText } = renderHook();

    getByText('Start tracking').click();

    await waitFor(() => {
      expect(syncPollingService.startTracking).toHaveBeenCalledWith([
        {
          sourceId: 'src-1',
          displayName: 'github.com:org1',
          lastSyncTime: null,
          lastSyncStatus: null,
          lastFailedSyncTime: null,
        },
      ]);
    });
  });

  it('unsubscribes from syncPollingService on unmount', async () => {
    const { unmount } = renderHook();

    await waitFor(() => {
      expect(syncPollingService.subscribe).toHaveBeenCalled();
    });

    // Unmount triggers the cleanup function which calls unsubscribe
    // The test verifies no errors occur during unmount
    unmount();
  });
});
