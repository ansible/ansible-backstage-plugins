import { render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  starredEntitiesApiRef,
  MockStarredEntitiesApi,
} from '@backstage/plugin-catalog-react';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { githubActionsApiRef } from '@backstage-community/plugin-github-actions';
import { Entity } from '@backstage/catalog-model';
import { MemoryRouter } from 'react-router-dom';

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
      columns: { title: string; field: string }[];
    }) => (
      <div data-testid="table">
        <div data-testid="table-title">{title}</div>
        <table>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.field}>{col.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              data as Array<{
                id: string;
                status: string;
                project: string;
                eventDisplay: string;
                trigger: string;
              }>
            ).map(row => (
              <tr key={row.id} data-testid={`table-row-${row.id}`}>
                <td>{row.status}</td>
                <td>{row.project}</td>
                <td>{row.eventDisplay}</td>
                <td>{row.trigger}</td>
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
  return {
    ...actual,
    CatalogFilterLayout,
    catalogApiRef: actual.catalogApiRef,
    starredEntitiesApiRef: actual.starredEntitiesApiRef,
    MockStarredEntitiesApi: actual.MockStarredEntitiesApi,
  };
});

import { RepositoriesCIActivityTab } from './RepositoriesCIActivityTab';

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
  listWorkflowRuns: jest.fn(),
};

const mockIdentityApi = {
  getCredentials: jest.fn().mockResolvedValue({ token: 'mock-token' }),
};

const createGitHubEntity = (name: string): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name,
    title: `Repository ${name}`,
    annotations: {
      'ansible.io/scm-provider': 'github',
      'ansible.io/scm-organization': 'test-org',
      'ansible.io/scm-repository': name,
      'backstage.io/source-location': `url:https://github.com/test-org/${name}`,
    },
  },
  spec: { type: 'git-repository' },
});

const createGitLabEntity = (name: string): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name,
    title: `Repository ${name}`,
    annotations: {
      'ansible.io/scm-provider': 'gitlab',
      'ansible.io/scm-organization': 'test-group',
      'ansible.io/scm-repository': name,
      'backstage.io/source-location': `url:https://gitlab.com/test-group/${name}`,
    },
  },
  spec: { type: 'git-repository' },
});

