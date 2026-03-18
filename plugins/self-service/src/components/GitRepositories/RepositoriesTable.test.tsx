import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  MockStarredEntitiesApi,
  starredEntitiesApiRef,
  EntityListProvider,
} from '@backstage/plugin-catalog-react';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { Entity } from '@backstage/catalog-model';
import { MemoryRouter } from 'react-router-dom';

interface TableColumn {
  title: unknown;
  id: string;
  render?: (entity: Entity) => React.ReactNode;
}

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/self-service',
}));

jest.mock('../../routes', () => ({
  rootRouteRef: { id: 'root-route-ref' },
}));

jest.mock('@backstage/core-components', () => {
  const actual = jest.requireActual('@backstage/core-components');
  return {
    ...actual,
    Progress: () => <div data-testid="progress">Loading...</div>,
    Table: ({
      title,
      data,
      columns,
    }: {
      title: string;
      data: unknown[];
      columns: TableColumn[];
    }) => (
      <div data-testid="table">
        <div data-testid="table-title">{title}</div>
        <table>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.id}>
                  {typeof col.title === 'string' ? col.title : col.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data as Entity[]).map(entity => (
              <tr
                key={entity.metadata?.name}
                data-testid={`table-row-${entity.metadata?.name}`}
              >
                {columns.map(col => (
                  <td
                    key={`${entity.metadata?.name}-${col.id}`}
                    data-testid={`cell-${entity.metadata?.name}-${col.id}`}
                  >
                    {col.render
                      ? col.render(entity)
                      : (entity.metadata?.title ?? entity.metadata?.name)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  };
});

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

import { RepositoriesTable } from './RepositoriesTable';

const theme = createTheme();

const mockCatalogApi = {
  getEntities: jest.fn(),
};

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};

const mockFetchApi = {
  fetch: jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ workflow_runs: [] }),
  }),
};

const createMockEntity = (
  name: string,
  provider: string = 'github',
): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name,
    title: `Repository ${name}`,
    annotations: {
      'ansible.io/scm-provider': provider,
      'ansible.io/scm-organization': 'test-org',
      'ansible.io/scm-repository': name,
      'ansible.io/scm-host':
        provider === 'github' ? 'github.com' : 'gitlab.com',
      'ansible.io/discovery-source-id': `${provider}:test-org`,
      'backstage.io/source-location': `url:https://${provider === 'github' ? 'github.com' : 'gitlab.com'}/test-org/${name}`,
    },
  },
  spec: {
    type: 'git-repository',
    repository_collection_count: 2,
    repository_ee_count: 1,
  },
});

const defaultSyncStatusMap: Record<
  string,
  { lastSyncTime: string | null; lastFailedSyncTime: string | null }
> = {
  'github:test-org': {
    lastSyncTime: '2024-06-15T10:00:00Z',
    lastFailedSyncTime: null,
  },
};

