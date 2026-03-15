import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import {
  catalogApiRef,
  EntityKindFilter,
  EntityListProvider,
  EntityTypeFilter,
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

jest.mock('../../hooks', () => ({
  useIsSuperuser: () => ({
    isSuperuser: true,
    loading: false,
    error: null,
  }),
}));

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

const renderListPage = (
  props?: {
    onSyncClick?: () => void;
    onSourcesStatusChange?: (v: boolean | null) => void;
  },
  starredApi?: InstanceType<typeof MockStarredEntitiesApi>,
) => {
  return render(
    <ThemeProvider theme={theme}>
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
          [starredEntitiesApiRef, starredApi ?? new MockStarredEntitiesApi()],
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
        content: {
          providers: [
            {
              sourceId: 'src-1',
              lastSyncTime: null,
              lastFailedSyncTime: null,
            },
          ],
        },
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

  it('filters by search query matching entity tag', async () => {
    const entityWithTag = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        name: 'tagged-collection',
        uid: 'uid-tagged',
        tags: ['ansible', 'automation'],
      },
      spec: {
        ...mockEntity.spec,
        collection_full_name: 'ns.tagged',
        collection_namespace: 'ns',
        collection_name: 'tagged',
        collection_version: '1.0.0',
      } as any,
    };
    mockCatalogApi.getEntities.mockResolvedValue({ items: [entityWithTag] });

    renderListPage();

    await waitFor(() => {
      expect(screen.getByText('ns.tagged')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search');
    fireEvent.change(searchInput, { target: { value: 'autom' } });

    await waitFor(() => {
      expect(screen.getByText('ns.tagged')).toBeInTheDocument();
    });
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
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

  it('shows error message when getEntities rejects', async () => {
    mockCatalogApi.getEntities.mockRejectedValue(new Error('Catalog error'));

    renderListPage();

    await waitFor(() => {
      expect(screen.getByText(/Error: Catalog error/)).toBeInTheDocument();
    });
  });

  it('handles getEntities returning array directly', async () => {
    mockCatalogApi.getEntities.mockResolvedValue([mockEntity]);

    renderListPage();

    await waitFor(() => {
      expect(screen.getByText('ns.collection')).toBeInTheDocument();
    });
  });

  it('calls onSourcesStatusChange with false when sync status fetch is not ok', async () => {
    mockFetchApi.fetch.mockResolvedValue({ ok: false });
    const onSourcesStatusChange = jest.fn();

    renderListPage({ onSourcesStatusChange });

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onSourcesStatusChange).toHaveBeenCalledWith(false);
    });
  });

  it('calls onSourcesStatusChange with false when sync status fetch rejects', async () => {
    mockFetchApi.fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue({
        ok: true,
        json: async () => ({ content: { providers: [] } }),
      });
    const onSourcesStatusChange = jest.fn();

    renderListPage({ onSourcesStatusChange });

    await waitFor(() => {
      expect(onSourcesStatusChange).toHaveBeenCalledWith(false);
    });
  });

  it('shows pagination when more than PAGE_SIZE entities', async () => {
    const entities = Array.from({ length: 14 }, (_, i) => ({
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        name: `col-${i}`,
        uid: `uid-${i}`,
      },
      spec: {
        ...mockEntity.spec,
        collection_full_name: `ns.col${i}`,
        collection_namespace: 'ns',
        collection_name: `col${i}`,
        collection_version: '1.0.0',
      } as any,
    }));
    mockCatalogApi.getEntities.mockResolvedValue({ items: entities });

    renderListPage();

    await waitFor(() => {
      expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Next page')).not.toBeDisabled();
    expect(screen.getByLabelText('Previous page')).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Next page'));

    await waitFor(() => {
      expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Previous page')).not.toBeDisabled();
    expect(screen.getByLabelText('Next page')).toBeDisabled();
  });

  it('clear search button clears search query', async () => {
    renderListPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
    });
    const searchInput = screen.getByPlaceholderText('Search');
    fireEvent.change(searchInput, { target: { value: 'test' } });
    expect(searchInput).toHaveValue('test');

    const clearButton = screen.getByLabelText('Clear search');
    fireEvent.click(clearButton);

    expect(searchInput).toHaveValue('');
  });

  it('Show latest version only checkbox toggles filter', async () => {
    renderListPage();

    await waitFor(() => {
      expect(screen.getByText('ns.collection')).toBeInTheDocument();
    });
    const checkbox = screen.getByLabelText('Show latest version only');
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('source filter can be changed', async () => {
    renderListPage();

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('Search sources...'),
      ).toBeInTheDocument();
    });
    const sourceInput = screen.getByPlaceholderText('Search sources...');
    fireEvent.focus(sourceInput);
    fireEvent.keyDown(sourceInput, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(screen.getByText('repo1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('repo1'));
    expect(sourceInput.closest('input')).toHaveValue('repo1');
  });

  it('when filters.user is starred only starred entities are shown', async () => {
    const catalogReact = require('@backstage/plugin-catalog-react');
    const useEntityListSpy = jest
      .spyOn(catalogReact, 'useEntityList')
      .mockReturnValue({
        filters: { user: { value: 'starred' } },
        updateFilters: jest.fn(),
        queryParameters: {},
      } as any);

    const starredApi = new MockStarredEntitiesApi();
    starredApi.toggleStarred('component:default/test-collection');

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

    renderListPage(undefined, starredApi);

    await waitFor(() => {
      expect(screen.getByText('ns.collection')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByText('other.other')).not.toBeInTheDocument();
    });
    expect(screen.getByText('ns.collection')).toBeInTheDocument();

    useEntityListSpy.mockRestore();
  });

  it('when filters.user is all all entities are shown with showLatestOnly applied', async () => {
    const catalogReact = require('@backstage/plugin-catalog-react');
    const useEntityListSpy = jest
      .spyOn(catalogReact, 'useEntityList')
      .mockReturnValue({
        filters: { user: { value: 'all' } },
        updateFilters: jest.fn(),
        queryParameters: {},
      } as any);

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
      expect(screen.getByText('other.other')).toBeInTheDocument();
    });

    useEntityListSpy.mockRestore();
  });
});

describe('CollectionsTypeFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalogApi.getEntities.mockResolvedValue({ items: [mockEntity] });
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: {
          providers: [
            {
              sourceId: 'src-1',
              lastSyncTime: null,
              lastFailedSyncTime: null,
            },
          ],
        },
      }),
    });
  });

  it('calls updateFilters with kind and type when filters are missing', async () => {
    const updateFiltersMock = jest.fn();
    const catalogReact = require('@backstage/plugin-catalog-react');
    const useEntityListSpy = jest
      .spyOn(catalogReact, 'useEntityList')
      .mockReturnValue({
        filters: {},
        updateFilters: updateFiltersMock,
        queryParameters: {},
      } as any);

    renderListPage();

    await waitFor(() => {
      expect(updateFiltersMock).toHaveBeenCalled();
    });

    expect(updateFiltersMock).toHaveBeenCalledWith(expect.any(Function));
    const updater = updateFiltersMock.mock.calls[0][0];
    const result = updater({});
    expect(result.kind).toBeInstanceOf(EntityKindFilter);
    expect(result.kind.value).toBe('Component');
    expect(result.type).toBeInstanceOf(EntityTypeFilter);
    expect(result.type.getTypes()).toEqual(['ansible-collection']);

    useEntityListSpy.mockRestore();
  });

  it('does not call updateFilters when kind and type are already set', async () => {
    const updateFiltersMock = jest.fn();
    const catalogReact = require('@backstage/plugin-catalog-react');
    const useEntityListSpy = jest
      .spyOn(catalogReact, 'useEntityList')
      .mockReturnValue({
        filters: {
          kind: new EntityKindFilter('Component', 'Component'),
          type: new EntityTypeFilter('ansible-collection'),
          user: { value: 'all' },
        },
        updateFilters: updateFiltersMock,
        queryParameters: {},
      } as any);

    renderListPage();

    await waitFor(() => {
      expect(screen.getByText('ns.collection')).toBeInTheDocument();
    });

    expect(updateFiltersMock).not.toHaveBeenCalled();

    useEntityListSpy.mockRestore();
  });

  it('is rendered when CollectionsListPage renders with entities', async () => {
    renderListPage();

    await waitFor(() => {
      expect(screen.getByText('ns.collection')).toBeInTheDocument();
    });

    expect(screen.getByTestId('catalog-filter-layout')).toBeInTheDocument();
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

describe('CollectionsListPage with filterByRepositoryEntity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: {
          providers: [
            {
              sourceId: 'src-1',
              lastSyncTime: null,
              lastFailedSyncTime: null,
            },
          ],
        },
      }),
    });
  });

  const renderWithRepoFilter = (repoEntity: Entity) => {
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
              <CollectionsListPage filterByRepositoryEntity={repoEntity} />
            </EntityListProvider>
          </MemoryRouter>
        </TestApiProvider>
      </ThemeProvider>,
    );
  };

  it('filters collections by repository_collections spec (lines 145-146)', async () => {
    const collections = [
      {
        ...mockEntity,
        metadata: {
          ...mockEntity.metadata,
          name: 'collection-a',
          uid: 'uid-a',
        },
        spec: {
          ...mockEntity.spec,
          collection_full_name: 'ns.collection-a',
        } as any,
      },
      {
        ...mockEntity,
        metadata: {
          ...mockEntity.metadata,
          name: 'collection-b',
          uid: 'uid-b',
        },
        spec: {
          ...mockEntity.spec,
          collection_full_name: 'ns.collection-b',
        } as any,
      },
      {
        ...mockEntity,
        metadata: {
          ...mockEntity.metadata,
          name: 'collection-c',
          uid: 'uid-c',
        },
        spec: {
          ...mockEntity.spec,
          collection_full_name: 'ns.collection-c',
        } as any,
      },
    ];
    mockCatalogApi.getEntities.mockResolvedValue({ items: collections });

    const repoEntity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'my-repo' },
      spec: {
        repository_collections: ['collection-a', 'collection-c'],
      },
    };

    renderWithRepoFilter(repoEntity);

    await waitFor(() => {
      expect(screen.getByText('ns.collection-a')).toBeInTheDocument();
      expect(screen.getByText('ns.collection-c')).toBeInTheDocument();
    });
    expect(screen.queryByText('ns.collection-b')).not.toBeInTheDocument();
  });

  it('filters collections by SCM annotations (lines 145-146)', async () => {
    const collections = [
      {
        ...mockEntity,
        metadata: {
          ...mockEntity.metadata,
          name: 'collection-a',
          uid: 'uid-a',
          annotations: {
            'ansible.io/scm-provider': 'github',
            'ansible.io/scm-host': 'github.com',
            'ansible.io/scm-organization': 'my-org',
            'ansible.io/scm-repository': 'my-repo',
            'ansible.io/discovery-source-id': 'src-1',
          },
        },
        spec: {
          ...mockEntity.spec,
          collection_full_name: 'ns.collection-a',
        } as any,
      },
      {
        ...mockEntity,
        metadata: {
          ...mockEntity.metadata,
          name: 'collection-b',
          uid: 'uid-b',
          annotations: {
            'ansible.io/scm-provider': 'github',
            'ansible.io/scm-host': 'github.com',
            'ansible.io/scm-organization': 'other-org',
            'ansible.io/scm-repository': 'other-repo',
            'ansible.io/discovery-source-id': 'src-2',
          },
        },
        spec: {
          ...mockEntity.spec,
          collection_full_name: 'ns.collection-b',
        } as any,
      },
    ];
    mockCatalogApi.getEntities.mockResolvedValue({ items: collections });

    const repoEntity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'my-repo',
        annotations: {
          'ansible.io/scm-provider': 'github',
          'ansible.io/scm-host': 'github.com',
          'ansible.io/scm-organization': 'my-org',
          'ansible.io/scm-repository': 'my-repo',
        },
      },
      spec: {},
    };

    renderWithRepoFilter(repoEntity);

    await waitFor(() => {
      expect(screen.getByText('ns.collection-a')).toBeInTheDocument();
    });
    expect(screen.queryByText('ns.collection-b')).not.toBeInTheDocument();
  });

  it('sorts collections when filterByRepositoryEntity is set (lines 216-219)', async () => {
    const collections = [
      {
        ...mockEntity,
        metadata: {
          ...mockEntity.metadata,
          name: 'z-collection',
          uid: 'uid-z',
        },
        spec: {
          ...mockEntity.spec,
          collection_full_name: 'ns.z-collection',
        } as any,
      },
      {
        ...mockEntity,
        metadata: {
          ...mockEntity.metadata,
          name: 'a-collection',
          uid: 'uid-a',
        },
        spec: {
          ...mockEntity.spec,
          collection_full_name: 'ns.a-collection',
        } as any,
      },
    ];
    mockCatalogApi.getEntities.mockResolvedValue({ items: collections });

    const repoEntity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'my-repo' },
      spec: {
        repository_collections: ['z-collection', 'a-collection'],
      },
    };

    renderWithRepoFilter(repoEntity);

    await waitFor(() => {
      const cards = screen.getAllByText(/ns\./);
      expect(cards[0]).toHaveTextContent('ns.a-collection');
      expect(cards[1]).toHaveTextContent('ns.z-collection');
    });
  });

  it('shows empty state when no collections match repository filter', async () => {
    const collections = [
      {
        ...mockEntity,
        metadata: {
          ...mockEntity.metadata,
          name: 'collection-x',
          uid: 'uid-x',
        },
        spec: {
          ...mockEntity.spec,
          collection_full_name: 'ns.collection-x',
        } as any,
      },
    ];
    mockCatalogApi.getEntities.mockResolvedValue({ items: collections });

    const repoEntity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'my-repo' },
      spec: {
        repository_collections: ['non-existent'],
      },
    };

    renderWithRepoFilter(repoEntity);

    await waitFor(() => {
      expect(
        screen.getByText('No collections discovered from this repository'),
      ).toBeInTheDocument();
    });
  });
});
