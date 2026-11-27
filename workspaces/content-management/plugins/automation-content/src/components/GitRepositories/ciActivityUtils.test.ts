import { Entity } from '@backstage/catalog-model';
import {
  parseGitHubRuns,
  parseGitLabPipelines,
  buildRowsFromResults,
} from './ciActivityUtils';

jest.mock('../CollectionsCatalog/utils', () => ({
  getSourceUrl: (entity: Entity) =>
    entity.metadata.annotations?.['backstage.io/source-location'] ??
    'https://github.com/org/repo.git',
}));

jest.mock('./scmUtils', () => ({
  getProjectDisplayName: (entity: Entity) =>
    entity.metadata.name ?? 'test-project',
}));

const makeEntity = (
  name: string,
  sourceUrl = 'https://github.com/org/repo.git',
): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name,
    annotations: {
      'backstage.io/source-location': sourceUrl,
    },
  },
});

describe('parseGitHubRuns', () => {
  const entity = makeEntity('my-repo');

  it('parses workflow runs into CIActivityRows', () => {
    const data = {
      workflow_runs: [
        {
          id: 101,
          name: 'CI',
          run_number: 42,
          conclusion: 'success',
          event: 'push',
          created_at: '2026-07-01T10:00:00Z',
          html_url: 'https://github.com/org/repo/actions/runs/101',
        },
      ],
    };

    const rows = parseGitHubRuns('key1', data, entity);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'gh-key1-101',
      status: 'success',
      project: 'my-repo',
      projectUrl: 'https://github.com/org/repo/actions',
      event: 'CI',
      eventDisplay: 'CI #42',
      trigger: 'push',
      time: '2026-07-01T10:00:00Z',
      runUrl: 'https://github.com/org/repo/actions/runs/101',
    });
  });

  it('uses conclusion over status when both present', () => {
    const data = {
      workflow_runs: [{ id: 1, conclusion: 'failure', status: 'completed' }],
    };

    const rows = parseGitHubRuns('k', data, entity);
    expect(rows[0].status).toBe('failure');
  });

  it('falls back to status when conclusion is absent', () => {
    const data = {
      workflow_runs: [{ id: 1, status: 'in_progress' }],
    };

    const rows = parseGitHubRuns('k', data, entity);
    expect(rows[0].status).toBe('in_progress');
  });

  it('returns unknown for unrecognized status', () => {
    const data = {
      workflow_runs: [{ id: 1, conclusion: 'WEIRD_STATUS' }],
    };

    const rows = parseGitHubRuns('k', data, entity);
    expect(rows[0].status).toBe('unknown');
  });

  it('returns empty array when workflow_runs is missing', () => {
    expect(parseGitHubRuns('k', {}, entity)).toEqual([]);
    expect(parseGitHubRuns('k', undefined, entity)).toEqual([]);
  });

  it('strips .git suffix from source URL for projectUrl', () => {
    const rows = parseGitHubRuns('k', { workflow_runs: [{ id: 1 }] }, entity);
    expect(rows[0].projectUrl).toBe('https://github.com/org/repo/actions');
  });

  it('defaults event to Workflow when name is missing', () => {
    const data = { workflow_runs: [{ id: 1 }] };
    const rows = parseGitHubRuns('k', data, entity);
    expect(rows[0].event).toBe('Workflow');
  });

  it('replaces underscores with spaces in trigger', () => {
    const data = {
      workflow_runs: [{ id: 1, event: 'pull_request_target' }],
    };
    const rows = parseGitHubRuns('k', data, entity);
    expect(rows[0].trigger).toBe('pull request target');
  });
});

