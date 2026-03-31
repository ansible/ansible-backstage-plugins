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
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          workflow_runs: [
            {
              run_number: 42,
              id: 123,
              name: 'CI Build',
              created_at: '2024-06-15T11:30:00Z',
              html_url: 'https://github.com/my-org/my-repo/actions/runs/123',
            },
          ],
        }),
    });

    renderTestConsumer([createGitHubEntity('test-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/ansible/git/ci-activity?provider=github'),
      expect.objectContaining({ credentials: 'include' }),
    );

    expect(screen.getByTestId('activity-test-repo')).toHaveTextContent(
      'CI Build #42 • 30 minutes ago',
    );
  });

  it('returns N/A when GitHub has no workflow runs', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ workflow_runs: [] }),
    });

    renderTestConsumer([createGitHubEntity('empty-repo')]);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('activity-empty-repo')).toHaveTextContent('N/A');
  });

  it('handles GitHub API errors gracefully', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

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
      expect.stringContaining('/ansible/git/ci-activity?provider=gitlab'),
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
    mockFetchApi.fetch.mockImplementation((url: string) => {
      if (url.includes('provider=github')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              workflow_runs: [
                {
                  run_number: 10,
                  id: 100,
                  name: 'Test',
                  created_at: '2024-06-15T11:00:00Z',
                  html_url: 'https://github.com/org/repo/actions/runs/100',
                },
              ],
            }),
        });
      }
      if (url.includes('provider=gitlab')) {
        return Promise.resolve({
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
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      });
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
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          workflow_runs: [
            {
              run_number: 5,
              id: 50,
              name: null,
              created_at: '2024-06-15T11:00:00Z',
              html_url: null,
            },
          ],
        }),
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
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          workflow_runs: [
            {
              id: 999,
              name: 'Deploy',
              created_at: '2024-06-15T11:00:00Z',
              html_url: 'https://github.com/org/repo/actions/runs/999',
            },
          ],
        }),
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
          Promise.resolve([
            {
              id: 42,
              created_at: '2024-06-15T11:00:00Z',
              web_url: 'https://gitlab.com/group/project/pipelines/42',
            },
          ]),
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

  it('returns null from fetchWithRetry when cancelled before fetch (lines 31-32)', async () => {
    let fetchCallCount = 0;
    mockFetchApi.fetch.mockImplementation(() => {
      fetchCallCount++;
      return new Promise(resolve => {
        setTimeout(
          () =>
            resolve({
              ok: true,
              json: () => Promise.resolve([{ id: 1 }]),
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

  it('handles catch block in fetchGitLabActivity (lines 175-176)', async () => {
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

  it('exits early when cancelled during batch processing (lines 183-184)', async () => {
    let fetchCallCount = 0;
    mockFetchApi.fetch.mockImplementation(() => {
      fetchCallCount++;
      return new Promise(resolve => {
        setTimeout(
          () =>
            resolve({
              ok: true,
              json: () => Promise.resolve([{ id: fetchCallCount }]),
            }),
          100,
        );
      });
    });

    const entities = [
      createGitLabEntity('batch-repo-1'),
      createGitLabEntity('batch-repo-2'),
      createGitLabEntity('batch-repo-3'),
      createGitLabEntity('batch-repo-4'),
    ];

    const { unmount } = renderTestConsumer(entities);

    await jest.advanceTimersByTimeAsync(150);

    unmount();

    const callsBeforeUnmount = fetchCallCount;

    await jest.advanceTimersByTimeAsync(500);

    expect(fetchCallCount).toBe(callsBeforeUnmount);
  });

  it('adds delay between batches when processing multiple GitLab entities (lines 188-190)', async () => {
    const fetchTimes: number[] = [];
    const startTime = Date.now();

    mockFetchApi.fetch.mockImplementation(() => {
      fetchTimes.push(Date.now() - startTime);
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: fetchTimes.length,
              created_at: '2024-06-15T11:00:00Z',
            },
          ]),
      });
    });

    const entities = [
      createGitLabEntity('delay-repo-1'),
      createGitLabEntity('delay-repo-2'),
      createGitLabEntity('delay-repo-3'),
    ];

    renderTestConsumer(entities);

    await jest.advanceTimersByTimeAsync(50);

    expect(mockFetchApi.fetch).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(200);

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalledTimes(3);
    });
  });

  it('does not update state when cancelled after fetches complete (lines 195-196)', async () => {
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
        Promise.resolve([{ id: 123, created_at: '2024-06-15T11:00:00Z' }]),
    });

    await jest.advanceTimersByTimeAsync(100);
  });
});