describe('RepositoriesTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [
        createMockEntity('repo-1'),
        createMockEntity('repo-2'),
        createMockEntity('gitlab-repo', 'gitlab'),
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderTable = (
    syncStatusMap = defaultSyncStatusMap,
    onSourcesStatusChange?: (status: boolean | null) => void,
  ) => {
    return render(
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
          <ThemeProvider theme={theme}>
            <EntityListProvider>
              <RepositoriesTable
                syncStatusMap={syncStatusMap}
                onSourcesStatusChange={onSourcesStatusChange}
              />
            </EntityListProvider>
          </ThemeProvider>
        </MemoryRouter>
      </TestApiProvider>,
    );
  };

  it('renders loading state initially', () => {
    mockCatalogApi.getEntities.mockImplementation(() => new Promise(() => {}));

    renderTable();

    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('renders repositories table with data', async () => {
    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByTestId('table-row-repo-1')).toBeInTheDocument();
    expect(screen.getByTestId('table-row-repo-2')).toBeInTheDocument();
    expect(screen.getByTestId('table-row-gitlab-repo')).toBeInTheDocument();
  });

  it('renders empty state when no repositories', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({ items: [] });

    renderTable();

    await waitFor(() => {
      expect(screen.getByText('No Git repositories found')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        'Sync your Ansible content sources to discover repositories that contain collections.',
      ),
    ).toBeInTheDocument();
  });

  it('calls onSourcesStatusChange with true when repos exist', async () => {
    const onSourcesStatusChange = jest.fn();

    renderTable(defaultSyncStatusMap, onSourcesStatusChange);

    await waitFor(() => {
      expect(onSourcesStatusChange).toHaveBeenCalledWith(true);
    });
  });

  it('calls onSourcesStatusChange with null when no repos exist', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({ items: [] });
    const onSourcesStatusChange = jest.fn();

    renderTable(defaultSyncStatusMap, onSourcesStatusChange);

    await waitFor(() => {
      expect(onSourcesStatusChange).toHaveBeenCalledWith(null);
    });
  });

  it('renders table with repository data', async () => {
    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByTestId('table-row-repo-1')).toBeInTheDocument();
    expect(screen.getByTestId('table-row-gitlab-repo')).toBeInTheDocument();
  });

  it('handles catalog API errors gracefully', async () => {
    mockCatalogApi.getEntities.mockRejectedValue(new Error('API Error'));
    const onSourcesStatusChange = jest.fn();

    renderTable(defaultSyncStatusMap, onSourcesStatusChange);

    await waitFor(() => {
      expect(onSourcesStatusChange).toHaveBeenCalledWith(null);
    });
  });

  it('renders source filter dropdown', async () => {
    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Search sources...'),
    ).toBeInTheDocument();
  });

  it('fetches entities with correct filter', async () => {
    renderTable();

    await waitFor(() => {
      expect(mockCatalogApi.getEntities).toHaveBeenCalledWith({
        filter: [{ kind: 'Component', 'spec.type': 'git-repository' }],
      });
    });
  });

  it('displays table title with count', async () => {
    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table-title')).toHaveTextContent(
        'Git Repositories (3)',
      );
    });
  });

  it('parses URL hostname from scm-host annotation', async () => {
    const entityWithUrlHost: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'url-host-repo',
        title: 'URL Host Repository',
        annotations: {
          'ansible.io/scm-provider': 'github',
          'ansible.io/scm-host': 'https://github.enterprise.com/path',
          'ansible.io/discovery-source-id': 'github:test-org',
          'backstage.io/source-location':
            'url:https://github.enterprise.com/test-org/url-host-repo',
        },
      },
      spec: { type: 'git-repository' },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityWithUrlHost],
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByTestId('table-row-url-host-repo')).toBeInTheDocument();
  });

  it('falls back to github.com when provider is github without host', async () => {
    const entityNoHost: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'no-host-repo',
        title: 'No Host Repository',
        annotations: {
          'ansible.io/scm-provider': 'github',
          'ansible.io/discovery-source-id': 'github:test-org',
        },
      },
      spec: { type: 'git-repository' },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityNoHost],
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('falls back to gitlab.com when provider is gitlab without host', async () => {
    const entityGitlab: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'gitlab-no-host-repo',
        title: 'GitLab No Host Repository',
        annotations: {
          'ansible.io/scm-provider': 'gitlab',
          'ansible.io/discovery-source-id': 'gitlab:test-org',
          'backstage.io/source-location':
            'url:https://gitlab.com/test-org/gitlab-no-host-repo',
        },
      },
      spec: { type: 'git-repository' },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityGitlab],
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('GitLab')).toBeInTheDocument();
  });

  it('handles unknown provider gracefully', async () => {
    const entityUnknown: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'unknown-provider-repo',
        title: 'Unknown Provider Repository',
        annotations: {
          'ansible.io/scm-provider': 'bitbucket',
          'ansible.io/discovery-source-id': 'bitbucket:test-org',
        },
      },
      spec: { type: 'git-repository' },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityUnknown],
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('Bitbucket')).toBeInTheDocument();
  });

  it('handles PAH provider', async () => {
    const entityPah: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'pah-repo',
        title: 'PAH Repository',
        annotations: {
          'ansible.io/scm-provider': 'pah',
          'ansible.io/discovery-source-id': 'pah:test-org',
        },
      },
      spec: { type: 'git-repository' },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityPah],
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('Private Automation Hub')).toBeInTheDocument();
  });

  it('handles entity without provider annotation', async () => {
    const entityNoProvider: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'no-provider-repo',
        title: 'No Provider Repository',
        annotations: {},
      },
      spec: { type: 'git-repository' },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityNoProvider],
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const sourceCell = screen.getByTestId('cell-no-provider-repo-source');
    expect(sourceCell).toHaveTextContent('—');
  });

  it('displays collection and EE counts correctly', async () => {
    const entityWithCounts: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'counts-repo',
        title: 'Counts Repository',
        annotations: {
          'ansible.io/scm-provider': 'github',
          'ansible.io/discovery-source-id': 'github:test-org',
        },
      },
      spec: {
        type: 'git-repository',
        repository_collection_count: 3,
        repository_ee_count: 2,
      },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityWithCounts],
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('3 collections, 2 EEs')).toBeInTheDocument();
  });

  it('displays singular collection count', async () => {
    const entitySingular: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'singular-repo',
        title: 'Singular Repository',
        annotations: {
          'ansible.io/scm-provider': 'github',
          'ansible.io/discovery-source-id': 'github:test-org',
        },
      },
      spec: {
        type: 'git-repository',
        repository_collection_count: 1,
        repository_ee_count: 1,
      },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entitySingular],
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('1 collection, 1 EE')).toBeInTheDocument();
  });

  it('displays dash when no collections or EEs', async () => {
    const entityNoCounts: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'no-counts-repo',
        title: 'No Counts Repository',
        annotations: {
          'ansible.io/scm-provider': 'github',
          'ansible.io/discovery-source-id': 'github:test-org',
        },
      },
      spec: {
        type: 'git-repository',
        repository_collection_count: 0,
        repository_ee_count: 0,
      },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityNoCounts],
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const containsCell = screen.getByTestId('cell-no-counts-repo-contains');
    expect(containsCell).toHaveTextContent('—');
  });

  it('displays Never synced when no lastSyncTime', async () => {
    const entityNoSync: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'no-sync-repo',
        title: 'No Sync Repository',
        annotations: {
          'ansible.io/scm-provider': 'github',
          'ansible.io/discovery-source-id': 'github:no-sync',
        },
      },
      spec: { type: 'git-repository' },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityNoSync],
    });

    const syncStatusMap = {
      'github:no-sync': {
        lastSyncTime: null,
        lastFailedSyncTime: null,
      },
    };

    renderTable(syncStatusMap);

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('Never synced')).toBeInTheDocument();
  });

  it('displays dash when no sourceId', async () => {
    const entityNoSourceId: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'no-source-id-repo',
        title: 'No Source ID Repository',
        annotations: {
          'ansible.io/scm-provider': 'github',
        },
      },
      spec: { type: 'git-repository' },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityNoSourceId],
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const lastSyncCell = screen.getByTestId('cell-no-source-id-repo-lastSync');
    expect(lastSyncCell).toHaveTextContent('—');
  });

  it('renders star button and kebab menu in actions column', async () => {
    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const starButtons = screen.getAllByLabelText('Add to favorites');
    expect(starButtons.length).toBeGreaterThan(0);

    const kebabButtons = screen.getAllByLabelText('Actions');
    expect(kebabButtons.length).toBeGreaterThan(0);
  });

  it('toggles star on click', async () => {
    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const starButton = screen.getAllByLabelText('Add to favorites')[0];
    fireEvent.click(starButton);
  });

  it('opens kebab menu on click', async () => {
    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const kebabButton = screen.getAllByLabelText('Actions')[0];
    fireEvent.click(kebabButton);

    await waitFor(() => {
      expect(screen.getByText('View in source')).toBeInTheDocument();
    });
  });

  it('closes kebab menu when clicking View in source', async () => {
    const windowOpenSpy = jest
      .spyOn(globalThis, 'open')
      .mockImplementation(() => null);

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const kebabButton = screen.getAllByLabelText('Actions')[0];
    fireEvent.click(kebabButton);

    await waitFor(() => {
      expect(screen.getByText('View in source')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('View in source'));

    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringMatching(/github\.com|gitlab\.com/),
      '_blank',
      'noopener,noreferrer',
    );

    await waitFor(() => {
      expect(screen.queryByText('View in source')).not.toBeInTheDocument();
    });

    windowOpenSpy.mockRestore();
  });

  it('displays formatted last sync time', async () => {
    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const syncTimes = screen.getAllByText('2 hours ago');
    expect(syncTimes.length).toBeGreaterThan(0);
  });

  it('renders repository name link', async () => {
    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const repoLink = screen.getByText('Repository repo-1');
    expect(repoLink).toBeInTheDocument();
  });

  it('displays source link when URL is available', async () => {
    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const githubLinks = screen.getAllByText('GitHub');
    expect(githubLinks.length).toBeGreaterThan(0);
  });

  it('displays N/A when no last activity', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ workflow_runs: [] }),
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
    });
  });

  it('handles mouse down on star button', async () => {
    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const starButton = screen.getAllByLabelText('Add to favorites')[0];
    fireEvent.mouseDown(starButton);
  });

  it('handles source filter change', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [
        createMockEntity('repo-1', 'github'),
        createMockEntity('repo-2', 'gitlab'),
      ],
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const sourceInput = screen.getByPlaceholderText('Search sources...');
    fireEvent.focus(sourceInput);
    fireEvent.change(sourceInput, { target: { value: 'github' } });
  });

  it('filters by source when source is selected', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [
        createMockEntity('github-repo', 'github'),
        createMockEntity('gitlab-repo', 'gitlab'),
      ],
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const sourceInput = screen.getByPlaceholderText('Search sources...');
    fireEvent.mouseDown(sourceInput);

    await waitFor(() => {
      const githubOption = screen.getByText('github.com');
      fireEvent.click(githubOption);
    });

    expect(screen.getByTestId('table-title')).toHaveTextContent(
      'Git Repositories (1)',
    );
  });

  it('clears source filter when All is selected', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [
        createMockEntity('github-repo', 'github'),
        createMockEntity('gitlab-repo', 'gitlab'),
      ],
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const sourceInput = screen.getByPlaceholderText('Search sources...');
    fireEvent.mouseDown(sourceInput);

    await waitFor(() => {
      const allOption = screen.getAllByText('All')[0];
      fireEvent.click(allOption);
    });

    expect(screen.getByTestId('table-title')).toHaveTextContent(
      'Git Repositories (2)',
    );
  });
});