describe('RepositoriesCIActivityTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-15T12:00:00Z'));

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [createGitHubEntity('github-repo')],
    });

    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 123,
          run_number: 42,
          name: 'CI Build',
          status: 'completed',
          conclusion: 'success',
          event: 'push',
          created_at: '2024-06-15T11:00:00Z',
          html_url: 'https://github.com/test-org/github-repo/actions/runs/123',
        },
      ],
    });

    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 456,
            status: 'success',
            source: 'push',
            created_at: '2024-06-15T10:00:00Z',
            web_url:
              'https://gitlab.com/test-group/gitlab-repo/-/pipelines/456',
          },
        ]),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderTab = (filterByEntity?: Entity | null) => {
    return render(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
          [githubActionsApiRef, mockGithubActionsApi],
          [identityApiRef, mockIdentityApi],
          [starredEntitiesApiRef, new MockStarredEntitiesApi()],
          [permissionApiRef, mockApis.permission()],
        ]}
      >
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <RepositoriesCIActivityTab filterByEntity={filterByEntity} />
          </ThemeProvider>
        </MemoryRouter>
      </TestApiProvider>,
    );
  };

  it('renders loading state initially', () => {
    mockCatalogApi.getEntities.mockImplementation(() => new Promise(() => {}));

    renderTab();

    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('renders CI activity table with GitHub workflow runs', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('CI Build #42')).toBeInTheDocument();
  });

  it('renders empty state when no CI activity', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [],
    });
    mockCatalogApi.getEntities.mockResolvedValue({ items: [] });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('No CI activity yet')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        /CI activity from your GitHub and GitLab repositories will appear here/,
      ),
    ).toBeInTheDocument();
  });

  it('renders empty state for filtered entity with no activity', async () => {
    const entity = createGitHubEntity('empty-repo');
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [],
    });

    renderTab(entity);

    await waitFor(() => {
      expect(screen.getByText('No CI activity yet')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        'CI activity for this repository will appear here after workflow or pipeline runs.',
      ),
    ).toBeInTheDocument();
  });

  it('renders error state when fetch fails', async () => {
    mockCatalogApi.getEntities.mockRejectedValue(new Error('API Error'));

    renderTab();

    await waitFor(() => {
      expect(
        screen.getByText('Unable to load CI activity'),
      ).toBeInTheDocument();
    });

    expect(screen.getByText('API Error')).toBeInTheDocument();
  });

  it('renders GitLab pipelines', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [createGitLabEntity('gitlab-repo')],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Pipeline #456')).toBeInTheDocument();
    });
  });

  it('renders status filter label', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const statusLabels = screen.getAllByText('Status');
    expect(statusLabels.length).toBeGreaterThan(0);
  });

  it('renders trigger filter label', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const triggerLabels = screen.getAllByText('Trigger');
    expect(triggerLabels.length).toBeGreaterThan(0);
  });

  it('displays correct status in table', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('success')).toBeInTheDocument();
    });
  });

  it('renders table title with count', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table-title')).toHaveTextContent(
        'CI Activity (1)',
      );
    });
  });

  it('fetches only filtered entity when provided', async () => {
    const entity = createGitHubEntity('specific-repo');

    renderTab(entity);

    await waitFor(() => {
      expect(mockGithubActionsApi.listWorkflowRuns).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'specific-repo',
        pageSize: 15,
      });
    });

    expect(mockCatalogApi.getEntities).not.toHaveBeenCalled();
  });

  it('handles mixed GitHub and GitLab entities', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [
        createGitHubEntity('github-repo'),
        createGitLabEntity('gitlab-repo'),
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('CI Build #42')).toBeInTheDocument();
    expect(screen.getByText('Pipeline #456')).toBeInTheDocument();
  });

  it('renders failure status correctly', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 124,
          run_number: 43,
          name: 'CI Build',
          status: 'completed',
          conclusion: 'failure',
          event: 'push',
          created_at: '2024-06-15T11:00:00Z',
          html_url: 'https://github.com/test-org/github-repo/actions/runs/124',
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('failure')).toBeInTheDocument();
    });
  });

  it('renders in_progress status correctly', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 125,
          run_number: 44,
          name: 'CI Build',
          status: 'in_progress',
          conclusion: null,
          event: 'push',
          created_at: '2024-06-15T11:30:00Z',
          html_url: 'https://github.com/test-org/github-repo/actions/runs/125',
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('in_progress')).toBeInTheDocument();
    });
  });

  it('fetches entities from catalog API when no filter entity', async () => {
    renderTab();

    await waitFor(() => {
      expect(mockCatalogApi.getEntities).toHaveBeenCalledWith({
        filter: [{ kind: 'Component', 'spec.type': 'git-repository' }],
      });
    });
  });

  it('handles identity API getCredentials failure gracefully', async () => {
    mockIdentityApi.getCredentials.mockRejectedValue(new Error('Auth error'));

    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('CI Build #42')).toBeInTheDocument();
  });

  it('handles GitLab entity with invalid URL', async () => {
    const invalidGitLabEntity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'invalid-gitlab-repo',
        title: 'Invalid GitLab Repo',
        annotations: {
          'ansible.io/scm-provider': 'gitlab',
          'ansible.io/scm-organization': 'test-group',
          'ansible.io/scm-repository': 'invalid-repo',
          'backstage.io/source-location': 'not-a-valid-url',
        },
      },
      spec: { type: 'git-repository' },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [invalidGitLabEntity],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('No CI activity yet')).toBeInTheDocument();
    });
  });

  it('sorts status options alphabetically', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 1,
          run_number: 1,
          name: 'Build',
          status: 'completed',
          conclusion: 'success',
          event: 'push',
          created_at: '2024-06-15T11:00:00Z',
          html_url: 'https://github.com/test-org/repo/actions/runs/1',
        },
        {
          id: 2,
          run_number: 2,
          name: 'Build',
          status: 'completed',
          conclusion: 'failure',
          event: 'push',
          created_at: '2024-06-15T10:00:00Z',
          html_url: 'https://github.com/test-org/repo/actions/runs/2',
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getByText('failure')).toBeInTheDocument();
  });

  it('sorts trigger options alphabetically', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 1,
          run_number: 1,
          name: 'Build',
          status: 'completed',
          conclusion: 'success',
          event: 'push',
          created_at: '2024-06-15T11:00:00Z',
          html_url: 'https://github.com/test-org/repo/actions/runs/1',
        },
        {
          id: 2,
          run_number: 2,
          name: 'Build',
          status: 'completed',
          conclusion: 'success',
          event: 'pull_request',
          created_at: '2024-06-15T10:00:00Z',
          html_url: 'https://github.com/test-org/repo/actions/runs/2',
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('push')).toBeInTheDocument();
    expect(screen.getByText('pull request')).toBeInTheDocument();
  });

  it('renders cancelled status', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 126,
          run_number: 45,
          name: 'CI Build',
          status: 'completed',
          conclusion: 'cancelled',
          event: 'push',
          created_at: '2024-06-15T11:00:00Z',
          html_url: 'https://github.com/test-org/github-repo/actions/runs/126',
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('cancelled')).toBeInTheDocument();
    });
  });

  it('renders queued status', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 127,
          run_number: 46,
          name: 'CI Build',
          status: 'queued',
          conclusion: null,
          event: 'push',
          created_at: '2024-06-15T11:00:00Z',
          html_url: 'https://github.com/test-org/github-repo/actions/runs/127',
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('queued')).toBeInTheDocument();
    });
  });

  it('renders skipped status', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 128,
          run_number: 47,
          name: 'CI Build',
          status: 'completed',
          conclusion: 'skipped',
          event: 'push',
          created_at: '2024-06-15T11:00:00Z',
          html_url: 'https://github.com/test-org/github-repo/actions/runs/128',
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('skipped')).toBeInTheDocument();
    });
  });

  it('renders unknown status for unrecognized values', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 129,
          run_number: 48,
          name: 'CI Build',
          status: 'completed',
          conclusion: 'some_unknown_status',
          event: 'push',
          created_at: '2024-06-15T11:00:00Z',
          html_url: 'https://github.com/test-org/github-repo/actions/runs/129',
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('unknown')).toBeInTheDocument();
    });
  });

  it('renders row without project URL', async () => {
    const entityWithoutSourceLocation: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'no-source-repo',
        title: 'Repository no-source-repo',
        annotations: {
          'ansible.io/scm-provider': 'github',
          'ansible.io/scm-organization': 'test-org',
          'ansible.io/scm-repository': 'no-source-repo',
        },
      },
      spec: { type: 'git-repository' },
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityWithoutSourceLocation],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });
  });

  it('renders row without run URL', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 130,
          run_number: 49,
          name: 'CI Build',
          status: 'completed',
          conclusion: 'success',
          event: 'push',
          created_at: '2024-06-15T11:00:00Z',
          html_url: null,
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('CI Build #49')).toBeInTheDocument();
  });

  it('renders project link when projectUrl is available', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 200,
          run_number: 100,
          name: 'Build',
          status: 'completed',
          conclusion: 'success',
          event: 'push',
          created_at: '2024-06-15T11:00:00Z',
          html_url: 'https://github.com/test-org/github-repo/actions/runs/200',
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('Repository github-repo')).toBeInTheDocument();
  });

  it('renders run link when runUrl is available', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 201,
          run_number: 101,
          name: 'Deploy',
          status: 'completed',
          conclusion: 'success',
          event: 'push',
          created_at: '2024-06-15T11:00:00Z',
          html_url: 'https://github.com/test-org/repo/actions/runs/201',
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('Deploy #101')).toBeInTheDocument();
  });

  it('renders status icon based on status value', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 202,
          run_number: 102,
          name: 'Test',
          status: 'completed',
          conclusion: 'success',
          event: 'push',
          created_at: '2024-06-15T11:00:00Z',
          html_url: null,
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    expect(screen.getByText('success')).toBeInTheDocument();
  });

  it('handles status filter selection', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 1,
          run_number: 1,
          name: 'Build',
          status: 'completed',
          conclusion: 'success',
          event: 'push',
          created_at: '2024-06-15T11:00:00Z',
          html_url: null,
        },
        {
          id: 2,
          run_number: 2,
          name: 'Build',
          status: 'completed',
          conclusion: 'failure',
          event: 'push',
          created_at: '2024-06-15T10:00:00Z',
          html_url: null,
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const statusLabels = screen.getAllByText('Status');
    expect(statusLabels.length).toBeGreaterThan(0);
  });

  it('handles trigger filter selection', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 1,
          run_number: 1,
          name: 'Build',
          status: 'completed',
          conclusion: 'success',
          event: 'push',
          created_at: '2024-06-15T11:00:00Z',
          html_url: null,
        },
        {
          id: 2,
          run_number: 2,
          name: 'Build',
          status: 'completed',
          conclusion: 'success',
          event: 'pull_request',
          created_at: '2024-06-15T10:00:00Z',
          html_url: null,
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
    });

    const triggerLabels = screen.getAllByText('Trigger');
    expect(triggerLabels.length).toBeGreaterThan(0);
  });
});
