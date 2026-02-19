import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import {
  catalogApiRef,
  EntityListProvider,
  MockStarredEntitiesApi,
  starredEntitiesApiRef,
} from '@backstage/plugin-catalog-react';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';

jest.mock('@backstage/plugin-catalog-react', () => {
  const actual = jest.requireActual('@backstage/plugin-catalog-react');
  const CatalogFilterLayout = ({
    children,
  }: {
    children?: React.ReactNode;
  }) => <div data-testid="catalog-filter-layout">{children}</div>;
  CatalogFilterLayout.Filters = ({
    children,
  }: {
    children?: React.ReactNode;
  }) => <div data-testid="catalog-filters">{children}</div>;
  CatalogFilterLayout.Content = ({
    children,
  }: {
    children?: React.ReactNode;
  }) => <div data-testid="catalog-content">{children}</div>;
  const UserListPicker = () => <div data-testid="user-list-picker" />;
  return {
    ...actual,
    CatalogFilterLayout,
    UserListPicker,
    EntityListProvider: actual.EntityListProvider,
    catalogApiRef: actual.catalogApiRef,
    starredEntitiesApiRef: actual.starredEntitiesApiRef,
    MockStarredEntitiesApi: actual.MockStarredEntitiesApi,
  };
});
import { Entity } from '@backstage/catalog-model';
import { MemoryRouter } from 'react-router-dom';
import { CollectionsListPage, CollectionsContent } from './CollectionsListPage';

const theme = createTheme();

const mockEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test-collection',
    uid: 'uid-1',
    annotations: {
      'ansible.io/discovery-source-id': 'src-1',
      'ansible.io/collection-source': 'pah',
      'ansible.io/collection-source-repository': 'repo1',
    },
  },
  spec: {
    type: 'ansible-collection',
    collection_full_name: 'ns.collection',
    collection_namespace: 'ns',
    collection_name: 'collection',
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

const renderListPage = (props?: {
  onSyncClick?: () => void;
  onSourcesStatusChange?: (v: boolean | null) => void;
}) => {
  return render(
    <ThemeProvider theme={theme}>
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
          [starredEntitiesApiRef, new MockStarredEntitiesApi()],
          [permissionApiRef, mockApis.permission()],
        ]}
      >
        <MemoryRouter>
          <EntityListProvider>
            <CollectionsListPage {...props} />
          </EntityListProvider>
        </MemoryRouter>
      </TestApiProvider>
    </ThemeProvider>,
  );
};

describe('CollectionsListPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalogApi.getEntities.mockResolvedValue({ items: [mockEntity] });
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        sources: [{ sourceId: 'src-1', lastSync: null }],
        sourcesTree: { github: { 'github.com': ['org1'] } },
      }),
    });
  });

  it('shows progress while loading', async () => {
    mockCatalogApi.getEntities.mockImplementation(() => new Promise(() => {}));

    renderListPage();

    await waitFor(() => {
      expect(mockCatalogApi.getEntities).toHaveBeenCalled();
    });
    expect(
      screen.queryByText('No content sources configured'),
    ).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search')).not.toBeInTheDocument();
  });

  it('renders EmptyState when no entities and sources not configured', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({ items: [] });
    mockFetchApi.fetch.mockResolvedValue({
      ok: false,
    });

    renderListPage();

    await waitFor(() => {
      expect(
        screen.getByText('No content sources configured'),
      ).toBeInTheDocument();
    });
  });

  it('renders collection cards when entities loaded', async () => {
    renderListPage();

    await waitFor(() => {
      expect(screen.getByText('ns.collection')).toBeInTheDocument();
    });

    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });

  it('renders search input', async () => {
    renderListPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
    });
  });

  it('filters by search query', async () => {
    const entities = [
      mockEntity,
      {
        ...mockEntity,
        metadata: { ...mockEntity.metadata, name: 'other', uid: 'uid-2' },
        spec: {
          ...mockEntity.spec,
          collection_full_name: 'other.other',
          collection_namespace: 'other',
          collection_name: 'other',
        } as any,
      },
    ];
    mockCatalogApi.getEntities.mockResolvedValue({ items: entities });

    renderListPage();

    await waitFor(() => {
      expect(screen.getByText('ns.collection')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search');
    fireEvent.change(searchInput, { target: { value: 'other' } });

    expect(
      await screen.findByText('other.other', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it('calls onSourcesStatusChange when sync status is fetched', async () => {
    const onSourcesStatusChange = jest.fn();

    renderListPage({ onSourcesStatusChange });

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(onSourcesStatusChange).toHaveBeenCalled();
    });
  });
});

describe('CollectionsContent', () => {
  it('renders when provided with router and APIs', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({ items: [] });
    mockFetchApi.fetch.mockResolvedValue({
      ok: false,
    });

    const { container } = render(
      <ThemeProvider theme={theme}>
        <TestApiProvider
          apis={[
            [catalogApiRef, mockCatalogApi],
            [discoveryApiRef, mockDiscoveryApi],
            [fetchApiRef, mockFetchApi],
            [starredEntitiesApiRef, new MockStarredEntitiesApi()],
            [permissionApiRef, mockApis.permission()],
          ]}
        >
          <MemoryRouter>
            <CollectionsContent />
          </MemoryRouter>
        </TestApiProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('No content sources configured'),
      ).toBeInTheDocument();
    });
    expect(container).toBeInTheDocument();
  });
});
