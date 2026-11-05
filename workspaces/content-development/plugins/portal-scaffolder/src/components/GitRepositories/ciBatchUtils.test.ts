import { Entity } from '@backstage/catalog-model';
import { buildBatchItems } from './ciBatchUtils';

jest.mock('./scmUtils', () => ({
  getGitHubOwnerRepo: jest.fn((entity: Entity) => {
    const annotations = entity.metadata?.annotations || {};
    if (annotations['ansible.io/scm-provider'] === 'github') {
      return {
        owner: annotations['ansible.io/scm-organization'],
        repo: annotations['ansible.io/scm-repository'],
      };
    }
    return null;
  }),
  getGitLabProjectPath: jest.fn((entity: Entity) => {
    const annotations = entity.metadata?.annotations || {};
    if (annotations['ansible.io/scm-provider'] === 'gitlab') {
      const org = annotations['ansible.io/scm-organization'];
      const repo = annotations['ansible.io/scm-repository'];
      return `${org}/${repo}`;
    }
    return null;
  }),
  getRepoHost: jest.fn((entity: Entity) => {
    return entity.metadata?.annotations?.['ansible.io/scm-host'] || '';
  }),
}));

const makeEntity = (
  name: string,
  annotations: Record<string, string> = {},
): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name, namespace: 'default', annotations },
});

describe('buildBatchItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty items and entityMap for empty entities', () => {
    const result = buildBatchItems([]);
    expect(result.items).toEqual([]);
    expect(result.entityMap.size).toBe(0);
  });

  it('builds a GitHub batch item with owner, repo, and host', () => {
    const entity = makeEntity('my-repo', {
      'ansible.io/scm-provider': 'github',
      'ansible.io/scm-organization': 'my-org',
      'ansible.io/scm-repository': 'my-repo',
      'ansible.io/scm-host': 'github.example.com',
    });

    const result = buildBatchItems([entity]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        provider: 'github',
        owner: 'my-org',
        repo: 'my-repo',
        host: 'github.example.com',
      }),
    );
    expect(result.entityMap.get(result.items[0].key)).toEqual({
      entity,
      provider: 'github',
    });
  });

  it('defaults GitHub host to github.com when scm-host is empty', () => {
    const entity = makeEntity('repo', {
      'ansible.io/scm-provider': 'github',
      'ansible.io/scm-organization': 'org',
      'ansible.io/scm-repository': 'repo',
    });

    const result = buildBatchItems([entity]);
    expect(result.items[0].host).toBe('github.com');
  });

  it('builds a GitLab batch item with projectPath and host', () => {
    const entity = makeEntity('gl-repo', {
      'ansible.io/scm-provider': 'gitlab',
      'ansible.io/scm-organization': 'gl-group',
      'ansible.io/scm-repository': 'gl-repo',
      'ansible.io/scm-host': 'gitlab.example.com',
    });

    const result = buildBatchItems([entity]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        provider: 'gitlab',
        projectPath: 'gl-group/gl-repo',
        host: 'gitlab.example.com',
      }),
    );
    expect(result.entityMap.get(result.items[0].key)).toEqual({
      entity,
      provider: 'gitlab',
    });
  });

  it('defaults GitLab host to gitlab.com when scm-host is empty', () => {
    const entity = makeEntity('repo', {
      'ansible.io/scm-provider': 'gitlab',
      'ansible.io/scm-organization': 'org',
      'ansible.io/scm-repository': 'repo',
    });

    const result = buildBatchItems([entity]);
    expect(result.items[0].host).toBe('gitlab.com');
  });

  it('skips entities with no scm-provider', () => {
    const entity = makeEntity('no-scm', {});
    const result = buildBatchItems([entity]);
    expect(result.items).toHaveLength(0);
    expect(result.entityMap.size).toBe(0);
  });

  it('handles a mix of GitHub, GitLab, and unknown providers', () => {
    const ghEntity = makeEntity('gh', {
      'ansible.io/scm-provider': 'github',
      'ansible.io/scm-organization': 'org',
      'ansible.io/scm-repository': 'gh-repo',
    });
    const glEntity = makeEntity('gl', {
      'ansible.io/scm-provider': 'gitlab',
      'ansible.io/scm-organization': 'group',
      'ansible.io/scm-repository': 'gl-repo',
    });
    const unknownEntity = makeEntity('unknown', {
      'ansible.io/scm-provider': 'bitbucket',
    });

    const result = buildBatchItems([ghEntity, glEntity, unknownEntity]);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].provider).toBe('github');
    expect(result.items[1].provider).toBe('gitlab');
    expect(result.entityMap.size).toBe(2);
  });

  it('passes perPage to each batch item', () => {
    const entity = makeEntity('repo', {
      'ansible.io/scm-provider': 'github',
      'ansible.io/scm-organization': 'org',
      'ansible.io/scm-repository': 'repo',
    });

    const result = buildBatchItems([entity], 50);
    expect(result.items[0].per_page).toBe(50);
  });

  it('leaves per_page undefined when perPage is not provided', () => {
    const entity = makeEntity('repo', {
      'ansible.io/scm-provider': 'github',
      'ansible.io/scm-organization': 'org',
      'ansible.io/scm-repository': 'repo',
    });

    const result = buildBatchItems([entity]);
    expect(result.items[0].per_page).toBeUndefined();
  });

  it('uses stringifyEntityRef as key', () => {
    const entity = makeEntity('my-repo', {
      'ansible.io/scm-provider': 'github',
      'ansible.io/scm-organization': 'org',
      'ansible.io/scm-repository': 'repo',
    });

    const result = buildBatchItems([entity]);
    expect(result.items[0].key).toBe('component:default/my-repo');
  });
});
