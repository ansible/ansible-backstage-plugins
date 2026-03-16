import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { githubActionsApiRef } from '@backstage-community/plugin-github-actions';
import { Entity } from '@backstage/catalog-model';
import { RepositoryDetailsPage } from './RepositoryDetailsPage';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({ repositoryName: 'test-repo' }),
}));

jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: () => ({ allowed: true }),
}));

const theme = createTheme();

const mockCatalogApi = {
  getEntities: jest.fn(),
};

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};

const mockFetchApi = {
  fetch: jest.fn(),
};

const mockGithubActionsApi = {
  listWorkflowRuns: jest.fn().mockResolvedValue({ workflow_runs: [] }),
};

const mockIdentityApi = {
  getCredentials: jest.fn().mockResolvedValue({ token: 'mock-token' }),
};

const createMockEntity = (): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test-repo',
    title: 'Test Repository',
    description: 'A test repository description',
    annotations: {
      'ansible.io/scm-provider': 'github',
      'ansible.io/scm-host': 'github.com',
      'ansible.io/scm-organization': 'test-org',
      'ansible.io/scm-repository': 'test-repo',
      'backstage.io/source-location':
        'url:https://github.com/test-org/test-repo',
    },
  },
  spec: {
    type: 'git-repository',
    repository_name: 'test-repo',
    repository_default_branch: 'main',
    repository_collection_count: 3,
    repository_ee_count: 1,
  },
});

jest.mock('./RepositoriesCIActivityTab', () => ({
  RepositoriesCIActivityTab: ({
    filterByEntity,
  }: {
    filterByEntity?: Entity;
  }) => (
    <div data-testid="ci-activity-tab">
      CI Activity for {filterByEntity?.metadata?.name ?? 'unknown'}
    </div>
  ),
}));

jest.mock('../CollectionsCatalog/CollectionsListPage', () => ({
  CollectionsListPage: ({
    filterByRepositoryEntity,
  }: {
    filterByRepositoryEntity?: Entity;
  }) => (
    <div data-testid="collections-list">
      Collections for {filterByRepositoryEntity?.metadata?.name ?? 'unknown'}
    </div>
  ),
}));

