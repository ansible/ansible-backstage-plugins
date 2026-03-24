import { screen, fireEvent } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { CollectionsCatalogPage } from './CollectionsCatalogPage';

jest.mock('@backstage/plugin-permission-react', () => ({
  RequirePermission: (props: any) => props.children,
}));

jest.mock('@ansible/backstage-rhaap-common/permissions', () => ({
  collectionsViewPermission: {
    type: 'basic',
    name: 'collections.view',
    attributes: {},
  },
}));

const mockStartTracking = jest.fn();
const mockUseSyncStatusPolling = jest.fn().mockReturnValue({
  isSyncInProgress: false,
  startTracking: mockStartTracking,
});

jest.mock('../../hooks', () => ({
  useIsSuperuser: () => ({
    isSuperuser: true,
    loading: false,
    error: null,
  }),
  useSyncStatusPolling: () => mockUseSyncStatusPolling(),
}));

jest.mock('../common/SyncDialog', () => ({
  SyncDialog: ({ open, onClose, onSyncsStarted }: any) =>
    open ? (
      <div>
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

jest.mock('./CollectionsListPage', () => ({
  CollectionsContent: ({
    onSyncClick,
    onSourcesStatusChange,
  }: {
    onSyncClick?: () => void;
    onSourcesStatusChange?: (v: boolean | null) => void;
  }) => (
    <div>
      <span data-testid="collections-content">CollectionsContent</span>
      <button type="button" onClick={() => onSyncClick?.()}>
        Open sync
      </button>
      <button type="button" onClick={() => onSourcesStatusChange?.(true)}>
        Set sources
      </button>
      <button type="button" onClick={() => onSourcesStatusChange?.(false)}>
        Set no sources
      </button>
    </div>
  ),
}));

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};
const mockFetchApi = { fetch: jest.fn() };

const theme = createTheme();

describe('CollectionsCatalogPage', () => {
  it('renders page with Collections header', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <CollectionsCatalogPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    expect(screen.getByText('Collections')).toBeInTheDocument();
  });

  it('renders CollectionsContent', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <CollectionsCatalogPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    expect(screen.getByTestId('collections-content')).toBeInTheDocument();
  });

  it('opens sync dialog when Sync Now is clicked', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ content: { providers: [] } }),
    });

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <CollectionsCatalogPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    fireEvent.click(syncButton);

    await expect(screen.findByText('Close sync')).resolves.toBeInTheDocument();
  });

  it('calls onSourcesStatusChange when CollectionsContent reports source status', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <CollectionsCatalogPage />
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
          <CollectionsCatalogPage />
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
          <CollectionsCatalogPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeDisabled();
    expect(screen.getByTitle('Sync in progress')).toBeInTheDocument();

    mockUseSyncStatusPolling.mockReturnValue({
      isSyncInProgress: false,
      startTracking: mockStartTracking,
    });
  });

  it('closes sync dialog when onClose is called (line 61)', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <CollectionsCatalogPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Sync Now/i }));
    await expect(screen.findByText('Close sync')).resolves.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Close sync/i }));
    expect(screen.queryByText('Close sync')).not.toBeInTheDocument();
  });

  it('handles onSourcesStatusChange with null value (line 25-27)', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <CollectionsCatalogPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).not.toBeDisabled();
  });

  it('sync is enabled when hasConfiguredSources is true and not syncing (line 36)', async () => {
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
          <CollectionsCatalogPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Set sources/i }));
    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).not.toBeDisabled();
  });

  it('syncDisabledReason is undefined when sources are configured and not syncing (line 38-43)', async () => {
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
          <CollectionsCatalogPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Set sources/i }));
    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).not.toBeDisabled();
    expect(
      screen.queryByTitle('No content sources configured'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTitle('Sync in progress')).not.toBeInTheDocument();
  });
});

describe('CollectionsCatalogPage NotificationStack (lines 65-68)', () => {
  const mockRemoveNotification = jest.fn();
  const mockNotifications = [
    { id: '1', message: 'Test notification', severity: 'success' as const },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSyncStatusPolling.mockReturnValue({
      isSyncInProgress: false,
      startTracking: mockStartTracking,
    });
  });

  jest.mock('../notifications', () => ({
    NotificationProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    NotificationStack: ({
      notifications,
      onClose,
    }: {
      notifications: Array<{ id: string; message: string; severity: string }>;
      onClose: (id: string) => void;
    }) => (
      <div data-testid="notification-stack">
        {notifications.map(n => (
          <div key={n.id} data-testid={`notification-${n.id}`}>
            {n.message}
            <button onClick={() => onClose(n.id)}>Dismiss</button>
          </div>
        ))}
      </div>
    ),
    useNotifications: () => ({
      notifications: mockNotifications,
      removeNotification: mockRemoveNotification,
      addNotification: jest.fn(),
    }),
  }));

  it('renders within NotificationProvider wrapper (lines 73-78)', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <CollectionsCatalogPage />
        </ThemeProvider>
      </TestApiProvider>,
    );

    expect(screen.getByTestId('collections-content')).toBeInTheDocument();
  });
});
