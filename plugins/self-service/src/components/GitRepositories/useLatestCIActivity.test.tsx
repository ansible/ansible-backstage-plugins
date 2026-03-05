import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { githubActionsApiRef } from '@backstage-community/plugin-github-actions';
import { Entity } from '@backstage/catalog-model';
import {
  useLatestCIActivity,
  LatestActivityEntry,
} from './useLatestCIActivity';

const theme = createTheme();

const mockGithubActionsApi = {
  listWorkflowRuns: jest.fn(),
};

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('https://backstage.io/api/catalog'),
};

const mockFetchApi = {
  fetch: jest.fn(),
};

interface TestConsumerProps {
  readonly entities: Entity[];
}

function TestConsumer({ entities }: TestConsumerProps) {
  const { lastActivityMap, loading } = useLatestCIActivity(entities);
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="map">{JSON.stringify(lastActivityMap)}</span>
      {Object.entries(lastActivityMap).map(
        ([name, entry]: [string, LatestActivityEntry]) => (
          <div key={name} data-testid={`activity-${name}`}>
            {entry.text}
          </div>
        ),
      )}
    </div>
  );
}

function renderTestConsumer(entities: Entity[]) {
  return render(
    <ThemeProvider theme={theme}>
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
          [githubActionsApiRef, mockGithubActionsApi],
        ]}
      >
        <TestConsumer entities={entities} />
      </TestApiProvider>
    </ThemeProvider>,
  );
}

const createGitHubEntity = (name: string): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name,
    annotations: {
      'ansible.io/scm-provider': 'github',
      'ansible.io/scm-organization': 'my-org',
      'ansible.io/scm-repository': 'my-repo',
    },
  },
  spec: {},
});

const createGitLabEntity = (name: string): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name,
    annotations: {
      'ansible.io/scm-provider': 'gitlab',
      'ansible.io/scm-organization': 'my-group',
      'ansible.io/scm-repository': 'my-project',
      'backstage.io/source-location':
        'url:https://gitlab.com/my-group/my-project',
    },
  },
  spec: {},
});

describe('useLatestCIActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns empty map and loading false for empty entities array', async () => {
    renderTestConsumer([]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('map')).toHaveTextContent('{}');
  });

  it('fetches GitHub Actions workflow runs for GitHub entities', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          run_number: 42,
          id: 123,
          name: 'CI Build',
          created_at: '2024-06-15T11:30:00Z',
          html_url: 'https://github.com/my-org/my-repo/actions/runs/123',
        },
      ],
    });

    renderTestConsumer([createGitHubEntity('test-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(mockGithubActionsApi.listWorkflowRuns).toHaveBeenCalledWith({
      owner: 'my-org',
      repo: 'my-repo',
      pageSize: 1,
    });

    expect(screen.getByTestId('activity-test-repo')).toHaveTextContent(
      'CI Build #42 • 30 minutes ago',
    );
  });

  it('returns N/A when GitHub has no workflow runs', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [],
    });

    renderTestConsumer([createGitHubEntity('empty-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-empty-repo')).toHaveTextContent('N/A');
  });

  it('handles GitHub API errors gracefully', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockRejectedValue(
      new Error('API Error'),
    );

    renderTestConsumer([createGitHubEntity('error-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-error-repo')).toHaveTextContent('N/A');
  });

  it('fetches GitLab pipelines for GitLab entities', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 99,
            created_at: '2024-06-15T10:00:00Z',
            web_url: 'https://gitlab.com/my-group/my-project/pipelines/99',
          },
        ]),
    });

    renderTestConsumer([createGitLabEntity('gitlab-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/ansible/gitlab/pipelines'),
      expect.objectContaining({ credentials: 'include' }),
    );

    expect(screen.getByTestId('activity-gitlab-repo')).toHaveTextContent(
      'Pipeline #99 • 2 hours ago',
    );
  });

  it('returns N/A when GitLab has no pipelines', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    renderTestConsumer([createGitLabEntity('empty-gitlab')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-empty-gitlab')).toHaveTextContent(
      'N/A',
    );
  });

  it('handles GitLab API errors gracefully', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    renderTestConsumer([createGitLabEntity('error-gitlab')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-error-gitlab')).toHaveTextContent(
      'N/A',
    );
  });

  it('handles entities that are neither GitHub nor GitLab', async () => {
    const otherEntity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'other-repo',
        annotations: {
          'ansible.io/scm-provider': 'bitbucket',
        },
      },
      spec: {},
    };

    renderTestConsumer([otherEntity]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-other-repo')).toHaveTextContent('N/A');
  });

  it('handles mixed GitHub and GitLab entities', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          run_number: 10,
          id: 100,
          name: 'Test',
          created_at: '2024-06-15T11:00:00Z',
          html_url: 'https://github.com/org/repo/actions/runs/100',
        },
      ],
    });

    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 20,
            created_at: '2024-06-15T11:00:00Z',
            web_url: 'https://gitlab.com/group/project/pipelines/20',
          },
        ]),
    });

    renderTestConsumer([
      createGitHubEntity('github-repo'),
      createGitLabEntity('gitlab-repo'),
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-github-repo')).toBeInTheDocument();
    expect(screen.getByTestId('activity-gitlab-repo')).toBeInTheDocument();
  });

  it('uses default workflow name when not provided', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          run_number: 5,
          id: 50,
          name: null,
          created_at: '2024-06-15T11:00:00Z',
          html_url: null,
        },
      ],
    });

    renderTestConsumer([createGitHubEntity('no-name-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-no-name-repo')).toHaveTextContent(
      'Workflow #5',
    );
  });

  it('handles GitLab fetch throwing an exception', async () => {
    mockFetchApi.fetch.mockRejectedValue(new Error('Network error'));

    renderTestConsumer([createGitLabEntity('fetch-error-gitlab')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-fetch-error-gitlab')).toHaveTextContent(
      'N/A',
    );
  });

  it('handles GitLab entity without source location URL', async () => {
    const gitlabEntityNoUrl: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'gitlab-no-url',
        annotations: {
          'ansible.io/scm-provider': 'gitlab',
          'ansible.io/scm-organization': 'my-group',
          'ansible.io/scm-repository': 'my-project',
        },
      },
      spec: {},
    };

    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 77,
            created_at: '2024-06-15T11:00:00Z',
            web_url: 'https://gitlab.com/my-group/my-project/pipelines/77',
          },
        ]),
    });

    renderTestConsumer([gitlabEntityNoUrl]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-gitlab-no-url')).toHaveTextContent(
      'Pipeline #77',
    );
  });

  it('uses id as run number fallback for GitHub workflow', async () => {
    mockGithubActionsApi.listWorkflowRuns.mockResolvedValue({
      workflow_runs: [
        {
          id: 999,
          name: 'Deploy',
          created_at: '2024-06-15T11:00:00Z',
          html_url: 'https://github.com/org/repo/actions/runs/999',
        },
      ],
    });

    renderTestConsumer([createGitHubEntity('id-fallback-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-id-fallback-repo')).toHaveTextContent(
      'Deploy #999',
    );
  });
});
