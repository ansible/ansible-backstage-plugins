import { screen, fireEvent } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { CollectionsCatalogPage } from './CollectionsCatalogPage';

jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: () => ({ allowed: true }),
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
      json: async () => ({ sourcesTree: {} }),
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

    await expect(
      screen.findByText('Sync sources'),
    ).resolves.toBeInTheDocument();
  });
});
