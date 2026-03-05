import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { SyncDialog } from './SyncDialog';
import type { SyncDialogProps } from './types';

const theme = createTheme();

const mockShowNotification = jest.fn();

jest.mock('../notifications', () => ({
  useNotifications: () => ({
    showNotification: mockShowNotification,
  }),
}));

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};

const mockFetchApi = {
  fetch: jest.fn(),
};

const renderDialog = (props: SyncDialogProps) => {
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
        content: {
          providers: [
            {
              sourceId: 'src-1',
              scmProvider: 'github',
              hostName: 'github.com',
              organization: 'org1',
              lastSyncTime: null,
            },
            {
              sourceId: 'src-2',
              scmProvider: 'github',
              hostName: 'github.com',
              organization: 'org2',
              lastSyncTime: null,
            },
          ],
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
      'http://localhost:7007/api/catalog/ansible/sync/status?ansible_contents=true',
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
      json: async () => ({ content: { providers: [] } }),
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
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    expect(screen.getByText('github.com')).toBeInTheDocument();
    expect(screen.getByText('org1')).toBeInTheDocument();
    expect(screen.getByText('org2')).toBeInTheDocument();
  });

  it('Select All button is enabled after tree loads and is clickable', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
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

  it('handleSync calls showNotification and onSyncsStarted and sync endpoint when org selected', async () => {
    const mockOnSyncsStarted = jest.fn();
    mockFetchApi.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: {
            providers: [
              {
                sourceId: 'src-myorg',
                scmProvider: 'github',
                hostName: 'github.com',
                organization: 'myorg',
                lastSyncTime: null,
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    renderDialog({
      open: true,
      onClose: mockOnClose,
      onSyncsStarted: mockOnSyncsStarted,
    });

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
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sync started',
          description: 'Syncing content from 1 source',
          items: ['github.com/myorg'],
          severity: 'info',
          collapsible: true,
          category: 'sync-started',
        }),
      );
      expect(mockOnSyncsStarted).toHaveBeenCalledWith([
        expect.objectContaining({
          sourceId: 'src-myorg',
          displayName: 'github.com/myorg',
          lastSyncTime: null,
        }),
      ]);
      expect(mockOnClose).toHaveBeenCalled();
    });
    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/catalog/ansible/sync/from-scm/content',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  });

  it('handleSync closes dialog and fires sync requests (fire-and-forget)', async () => {
    mockFetchApi.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: {
            providers: [
              {
                sourceId: 'src-myorg',
                scmProvider: 'github',
                hostName: 'github.com',
                organization: 'myorg',
                lastSyncTime: null,
              },
            ],
          },
        }),
      })
      .mockResolvedValue({ ok: true });

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
      expect(mockOnClose).toHaveBeenCalled();
    });
    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/catalog/ansible/sync/from-scm/content',
      expect.any(Object),
    );
  });

  it('calls PAH sync endpoint when PAH repository is selected', async () => {
    mockFetchApi.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: {
            providers: [
              {
                sourceId: 'pah-src-1',
                repository: 'my-pah-repo',
                scmProvider: 'pah',
                lastSyncTime: null,
              },
            ],
          },
        }),
      })
      .mockResolvedValue({ ok: true });

    const mockOnSyncsStarted = jest.fn();
    renderDialog({
      open: true,
      onClose: mockOnClose,
      onSyncsStarted: mockOnSyncsStarted,
    });

    await waitFor(() => {
      expect(screen.getByText('my-pah-repo')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('my-pah-repo'));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Sync Selected/i }),
      ).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Sync Selected/i }));

    await waitFor(() => {
      expect(mockOnSyncsStarted).toHaveBeenCalledWith([
        expect.objectContaining({
          sourceId: 'pah-src-1',
          displayName: 'PAH/my-pah-repo',
          lastSyncTime: null,
        }),
      ]);
    });
    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/catalog/ansible/sync/from-aap/content',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          filters: [{ repository_name: 'my-pah-repo' }],
        }),
      }),
    );
  });

  it('toggle provider expand/collapse', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    const providerRow = screen.getByText('GitHub').closest('.MuiListItem-root');
    expect(providerRow).toBeInTheDocument();
    fireEvent.click(providerRow!);
    fireEvent.click(providerRow!);
  });

  it('toggleHost collapses and expands host when clicking host row', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('org1')).toBeInTheDocument();
    });
    const hostRow = screen.getByText('github.com').closest('.MuiListItem-root');
    expect(hostRow).toBeInTheDocument();
    fireEvent.click(hostRow!);
    await waitFor(
      () => {
        expect(screen.queryByText('org1')).not.toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    const hostRowAgain = screen
      .getByText('github.com')
      .closest('.MuiListItem-root');
    fireEvent.click(hostRowAgain!);
    await waitFor(
      () => {
        expect(screen.getByText('org1')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it('Deselect All clears selection and disables Sync Selected', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(
      () => {
        expect(screen.getByText('org1')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));
    await waitFor(
      () => {
        expect(
          screen.getByRole('button', { name: /Sync Selected/i }),
        ).not.toBeDisabled();
      },
      { timeout: 5000 },
    );
    fireEvent.click(screen.getByRole('button', { name: /Deselect All/i }));
    await waitFor(
      () => {
        expect(
          screen.getByRole('button', { name: /Sync Selected/i }),
        ).toBeDisabled();
      },
      { timeout: 5000 },
    );
  }, 15000);

  it('toggleSelection at provider level deselects provider and all children', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Sync Selected/i }),
      ).not.toBeDisabled();
    });
    const providerRow = screen.getByText('GitHub').closest('.MuiListItem-root');
    const providerCheckbox = providerRow?.querySelector(
      'input[type="checkbox"]',
    );
    fireEvent.click(providerCheckbox!);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Sync Selected/i }),
      ).toBeDisabled();
    });
  });

  it('toggleSelection at provider level selects provider and all children', async () => {
    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    const providerRow = screen.getByText('GitHub').closest('.MuiListItem-root');
    const providerCheckbox = providerRow?.querySelector(
      'input[type="checkbox"]',
    );
    fireEvent.click(providerCheckbox!);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Sync Selected/i }),
      ).not.toBeDisabled();
    });
    expect(screen.getByText('org1')).toBeInTheDocument();
    expect(screen.getByText('org2')).toBeInTheDocument();
  });

  it('buildFilters returns provider-only filter when entire provider selected and syncs', async () => {
    const mockOnSyncsStarted = jest.fn();
    mockFetchApi.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: {
            providers: [
              {
                sourceId: 'src-1',
                scmProvider: 'github',
                hostName: 'github.com',
                organization: 'org1',
                lastSyncTime: null,
              },
              {
                sourceId: 'src-2',
                scmProvider: 'github',
                hostName: 'github.com',
                organization: 'org2',
                lastSyncTime: null,
              },
              {
                sourceId: 'src-leaf',
                scmProvider: 'github',
                hostName: 'leaf.com',
                lastSyncTime: null,
              },
            ],
          },
        }),
      })
      .mockResolvedValue({ ok: true });

    renderDialog({
      open: true,
      onClose: mockOnClose,
      onSyncsStarted: mockOnSyncsStarted,
    });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    const providerRow = screen.getByText('GitHub').closest('.MuiListItem-root');
    const providerCheckbox = providerRow?.querySelector(
      'input[type="checkbox"]',
    );
    fireEvent.click(providerCheckbox!);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Sync Selected/i }),
      ).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Sync Selected/i }));

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/ansible/sync/from-scm/content',
        expect.objectContaining({
          body: JSON.stringify({
            filters: [{ scmProvider: 'github' }],
          }),
        }),
      );
    });
    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sync started',
        items: expect.arrayContaining(['github.com/org1', 'github.com/org2']),
      }),
    );
  });

  it('selecting host level selects all orgs and syncs both', async () => {
    mockFetchApi.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: {
            providers: [
              {
                sourceId: 'src-1',
                scmProvider: 'github',
                hostName: 'github.com',
                organization: 'org1',
                lastSyncTime: null,
              },
              {
                sourceId: 'src-2',
                scmProvider: 'github',
                hostName: 'github.com',
                organization: 'org2',
                lastSyncTime: null,
              },
            ],
          },
        }),
      })
      .mockResolvedValue({ ok: true });

    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('github.com')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('GitHub'));
    await waitFor(() => {
      expect(screen.getByText('org1')).toBeInTheDocument();
    });
    const hostRow = screen.getByText('github.com').closest('.MuiListItem-root');
    const hostCheckbox = hostRow?.querySelector('input[type="checkbox"]');
    fireEvent.click(hostCheckbox!);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Sync Selected/i }),
      ).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Sync Selected/i }));

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/ansible/sync/from-scm/content',
        expect.objectContaining({
          body: JSON.stringify({
            filters: [{ scmProvider: 'github', hostName: 'github.com' }],
          }),
        }),
      );
    });
  });

  it('renders GitLab provider with correct display name', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: {
          providers: [
            {
              sourceId: 'gl-1',
              scmProvider: 'gitlab',
              hostName: 'gitlab.com',
              organization: 'mygroup',
              lastSyncTime: null,
            },
          ],
        },
      }),
    });

    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('GitLab')).toBeInTheDocument();
    });
    expect(screen.getByText('gitlab.com')).toBeInTheDocument();
    expect(screen.getByText('mygroup')).toBeInTheDocument();
  });

  it('renders unknown provider with uppercase display name', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: {
          providers: [
            {
              sourceId: 'custom-1',
              scmProvider: 'custom',
              hostName: 'custom.example.com',
              organization: 'team',
              lastSyncTime: null,
            },
          ],
        },
      }),
    });

    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('CUSTOM')).toBeInTheDocument();
    });
  });

  it('renders providers in sorted alphabetical order', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: {
          providers: [
            {
              sourceId: 'gl-1',
              scmProvider: 'gitlab',
              hostName: 'gitlab.com',
              organization: 'group',
              lastSyncTime: null,
            },
            {
              sourceId: 'custom-1',
              scmProvider: 'custom',
              hostName: 'custom.example.com',
              organization: 'team',
              lastSyncTime: null,
            },
            {
              sourceId: 'gh-1',
              scmProvider: 'github',
              hostName: 'github.com',
              organization: 'org',
              lastSyncTime: null,
            },
          ],
        },
      }),
    });

    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('CUSTOM')).toBeInTheDocument();
      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('GitLab')).toBeInTheDocument();
    });

    const customEl = screen.getByText('CUSTOM').closest('.MuiListItem-root');
    const githubEl = screen.getByText('GitHub').closest('.MuiListItem-root');
    const gitlabEl = screen.getByText('GitLab').closest('.MuiListItem-root');
    expect(
      customEl!.compareDocumentPosition(githubEl!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      githubEl!.compareDocumentPosition(gitlabEl!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('toggleSelection at host level deselects orgs under that host', async () => {
    mockFetchApi.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: {
            providers: [
              {
                sourceId: 'src-1',
                scmProvider: 'github',
                hostName: 'github.com',
                organization: 'org1',
                lastSyncTime: null,
              },
              {
                sourceId: 'src-2',
                scmProvider: 'github',
                hostName: 'github.com',
                organization: 'org2',
                lastSyncTime: null,
              },
              {
                sourceId: 'src-3',
                scmProvider: 'gitlab',
                hostName: 'gitlab.com',
                organization: 'mygroup',
                lastSyncTime: null,
              },
            ],
          },
        }),
      })
      .mockResolvedValue({ ok: true });

    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(
      () => {
        expect(screen.getByText('org1')).toBeInTheDocument();
        expect(screen.getByText('mygroup')).toBeInTheDocument();
      },
      { timeout: 8000 },
    );

    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));

    await waitFor(
      () => {
        expect(
          screen.getByRole('button', { name: /Sync Selected/i }),
        ).not.toBeDisabled();
      },
      { timeout: 3000 },
    );

    // Deselect the github.com host so only GitLab remains (covers toggleSelection host-level branch)
    const hostRow = screen
      .getByText('github.com')
      .closest('.MuiListItem-root') as HTMLElement;
    const hostCheckbox = within(hostRow).getByRole('checkbox');
    fireEvent.click(hostCheckbox);
    fireEvent.click(screen.getByRole('button', { name: /Sync Selected/i }));

    await waitFor(
      () => {
        const syncCalls = mockFetchApi.fetch.mock.calls.filter((c: [string]) =>
          String(c[0]).includes('from-scm'),
        );
        expect(syncCalls.length).toBeGreaterThan(0);
        const lastSync = syncCalls.at(-1);
        expect(lastSync).toBeDefined();
        const body = JSON.parse(
          (lastSync as [string, { body: string }])[1].body,
        );
        const gitlabFilter = body.filters.find(
          (f: { scmProvider?: string }) => f.scmProvider === 'gitlab',
        );
        expect(gitlabFilter).toBeDefined();
        expect(gitlabFilter).toMatchObject({ scmProvider: 'gitlab' });
      },
      { timeout: 5000 },
    );
  }, 15000);

  it('selecting leaf host syncs with host-only filter', async () => {
    mockFetchApi.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: {
            providers: [
              {
                sourceId: 'src-standalone',
                scmProvider: 'github',
                hostName: 'standalone.example.com',
                lastSyncTime: null,
              },
            ],
          },
        }),
      })
      .mockResolvedValue({ ok: true });

    renderDialog({ open: true, onClose: mockOnClose });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('GitHub'));
    await waitFor(() => {
      expect(screen.getByText('standalone.example.com')).toBeInTheDocument();
    });
    const hostRow = screen
      .getByText('standalone.example.com')
      .closest('.MuiListItem-root');
    const hostCheckbox = hostRow?.querySelector('input[type="checkbox"]');
    fireEvent.click(hostCheckbox!);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Sync Selected/i }),
      ).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Sync Selected/i }));

    await waitFor(() => {
      const syncCall = mockFetchApi.fetch.mock.calls.find((c: [string]) =>
        String(c[0]).includes('from-scm/content'),
      );
      expect(syncCall).toBeDefined();
      const body = JSON.parse((syncCall as [string, { body: string }])[1].body);
      expect(body.filters).toContainEqual({
        scmProvider: 'github',
        hostName: 'standalone.example.com',
        organization: 'standalone.example.com',
      });
    });
  });
});
