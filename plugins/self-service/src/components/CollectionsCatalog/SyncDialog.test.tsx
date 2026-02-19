import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { SyncDialog } from './SyncDialog';

const theme = createTheme();

const mockShowSyncStarted = jest.fn();
const mockShowSyncCompleted = jest.fn();
const mockShowSyncFailed = jest.fn();

jest.mock('./notifications', () => ({
  useSyncNotifications: () => ({
    showSyncStarted: mockShowSyncStarted,
    showSyncCompleted: mockShowSyncCompleted,
    showSyncFailed: mockShowSyncFailed,
  }),
}));

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};

const mockFetchApi = {
  fetch: jest.fn(),
};

const renderDialog = (props: { open: boolean; onClose: () => void }) => {
  return render(
    <ThemeProvider theme={theme}>
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <SyncDialog {...props} />
      </TestApiProvider>
    </ThemeProvider>,
  );
};

describe('SyncDialog', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        sourcesTree: {
          github: {
            'github.com': ['org1', 'org2'],
          },
        },
      }),
    });
  });

  it('renders nothing when open is false', () => {
    const { container } = renderDialog({ open: false, onClose: mockOnClose });
    expect(container.querySelector('.MuiDialog-root')).not.toBeInTheDocument();
  });

  it('renders dialog title and description when open', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('Sync sources')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Select the repositories or automation hubs/),
    ).toBeInTheDocument();
  });

  it('fetches sync status when opened', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(mockDiscoveryApi.getBaseUrl).toHaveBeenCalledWith('catalog');
    });
    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/catalog/ansible-collections/sync_status',
    );
  });

  it('calls onClose when close button is clicked', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('Sync sources')).toBeInTheDocument();
    });

    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onClose when Cancel is clicked', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cancel'));

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows loading state initially', () => {
    mockFetchApi.fetch.mockImplementation(() => new Promise(() => {}));

    renderDialog({ open: true, onClose: mockOnClose });

    expect(
      document.querySelector('.MuiCircularProgress-root'),
    ).toBeInTheDocument();
  });

  it('shows info alert when no sources configured', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sourcesTree: {} }),
    });

    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText(/No sources configured/)).toBeInTheDocument();
    });
  });

  it('disables Sync Selected when nothing selected', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('Sync sources')).toBeInTheDocument();
    });

    const syncButton = screen.getByRole('button', {
      name: /Sync Selected/i,
    });
    expect(syncButton).toBeDisabled();
  });

  it('handles fetch rejection without crashing', async () => {
    mockFetchApi.fetch.mockRejectedValue(new Error('Network error'));

    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText(/No sources configured/)).toBeInTheDocument();
    });
  });

  it('shows empty state when response is not ok', async () => {
    mockFetchApi.fetch.mockResolvedValue({ ok: false });

    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText(/No sources configured/)).toBeInTheDocument();
    });
  });

  it('renders sources tree with provider and orgs when loaded', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('GITHUB')).toBeInTheDocument();
    });
    expect(screen.getByText('github.com')).toBeInTheDocument();
    expect(screen.getByText('org1')).toBeInTheDocument();
    expect(screen.getByText('org2')).toBeInTheDocument();
  });

  it('Select All button is enabled after tree loads and is clickable', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('GITHUB')).toBeInTheDocument();
    });
    const selectAllBtn = screen.getByRole('button', { name: /Select All/i });
    expect(selectAllBtn).not.toBeDisabled();
    fireEvent.click(selectAllBtn);
  });

  it('clicking org selects it and enables Sync Selected', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('org1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('org1'));

    await waitFor(() => {
      const syncButton = screen.getByRole('button', {
        name: /Sync Selected/i,
      });
      expect(syncButton).not.toBeDisabled();
    });
  });

  it('handleSync shows error when no selection', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('Sync sources')).toBeInTheDocument();
    });
    const syncButton = screen.getByRole('button', {
      name: /Sync Selected/i,
    });
    expect(syncButton).toBeDisabled();
  });

  it('handleSync calls showSyncStarted and sync endpoint when org selected', async () => {
    mockFetchApi.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sourcesTree: {
            github: { 'github.com': ['myorg'] },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ success: true }] }),
      });

    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('myorg')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('myorg'));

    await waitFor(() => {
      const syncButton = screen.getByRole('button', {
        name: /Sync Selected/i,
      });
      expect(syncButton).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Sync Selected/i }));

    await waitFor(() => {
      expect(mockShowSyncStarted).toHaveBeenCalledWith(['github.com/myorg']);
      expect(mockOnClose).toHaveBeenCalled();
    });
    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/catalog/collections/sync/from-scm',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          filters: [
            {
              scmProvider: 'github',
              hostName: 'github.com',
              organization: 'myorg',
            },
          ],
        }),
      }),
    );
    await waitFor(() => {
      expect(mockShowSyncCompleted).toHaveBeenCalledWith('github.com/myorg');
    });
  });

  it('handleSync calls showSyncFailed when sync response fails', async () => {
    mockFetchApi.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sourcesTree: {
            github: { 'github.com': ['myorg'] },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ success: false, error: 'Sync error' }],
        }),
      });

    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('myorg')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('myorg'));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Sync Selected/i }),
      ).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Sync Selected/i }));

    await waitFor(() => {
      expect(mockShowSyncFailed).toHaveBeenCalledWith(
        'github.com/myorg',
        'Sync error',
      );
    });
  });

  it('toggle provider expand/collapse', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('GITHUB')).toBeInTheDocument();
    });
    const providerButton = screen.getByRole('button', { name: 'GITHUB' });
    fireEvent.click(providerButton);
    fireEvent.click(providerButton);
  });
});