describe('RepositoryDetailsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [createMockEntity()],
    });
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Test README\n\nThis is a test.'),
    });
  });

  const renderPage = async () => {
    return renderInTestApp(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
          [githubActionsApiRef, mockGithubActionsApi],
          [identityApiRef, mockIdentityApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <RepositoryDetailsPage />
        </ThemeProvider>
      </TestApiProvider>,
    );
  };

  it('renders loading state initially', async () => {
    mockCatalogApi.getEntities.mockImplementation(() => new Promise(() => {}));

    await renderPage();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders repository details when entity is found', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('test-repo').length).toBeGreaterThan(0);
    });

    expect(
      screen.getAllByText('A test repository description').length,
    ).toBeGreaterThan(0);
  });

  it('renders breadcrumbs with repository name', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Repositories')).toBeInTheDocument();
    });

    expect(screen.getAllByText('test-repo').length).toBeGreaterThan(0);
  });

  it('renders tabs for Overview, CI Activity, and Collections', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });

    expect(screen.getByText('CI Activity')).toBeInTheDocument();
    expect(screen.getByText('Collections')).toBeInTheDocument();
  });

  it('renders Overview tab by default', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('README')).toBeInTheDocument();
    });

    expect(screen.getByText('About')).toBeInTheDocument();
  });

  it('switches to CI Activity tab when clicked', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('CI Activity')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('CI Activity'));

    await waitFor(() => {
      expect(screen.getByTestId('ci-activity-tab')).toBeInTheDocument();
    });
  });

  it('switches to Collections tab when clicked', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Collections')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Collections'));

    await waitFor(() => {
      expect(screen.getByTestId('collections-list')).toBeInTheDocument();
    });
  });

  it('renders View in source button when source URL exists', async () => {
    await renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /View in source/i }),
      ).toBeInTheDocument();
    });
  });

  it('navigates to catalog when breadcrumb is clicked', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Repositories')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Repositories'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/self-service/repositories/catalog',
    );
  });

  it('renders empty state when entity is not found', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({ items: [] });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Repositories')).toBeInTheDocument();
    });
  });

  it('fetches entity with correct filter', async () => {
    await renderPage();

    await waitFor(() => {
      expect(mockCatalogApi.getEntities).toHaveBeenCalledWith({
        filter: [
          {
            'metadata.name': 'test-repo',
            kind: 'Component',
            'spec.type': 'git-repository',
          },
        ],
      });
    });
  });

  it('fetches README from backend', async () => {
    await renderPage();

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/git_file_content'),
      );
    });
  });

  it('handles catalog API errors gracefully', async () => {
    mockCatalogApi.getEntities.mockRejectedValue(new Error('API Error'));

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Repositories')).toBeInTheDocument();
    });
  });

  it('displays repository name from spec when available', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('test-repo').length).toBeGreaterThan(0);
    });
  });

  it('uses metadata.title as fallback display name', async () => {
    const entityWithoutSpecName = createMockEntity();
    delete (entityWithoutSpecName.spec as Record<string, unknown>)
      .repository_name;

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityWithoutSpecName],
    });

    await renderPage();

    await waitFor(() => {
      const titleElements = screen.getAllByText('Test Repository');
      expect(titleElements.length).toBeGreaterThan(0);
    });
  });

  it('renders About card with repository details', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });

    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Default branch')).toBeInTheDocument();
    expect(screen.getByText('Contains')).toBeInTheDocument();
  });

  it('handles backend README fetch failure gracefully', async () => {
    mockFetchApi.fetch.mockRejectedValueOnce(new Error('Network error'));

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('README')).toBeInTheDocument();
    });
  });

  it('fetches README directly from GitHub when backend not available', async () => {
    const entityWithoutBackendSupport: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-repo',
        title: 'Test Repository',
        annotations: {
          'backstage.io/source-location':
            'url:https://github.com/test-org/test-repo',
        },
      },
      spec: {
        type: 'git-repository',
        repository_default_branch: 'main',
      },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityWithoutBackendSupport],
    });

    const mockGlobalFetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Direct README'),
    } as Response);

    await renderPage();

    await waitFor(() => {
      expect(mockGlobalFetch).toHaveBeenCalledWith(
        expect.stringContaining('raw.githubusercontent.com'),
      );
    });

    mockGlobalFetch.mockRestore();
  });

  it('fetches README directly from GitLab when backend not available', async () => {
    const gitlabEntity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-repo',
        title: 'Test Repository',
        annotations: {
          'backstage.io/source-location':
            'url:https://gitlab.com/test-group/test-project',
        },
      },
      spec: {
        type: 'git-repository',
        repository_default_branch: 'main',
      },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [gitlabEntity],
    });

    const mockGlobalFetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# GitLab README'),
    } as Response);

    await renderPage();

    await waitFor(() => {
      expect(mockGlobalFetch).toHaveBeenCalledWith(
        expect.stringContaining('gitlab.com'),
      );
    });

    mockGlobalFetch.mockRestore();
  });

  it('handles entity without source URL', async () => {
    const entityNoSource: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-repo',
        title: 'Test Repository',
        annotations: {},
      },
      spec: {
        type: 'git-repository',
      },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityNoSource],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('README')).toBeInTheDocument();
    });
  });

  it('handles unsupported SCM provider for direct fetch', async () => {
    const bitbucketEntity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-repo',
        title: 'Test Repository',
        annotations: {
          'backstage.io/source-location':
            'url:https://bitbucket.org/test-org/test-repo',
        },
      },
      spec: {
        type: 'git-repository',
        repository_default_branch: 'main',
      },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [bitbucketEntity],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('README')).toBeInTheDocument();
    });
  });

  it('handles direct README fetch failure', async () => {
    const entityWithoutBackendSupport: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-repo',
        title: 'Test Repository',
        annotations: {
          'backstage.io/source-location':
            'url:https://github.com/test-org/test-repo',
        },
      },
      spec: {
        type: 'git-repository',
        repository_default_branch: 'main',
      },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityWithoutBackendSupport],
    });

    const mockGlobalFetch = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Fetch failed'));

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('README')).toBeInTheDocument();
    });

    mockGlobalFetch.mockRestore();
  });

  it('handles non-ok response from direct README fetch', async () => {
    const entityWithoutBackendSupport: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-repo',
        title: 'Test Repository',
        annotations: {
          'backstage.io/source-location':
            'url:https://github.com/test-org/test-repo',
        },
      },
      spec: {
        type: 'git-repository',
        repository_default_branch: 'main',
      },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityWithoutBackendSupport],
    });

    const mockGlobalFetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve(''),
    } as Response);

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('README')).toBeInTheDocument();
    });

    mockGlobalFetch.mockRestore();
  });

  it('opens source URL in new tab when View in source is clicked', async () => {
    const mockOpen = jest
      .spyOn(globalThis, 'open')
      .mockImplementation(() => null);

    await renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /View in source/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /View in source/i }));

    expect(mockOpen).toHaveBeenCalledWith(
      'https://github.com/test-org/test-repo',
      '_blank',
    );

    mockOpen.mockRestore();
  });

  it('does not render View in source button when no source URL', async () => {
    const entityNoSource: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-repo',
        title: 'Test Repository',
        annotations: {},
      },
      spec: {
        type: 'git-repository',
      },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityNoSource],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('README')).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', { name: /View in source/i }),
    ).not.toBeInTheDocument();
  });

  it('navigates to Collections tab from About card', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });

    const collectionsLink = screen.getByText('3 collections');
    fireEvent.click(collectionsLink);

    await waitFor(() => {
      expect(screen.getByTestId('collections-list')).toBeInTheDocument();
    });
  });

  it('handles invalid source URL gracefully', async () => {
    const entityInvalidUrl: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-repo',
        title: 'Test Repository',
        annotations: {
          'backstage.io/source-location': 'invalid-url-format',
        },
      },
      spec: {
        type: 'git-repository',
        repository_default_branch: 'main',
      },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityInvalidUrl],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('README')).toBeInTheDocument();
    });
  });
});
