import { render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  catalogApiRef,
  starredEntitiesApiRef,
  MockStarredEntitiesApi,
  EntityListProvider,
} from '@backstage/plugin-catalog-react';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { MemoryRouter } from 'react-router-dom';

import { RepositoryCollectionsTab } from './RepositoryCollectionsTab';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/self-service',
}));

jest.mock('../../routes', () => ({
  rootRouteRef: { id: 'root-route-ref' },
}));

jest.mock('../CollectionsCatalog/usePaginatedCollections', () => ({
  usePaginatedCollections: jest.fn(),
}));

jest.mock('@backstage/ui', () => {
  const actual = jest.requireActual('@backstage/ui');
  return {
    ...actual,
    Table: ({ data }: { data?: Array<{ fullName: string }> }) => (
      <div data-testid="collections-table">
        {(data ?? []).map(row => (
          <div key={row.fullName}>{row.fullName}</div>
        ))}
      </div>
    ),
  };
});

const { usePaginatedCollections } = jest.requireMock(
  '../CollectionsCatalog/usePaginatedCollections',
);

const mockCatalogApi = { getEntities: jest.fn() };
const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};
const mockFetchApi = { fetch: jest.fn() };
const mockIdentityApi = {
  getCredentials: jest.fn().mockResolvedValue({ token: 'mock-token' }),
  getBackstageIdentity: jest
    .fn()
    .mockResolvedValue({ userEntityRef: 'user:default/guest' }),
};

const repositoryEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'test-repo' },
  spec: { type: 'git-repository' },
};

const collectionEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'community.general' },
  spec: {
    type: 'ansible-collection',
    collection_full_name: 'community.general',
    collection_version: '8.3.0',
  },
};

const renderTab = () =>
  render(
    <MemoryRouter>
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
          [identityApiRef, mockIdentityApi],
          [starredEntitiesApiRef, new MockStarredEntitiesApi()],
        ]}
      >
        <EntityListProvider>
          <RepositoryCollectionsTab repositoryEntity={repositoryEntity} />
        </EntityListProvider>
      </TestApiProvider>
    </MemoryRouter>,
  );

describe('RepositoryCollectionsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows intro copy and collection table rows', async () => {
    usePaginatedCollections.mockReturnValue({
      entities: [collectionEntity],
      totalCount: 1,
      initialLoading: false,
      pageLoading: false,
      error: null,
      currentPage: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
      nextPage: jest.fn(),
      prevPage: jest.fn(),
      syncStatusMap: {},
    });

    renderTab();

    expect(
      screen.getByText(
        'Review the Ansible collections discovered in this repository.',
      ),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('community.general')).toBeInTheDocument();
    });
  });

  it('shows repository-scoped empty state', async () => {
    usePaginatedCollections.mockReturnValue({
      entities: [],
      totalCount: 0,
      initialLoading: false,
      pageLoading: false,
      error: null,
      currentPage: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
      nextPage: jest.fn(),
      prevPage: jest.fn(),
      syncStatusMap: {},
    });

    renderTab();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: 'No collections discovered from this repository',
        }),
      ).toBeInTheDocument();
    });
  });
});
