import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { GitRepositoriesPage } from './GitRepositoriesPage';

jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: () => ({ allowed: true }),
  RequirePermission: (props: any) => props.children,
}));

jest.mock('@ansible/backstage-rhaap-common/permissions', () => ({
  gitRepositoriesViewPermission: {
    type: 'basic',
    name: 'git-repositories.view',
    attributes: {},
  },
}));

jest.mock('../../hooks', () => ({
  useIsSuperuser: () => ({
    isSuperuser: true,
    loading: false,
    error: null,
  }),
}));

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/self-service',
}));

jest.mock('../../routes', () => ({
  rootRouteRef: { id: 'root-route-ref' },
}));

const mockStartTracking = jest.fn();
const mockUseSyncStatusPolling = jest.fn().mockReturnValue({
  isSyncInProgress: false,
  startTracking: mockStartTracking,
});

jest.mock('../CollectionsCatalog/useSyncStatusPolling', () => ({
  useSyncStatusPolling: () => mockUseSyncStatusPolling(),
}));

jest.mock('../common', () => ({
  ...jest.requireActual('../common'),
  SyncDialog: ({ open, onClose, onSyncsStarted }: any) =>
    open ? (
      <div data-testid="sync-dialog">
        <button type="button" onClick={onClose}>
          Close sync
        </button>
        <button
          type="button"
          onClick={() =>
            onSyncsStarted?.([
              {
                sourceId: 'src-1',
                displayName: 'github.com/org1',
                lastSyncTime: null,
              },
            ])
          }
        >
          Simulate sync done
        </button>
      </div>
    ) : null,
}));

jest.mock('./RepositoriesTable', () => ({
  RepositoriesTable: ({
    onSourcesStatusChange,
    syncStatusMap: _syncStatusMap,
  }: {
    onSourcesStatusChange?: (v: boolean | null) => void;
    syncStatusMap?: Record<string, unknown>;
  }) => (
    <div data-testid="repositories-table">
      <span>RepositoriesTable</span>
      <button type="button" onClick={() => onSourcesStatusChange?.(true)}>
        Set sources
      </button>
      <button type="button" onClick={() => onSourcesStatusChange?.(false)}>
        Set no sources
      </button>
    </div>
  ),
}));

jest.mock('./RepositoriesCIActivityTab', () => ({
  RepositoriesCIActivityTab: () => (
    <div data-testid="ci-activity-tab">CI Activity Tab</div>
  ),
}));

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};
const mockFetchApi = {
  fetch: jest.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        content: {
          providers: [
            {
              sourceId: 'source-1',
              lastSyncTime: '2024-06-15T10:00:00Z',
              lastFailedSyncTime: null,
            },
          ],
        },
      }),
  }),
};

const theme = createTheme();

describe('GitRepositoriesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSyncStatusPolling.mockReturnValue({
      isSyncInProgress: false,
      startTracking: mockStartTracking,
    });
  });

  it('renders page with Git Repositories header', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    expect(screen.getByText('Git Repositories')).toBeInTheDocument();
  });

  it('renders RepositoriesTable by default', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    expect(screen.getByTestId('repositories-table')).toBeInTheDocument();
  });

  it('renders Sync Now button', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    expect(
      screen.getByRole('button', { name: /Sync Now/i }),
    ).toBeInTheDocument();
  });

  it('opens sync dialog when Sync Now is clicked', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    fireEvent.click(syncButton);

    expect(screen.getByTestId('sync-dialog')).toBeInTheDocument();
  });

  it('closes sync dialog when close button is clicked', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    fireEvent.click(syncButton);

    expect(screen.getByTestId('sync-dialog')).toBeInTheDocument();

    const closeButton = screen.getByText('Close sync');
    fireEvent.click(closeButton);

    expect(screen.queryByTestId('sync-dialog')).not.toBeInTheDocument();
  });

  it('calls onSourcesStatusChange when RepositoriesTable reports source status', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Set sources/i }));
    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Set no sources/i }));
    expect(syncButton).toBeDisabled();
    expect(
      screen.getByTitle('No content sources configured'),
    ).toBeInTheDocument();
  });

  it('calls startTracking when sync dialog reports syncs started', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Sync Now/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /Simulate sync done/i }),
    );

    expect(mockStartTracking).toHaveBeenCalledWith([
      {
        sourceId: 'src-1',
        displayName: 'github.com/org1',
        lastSyncTime: null,
      },
    ]);
  });

  it('shows Sync in progress as sync disabled reason when polling reports in progress', async () => {
    mockUseSyncStatusPolling.mockReturnValue({
      isSyncInProgress: true,
      startTracking: mockStartTracking,
    });

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeDisabled();
    expect(screen.getByTitle('Sync in progress')).toBeInTheDocument();
  });

  it('renders tab navigation with Catalog and CI Activity tabs', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    expect(screen.getByText('Catalog')).toBeInTheDocument();
    expect(screen.getByText('CI Activity')).toBeInTheDocument();
  });

  it('handles sync status fetch returning non-ok response', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeDisabled();
  });

  it('handles sync status fetch throwing error', async () => {
    mockFetchApi.fetch.mockRejectedValue(new Error('Network error'));

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    await waitFor(() => {
      const syncButton = screen.getByRole('button', { name: /Sync Now/i });
      expect(syncButton).toBeDisabled();
    });
  });

  it('refetches sync status when sync completes', async () => {
    mockUseSyncStatusPolling.mockReturnValue({
      isSyncInProgress: true,
      startTracking: mockStartTracking,
    });

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeDisabled();

    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/ansible/sync/status'),
    );
  });

  it('triggers fetchSyncStatus when isSyncInProgress changes from true to false', async () => {
    mockUseSyncStatusPolling.mockReturnValue({
      isSyncInProgress: true,
      startTracking: mockStartTracking,
    });

    const { unmount } = await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalled();
    });

    const initialCallCount = mockFetchApi.fetch.mock.calls.length;

    unmount();

    mockUseSyncStatusPolling.mockReturnValue({
      isSyncInProgress: false,
      startTracking: mockStartTracking,
    });

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(mockFetchApi.fetch.mock.calls.length).toBeGreaterThan(
        initialCallCount,
      );
    });
  });

  it('navigates to CI Activity tab when selected', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <GitRepositoriesPage />
        </ThemeProvider>
      </TestApiProvider>,
      { routeEntries: ['/self-service/repositories/catalog'] },
    );

    const ciActivityTab = screen.getByText('CI Activity');
    fireEvent.click(ciActivityTab);

    expect(screen.getByTestId('ci-activity-tab')).toBeInTheDocument();
  });
});
