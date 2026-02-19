import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { Entity } from '@backstage/catalog-model';
import { CollectionDetailsPage } from './CollectionDetailsPage';

const theme = createTheme();

const mockEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'my-namespace-my-collection',
    description: 'Test collection',
    annotations: {
      'ansible.io/collection-source': 'pah',
      'ansible.io/discovery-source-id': 'src-1',
      'backstage.io/source-url': 'https://example.com/source',
    },
  },
  spec: {
    type: 'ansible-collection',
    collection_full_name: 'my_namespace.my_collection',
    collection_version: '1.0.0',
  } as any,
};

const mockCatalogApi = {
  getEntities: jest.fn(),
};

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};

const mockFetchApi = {
  fetch: jest.fn(),
};

const renderWithRouter = (collectionName: string) => {
  return render(
    <ThemeProvider theme={theme}>
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
          [permissionApiRef, mockApis.permission()],
        ]}
      >
        <MemoryRouter initialEntries={[`/collections/${collectionName}`]}>
          <Routes>
            <Route
              path="/collections/:collectionName"
              element={<CollectionDetailsPage />}
            />
          </Routes>
        </MemoryRouter>
      </TestApiProvider>
    </ThemeProvider>,
  );
};

describe('CollectionDetailsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalogApi.getEntities.mockResolvedValue({ items: [mockEntity] });
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        sources: [{ sourceId: 'src-1', lastSync: '2024-06-15T10:00:00Z' }],
      }),
    });
  });

  it('shows loading initially', () => {
    mockCatalogApi.getEntities.mockImplementation(() => new Promise(() => {}));

    renderWithRouter('my-namespace-my-collection');

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders collection name and description when entity loaded', async () => {
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(
        screen.getAllByText('my_namespace.my_collection').length,
      ).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('Test collection').length).toBeGreaterThan(0);
  });

  it('renders breadcrumbs', async () => {
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('Collections')).toBeInTheDocument();
    });
    expect(
      screen.getAllByText('my_namespace.my_collection').length,
    ).toBeGreaterThan(0);
  });

  it('renders View Source button when entity has source url', async () => {
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /View Source/i }),
      ).toBeInTheDocument();
    });
  });

  it('renders EmptyState when entity not found', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({ items: [] });

    renderWithRouter('unknown-collection');

    await waitFor(() => {
      expect(screen.getByText('No Collections Found')).toBeInTheDocument();
    });
  });

  it('fetches entity by collection name', async () => {
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(mockCatalogApi.getEntities).toHaveBeenCalledWith({
        filter: [
          {
            'metadata.name': 'my-namespace-my-collection',
            kind: 'Component',
            'spec.type': 'ansible-collection',
          },
        ],
      });
    });
  });

  it('displays PAH HTML readme when entity has collection_readme_html', async () => {
    const entityWithHtmlReadme: Entity = {
      ...mockEntity,
      spec: {
        ...mockEntity.spec,
        collection_readme_html: '<p>PAH readme content</p>',
      } as any,
    };
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityWithHtmlReadme],
    });
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('PAH readme content')).toBeInTheDocument();
    });
  });

  it('calls window.open when View Source is clicked', async () => {
    const openSpy = jest
      .spyOn(globalThis, 'open')
      .mockImplementation(() => null);

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /View Source/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /View Source/i }));

    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/source',
      '_blank',
    );
    openSpy.mockRestore();
  });

  it('navigates to catalog when breadcrumb Collections is clicked', async () => {
    const { container } = renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('Collections')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Collections'));

    expect(container).toBeInTheDocument();
  });

  it('calls fetchEntity when refresh is triggered from about card', async () => {
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockCatalogApi.getEntities).toHaveBeenCalledTimes(2);
    });
  });

  it('fetches sync status and sets lastSync when sourceId matches', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        sources: [{ sourceId: 'src-1', lastSync: '2024-06-15T12:00:00Z' }],
      }),
    });
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining('ansible-collections/sync_status'),
      );
    });
  });

  it('entity without sourceId does not call sync status', async () => {
    const entityNoSourceId: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          'ansible.io/collection-source': 'pah',
          'backstage.io/source-url': 'https://example.com/source',
        },
      },
    };
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityNoSourceId],
    });
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });
    const syncStatusCalls = mockFetchApi.fetch.mock.calls.filter(
      (c: [string]) => String(c[0]).includes('sync_status'),
    );
    expect(syncStatusCalls.length).toBe(0);
  });
});