describe('parseGitLabPipelines', () => {
  const entity = makeEntity('my-gl-repo', 'https://gitlab.com/org/repo.git');

  it('parses pipelines into CIActivityRows', () => {
    const data = [
      {
        id: 201,
        status: 'success',
        source: 'push',
        created_at: '2026-07-02T10:00:00Z',
        web_url: 'https://gitlab.com/org/repo/-/pipelines/201',
      },
    ];

    const rows = parseGitLabPipelines('key1', data, entity);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'gl-key1-201',
      status: 'success',
      project: 'my-gl-repo',
      projectUrl: 'https://gitlab.com/org/repo/-/pipelines',
      event: 'Pipeline',
      eventDisplay: 'Pipeline #201',
      trigger: 'push',
      time: '2026-07-02T10:00:00Z',
      runUrl: 'https://gitlab.com/org/repo/-/pipelines/201',
    });
  });

  it('normalizes GitLab statuses correctly', () => {
    const statuses: [string, string][] = [
      ['success', 'success'],
      ['failed', 'failure'],
      ['canceled', 'cancelled'],
      ['cancelled', 'cancelled'],
      ['running', 'in_progress'],
      ['pending', 'in_progress'],
      ['skipped', 'skipped'],
      ['manual', 'unknown'],
    ];

    for (const [input, expected] of statuses) {
      const data = [{ id: 1, status: input }];
      const rows = parseGitLabPipelines('k', data, entity);
      expect(rows[0].status).toBe(expected);
    }
  });

  it('returns unknown when status is null or undefined', () => {
    const data = [{ id: 1, status: null }];
    const rows = parseGitLabPipelines('k', data, entity);
    expect(rows[0].status).toBe('unknown');
  });

  it('returns empty array when data is not an array', () => {
    expect(parseGitLabPipelines('k', {}, entity)).toEqual([]);
    expect(parseGitLabPipelines('k', undefined, entity)).toEqual([]);
  });

  it('sets projectUrl to undefined when source URL resolves to empty baseUrl', () => {
    const entityEmpty = makeEntity('no-url-repo', '.git');
    const data = [
      { id: 1, status: 'success', created_at: '2026-07-01T00:00:00Z' },
    ];
    const rows = parseGitLabPipelines('k', data, entityEmpty);
    expect(rows[0].projectUrl).toBeUndefined();
  });

  it('handles missing web_url', () => {
    const data = [{ id: 1 }];
    const rows = parseGitLabPipelines('k', data, entity);
    expect(rows[0].runUrl).toBeUndefined();
  });
});

describe('buildRowsFromResults', () => {
  const ghEntity = makeEntity('gh-repo', 'https://github.com/org/repo.git');
  const glEntity = makeEntity('gl-repo', 'https://gitlab.com/org/repo.git');

  it('builds rows from GitHub and GitLab results', () => {
    const results = {
      gh1: {
        status: 200,
        data: {
          workflow_runs: [
            {
              id: 1,
              conclusion: 'success',
              created_at: '2026-07-01T10:00:00Z',
            },
          ],
        },
      },
      gl1: {
        status: 200,
        data: [
          { id: 2, status: 'success', created_at: '2026-07-02T10:00:00Z' },
        ],
      },
    };
    const entityMap = new Map([
      ['gh1', { entity: ghEntity, provider: 'github' }],
      ['gl1', { entity: glEntity, provider: 'gitlab' }],
    ]);

    const rows = buildRowsFromResults(results, entityMap);

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toContain('gl-');
    expect(rows[1].id).toContain('gh-');
  });

  it('skips entries with error', () => {
    const results = {
      k1: { error: 'not found' },
    };
    const entityMap = new Map([
      ['k1', { entity: ghEntity, provider: 'github' }],
    ]);

    const rows = buildRowsFromResults(results, entityMap);
    expect(rows).toHaveLength(0);
  });

  it('skips entries with no matching entity in map', () => {
    const results = {
      missing: {
        status: 200,
        data: { workflow_runs: [{ id: 1 }] },
      },
    };

    const rows = buildRowsFromResults(results, new Map());
    expect(rows).toHaveLength(0);
  });

  it('sorts rows by time descending', () => {
    const results = {
      gh1: {
        status: 200,
        data: {
          workflow_runs: [
            { id: 1, created_at: '2026-07-01T10:00:00Z' },
            { id: 2, created_at: '2026-07-03T10:00:00Z' },
            { id: 3, created_at: '2026-07-02T10:00:00Z' },
          ],
        },
      },
    };
    const entityMap = new Map([
      ['gh1', { entity: ghEntity, provider: 'github' }],
    ]);

    const rows = buildRowsFromResults(results, entityMap);

    expect(rows[0].time).toBe('2026-07-03T10:00:00Z');
    expect(rows[1].time).toBe('2026-07-02T10:00:00Z');
    expect(rows[2].time).toBe('2026-07-01T10:00:00Z');
  });

  it('limits output to 150 rows', () => {
    const runs = Array.from({ length: 200 }, (_, i) => ({
      id: i,
      created_at: `2026-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
    }));
    const results = {
      gh1: { status: 200, data: { workflow_runs: runs } },
    };
    const entityMap = new Map([
      ['gh1', { entity: ghEntity, provider: 'github' }],
    ]);

    const rows = buildRowsFromResults(results, entityMap);
    expect(rows).toHaveLength(150);
  });

  it('ignores unknown provider types', () => {
    const results = {
      k1: { status: 200, data: [{ id: 1 }] },
    };
    const entityMap = new Map([
      ['k1', { entity: ghEntity, provider: 'bitbucket' }],
    ]);

    const rows = buildRowsFromResults(results, entityMap);
    expect(rows).toHaveLength(0);
  });
});
