import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { Entity } from '@backstage/catalog-model';
import {
  useLatestCIActivity,
  LatestActivityEntry,
} from './useLatestCIActivity';

const theme = createTheme();

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

function mockBatchResponse(
  results: Record<string, { status: number; data: any } | { error: string }>,
) {
  mockFetchApi.fetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ results }),
  });
}

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

  it('fetches GitHub Actions workflow runs via batch endpoint', async () => {
    mockBatchResponse({
      'test-repo': {
        status: 200,
        data: {
          workflow_runs: [
            {
              run_number: 42,
              id: 123,
              name: 'CI Build',
              created_at: '2024-06-15T11:30:00Z',
              html_url: 'https://github.com/my-org/my-repo/actions/runs/123',
            },
          ],
        },
      },
    });

    renderTestConsumer([createGitHubEntity('test-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/ansible/git/ci-activity'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      }),
    );

    expect(screen.getByTestId('activity-test-repo')).toHaveTextContent(
      'CI Build #42 • 30 minutes ago',
    );
  });

  it('returns N/A when GitHub has no workflow runs', async () => {
    mockBatchResponse({
      'empty-repo': {
        status: 200,
        data: { workflow_runs: [] },
      },
    });

    renderTestConsumer([createGitHubEntity('empty-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-empty-repo')).toHaveTextContent('N/A');
  });

  it('handles batch result errors gracefully', async () => {
    mockBatchResponse({
      'error-repo': { error: 'GitHub API error' },
    });

    renderTestConsumer([createGitHubEntity('error-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-error-repo')).toHaveTextContent('N/A');
  });

  it('handles batch endpoint returning non-ok response', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    renderTestConsumer([createGitHubEntity('server-error-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-server-error-repo')).toHaveTextContent(
      'N/A',
    );
  });

  it('fetches GitLab pipelines via batch endpoint', async () => {
    mockBatchResponse({
      'gitlab-repo': {
        status: 200,
        data: [
          {
            id: 99,
            created_at: '2024-06-15T10:00:00Z',
            web_url: 'https://gitlab.com/my-group/my-project/pipelines/99',
          },
        ],
      },
    });

    renderTestConsumer([createGitLabEntity('gitlab-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/ansible/git/ci-activity'),
      expect.objectContaining({ method: 'POST' }),
    );

    expect(screen.getByTestId('activity-gitlab-repo')).toHaveTextContent(
      'Pipeline #99 • 2 hours ago',
    );
  });

  it('returns N/A when GitLab has no pipelines', async () => {
    mockBatchResponse({
      'empty-gitlab': { status: 200, data: [] },
    });

    renderTestConsumer([createGitLabEntity('empty-gitlab')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-empty-gitlab')).toHaveTextContent(
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

  it('handles mixed GitHub and GitLab entities in single batch', async () => {
    mockBatchResponse({
      'github-repo': {
        status: 200,
        data: {
          workflow_runs: [
            {
              run_number: 10,
              id: 100,
              name: 'Test',
              created_at: '2024-06-15T11:00:00Z',
              html_url: 'https://github.com/org/repo/actions/runs/100',
            },
          ],
        },
      },
      'gitlab-repo': {
        status: 200,
        data: [
          {
            id: 20,
            created_at: '2024-06-15T11:00:00Z',
            web_url: 'https://gitlab.com/group/project/pipelines/20',
          },
        ],
      },
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
    expect(mockFetchApi.fetch).toHaveBeenCalledTimes(1);
  });

  it('uses default workflow name when not provided', async () => {
    mockBatchResponse({
      'no-name-repo': {
        status: 200,
        data: {
          workflow_runs: [
            {
              run_number: 5,
              id: 50,
              name: null,
              created_at: '2024-06-15T11:00:00Z',
              html_url: null,
            },
          ],
        },
      },
    });

    renderTestConsumer([createGitHubEntity('no-name-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-no-name-repo')).toHaveTextContent(
      'Workflow #5',
    );
  });

  it('handles fetch throwing an exception', async () => {
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

    mockBatchResponse({
      'gitlab-no-url': {
        status: 200,
        data: [
          {
            id: 77,
            created_at: '2024-06-15T11:00:00Z',
            web_url: 'https://gitlab.com/my-group/my-project/pipelines/77',
          },
        ],
      },
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
    mockBatchResponse({
      'id-fallback-repo': {
        status: 200,
        data: {
          workflow_runs: [
            {
              id: 999,
              name: 'Deploy',
              created_at: '2024-06-15T11:00:00Z',
              html_url: 'https://github.com/org/repo/actions/runs/999',
            },
          ],
        },
      },
    });

    renderTestConsumer([createGitHubEntity('id-fallback-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-id-fallback-repo')).toHaveTextContent(
      'Deploy #999',
    );
  });

  it('retries on 502 error and succeeds on second attempt', async () => {
    let callCount = 0;
    mockFetchApi.fetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 502 });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            results: {
              'retry-success-repo': {
                status: 200,
                data: [
                  {
                    id: 42,
                    created_at: '2024-06-15T11:00:00Z',
                    web_url: 'https://gitlab.com/group/project/pipelines/42',
                  },
                ],
              },
            },
          }),
      });
    });

    renderTestConsumer([createGitLabEntity('retry-success-repo')]);

    await waitFor(
      () => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      },
      { timeout: 3000 },
    );

    expect(screen.getByTestId('activity-retry-success-repo')).toHaveTextContent(
      'Pipeline #42',
    );
    expect(callCount).toBeGreaterThan(1);
  });

  it('returns N/A after exhausting retries on 502 error', async () => {
    mockFetchApi.fetch.mockResolvedValue({ ok: false, status: 502 });

    renderTestConsumer([createGitLabEntity('retry-exhausted-repo')]);

    await waitFor(
      () => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      },
      { timeout: 5000 },
    );

    expect(
      screen.getByTestId('activity-retry-exhausted-repo'),
    ).toHaveTextContent('N/A');
  });

  it('cancels pending request on unmount', async () => {
    let fetchCallCount = 0;
    mockFetchApi.fetch.mockImplementation(() => {
      fetchCallCount++;
      return new Promise(resolve => {
        setTimeout(
          () =>
            resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  results: {
                    'cancel-repo': { status: 200, data: [] },
                  },
                }),
            }),
          500,
        );
      });
    });

    const { unmount } = renderTestConsumer([createGitLabEntity('cancel-repo')]);

    unmount();

    await jest.advanceTimersByTimeAsync(100);

    expect(fetchCallCount).toBeLessThanOrEqual(1);
  });

  it('handles JSON parse error from batch response', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('JSON parse error')),
    });

    renderTestConsumer([createGitLabEntity('json-error-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-json-error-repo')).toHaveTextContent(
      'N/A',
    );
  });

  it('does not update state when cancelled after fetch completes', async () => {
    let resolvePromise: (value: unknown) => void;
    const fetchPromise = new Promise(resolve => {
      resolvePromise = resolve;
    });

    mockFetchApi.fetch.mockImplementation(() => fetchPromise);

    const { unmount } = renderTestConsumer([createGitLabEntity('late-cancel')]);

    await jest.advanceTimersByTimeAsync(50);

    unmount();

    resolvePromise!({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            'late-cancel': {
              status: 200,
              data: [{ id: 123, created_at: '2024-06-15T11:00:00Z' }],
            },
          },
        }),
    });

    await jest.advanceTimersByTimeAsync(100);

    expect(mockFetchApi.fetch).toHaveBeenCalledTimes(1);
  });

  it('sends single batch request for all entities', async () => {
    mockBatchResponse({
      'repo-1': {
        status: 200,
        data: {
          workflow_runs: [
            {
              id: 1,
              run_number: 1,
              name: 'CI',
              created_at: '2024-06-15T11:00:00Z',
            },
          ],
        },
      },
      'repo-2': {
        status: 200,
        data: [{ id: 2, created_at: '2024-06-15T11:00:00Z' }],
      },
    });

    renderTestConsumer([
      createGitHubEntity('repo-1'),
      createGitLabEntity('repo-2'),
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(mockFetchApi.fetch).toHaveBeenCalledTimes(1);

    const body = JSON.parse(
      (mockFetchApi.fetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.items).toHaveLength(2);
    expect(body.items[0].provider).toBe('github');
    expect(body.items[1].provider).toBe('gitlab');
  });
});
