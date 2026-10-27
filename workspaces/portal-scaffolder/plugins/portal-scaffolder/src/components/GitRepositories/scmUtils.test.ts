import { Entity } from '@backstage/catalog-model';
import {
  buildRawReadmeFetchUrl,
  getGitHubOwnerRepo,
  getGitLabProjectPath,
  getProjectDisplayName,
  getRepoHost,
  getRepoHostName,
} from './scmUtils';

describe('scmUtils', () => {
  describe('getRepoHost', () => {
    it('returns hostname from https scm-host annotation', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test',
          annotations: {
            'ansible.io/scm-host': 'https://git.example.com/path',
          },
        },
        spec: {},
      };
      expect(getRepoHost(entity)).toBe('git.example.com');
    });

    it('returns hostname from http scm-host annotation', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test',
          annotations: { 'ansible.io/scm-host': 'http://git.internal:8080' },
        },
        spec: {},
      };
      expect(getRepoHost(entity)).toBe('git.internal');
    });

    it('returns scm-host as-is when not a URL', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test',
          annotations: { 'ansible.io/scm-host': 'my-custom-host' },
        },
        spec: {},
      };
      expect(getRepoHost(entity)).toBe('my-custom-host');
    });

    it('falls back to github.com when provider is github', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test',
          annotations: { 'ansible.io/scm-provider': 'github' },
        },
        spec: {},
      };
      expect(getRepoHost(entity)).toBe('github.com');
    });

    it('falls back to gitlab.com when provider is gitlab', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test',
          annotations: { 'ansible.io/scm-provider': 'gitlab' },
        },
        spec: {},
      };
      expect(getRepoHost(entity)).toBe('gitlab.com');
    });

    it('returns provider string for unknown provider', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test',
          annotations: { 'ansible.io/scm-provider': 'bitbucket' },
        },
        spec: {},
      };
      expect(getRepoHost(entity)).toBe('bitbucket');
    });

    it('returns empty string when no annotations', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'test' },
        spec: {},
      };
      expect(getRepoHost(entity)).toBe('');
    });

    it('returns scm-host as-is when URL parsing fails on malformed http URL', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test',
          annotations: { 'ansible.io/scm-host': 'http://' },
        },
        spec: {},
      };
      expect(getRepoHost(entity)).toBe('http://');
    });
  });

  describe('getRepoHostName', () => {
    it('returns scm-host-name annotation when present', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test',
          annotations: {
            'ansible.io/scm-host-name': 'My GitLab',
            'ansible.io/scm-provider': 'gitlab',
          },
        },
        spec: {},
      };
      expect(getRepoHostName(entity)).toBe('My GitLab');
    });

    it('falls back to getRepoHost when scm-host-name is missing', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test',
          annotations: { 'ansible.io/scm-provider': 'github' },
        },
        spec: {},
      };
      expect(getRepoHostName(entity)).toBe('github.com');
    });

    it('returns empty string when entity has no annotations object', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'test' },
        spec: {},
      };
      expect(getRepoHostName(entity)).toBe('');
    });

    it('falls back to getRepoHost when scm-host-name is whitespace-only', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test',
          annotations: {
            'ansible.io/scm-host-name': '   ',
            'ansible.io/scm-provider': 'gitlab',
          },
        },
        spec: {},
      };
      expect(getRepoHostName(entity)).toBe('gitlab.com');
    });
  });

  describe('getGitHubOwnerRepo', () => {
    it('returns owner and repo for GitHub entity', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-repo',
          annotations: {
            'ansible.io/scm-provider': 'github',
            'ansible.io/scm-organization': 'my-org',
            'ansible.io/scm-repository': 'my-repo',
          },
        },
        spec: {},
      };

      const result = getGitHubOwnerRepo(entity);
      expect(result).toEqual({ owner: 'my-org', repo: 'my-repo' });
    });

    it('returns owner and repo for GitHub entity with uppercase provider', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-repo',
          annotations: {
            'ansible.io/scm-provider': 'GitHub',
            'ansible.io/scm-organization': 'my-org',
            'ansible.io/scm-repository': 'my-repo',
          },
        },
        spec: {},
      };

      const result = getGitHubOwnerRepo(entity);
      expect(result).toEqual({ owner: 'my-org', repo: 'my-repo' });
    });

    it('returns null for GitLab entity', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-repo',
          annotations: {
            'ansible.io/scm-provider': 'gitlab',
            'ansible.io/scm-organization': 'my-org',
            'ansible.io/scm-repository': 'my-repo',
          },
        },
        spec: {},
      };

      expect(getGitHubOwnerRepo(entity)).toBeNull();
    });

    it('returns null when owner is missing', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-repo',
          annotations: {
            'ansible.io/scm-provider': 'github',
            'ansible.io/scm-repository': 'my-repo',
          },
        },
        spec: {},
      };

      expect(getGitHubOwnerRepo(entity)).toBeNull();
    });

    it('returns null when repo is missing', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-repo',
          annotations: {
            'ansible.io/scm-provider': 'github',
            'ansible.io/scm-organization': 'my-org',
          },
        },
        spec: {},
      };

      expect(getGitHubOwnerRepo(entity)).toBeNull();
    });

    it('returns null when no annotations', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-repo',
        },
        spec: {},
      };

      expect(getGitHubOwnerRepo(entity)).toBeNull();
    });

    it('returns null when owner is not a string', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-repo',
          annotations: {
            'ansible.io/scm-provider': 'github',
            'ansible.io/scm-organization': 123 as unknown as string,
            'ansible.io/scm-repository': 'my-repo',
          },
        },
        spec: {},
      };

      expect(getGitHubOwnerRepo(entity)).toBeNull();
    });
  });

  describe('getGitLabProjectPath', () => {
    it('returns project path for GitLab entity', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-repo',
          annotations: {
            'ansible.io/scm-provider': 'gitlab',
            'ansible.io/scm-organization': 'my-group',
            'ansible.io/scm-repository': 'my-project',
          },
        },
        spec: {},
      };

      expect(getGitLabProjectPath(entity)).toBe('my-group/my-project');
    });

    it('returns project path for GitLab entity with uppercase provider', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-repo',
          annotations: {
            'ansible.io/scm-provider': 'GitLab',
            'ansible.io/scm-organization': 'my-group',
            'ansible.io/scm-repository': 'my-project',
          },
        },
        spec: {},
      };

      expect(getGitLabProjectPath(entity)).toBe('my-group/my-project');
    });

    it('returns null for GitHub entity', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-repo',
          annotations: {
            'ansible.io/scm-provider': 'github',
            'ansible.io/scm-organization': 'my-org',
            'ansible.io/scm-repository': 'my-repo',
          },
        },
        spec: {},
      };

      expect(getGitLabProjectPath(entity)).toBeNull();
    });

    it('returns null when organization is missing', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-repo',
          annotations: {
            'ansible.io/scm-provider': 'gitlab',
            'ansible.io/scm-repository': 'my-project',
          },
        },
        spec: {},
      };

      expect(getGitLabProjectPath(entity)).toBeNull();
    });

    it('returns null when repository is missing', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-repo',
          annotations: {
            'ansible.io/scm-provider': 'gitlab',
            'ansible.io/scm-organization': 'my-group',
          },
        },
        spec: {},
      };

      expect(getGitLabProjectPath(entity)).toBeNull();
    });

    it('returns null when repo is not a string', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-repo',
          annotations: {
            'ansible.io/scm-provider': 'gitlab',
            'ansible.io/scm-organization': 'my-group',
            'ansible.io/scm-repository': null as unknown as string,
          },
        },
        spec: {},
      };

      expect(getGitLabProjectPath(entity)).toBeNull();
    });

    it('returns null when entity has no annotations object', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'test' },
        spec: {},
      };

      expect(getGitLabProjectPath(entity)).toBeNull();
    });
  });

  describe('getProjectDisplayName', () => {
    it('returns metadata.title when present', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'entity-name',
          title: 'My Entity Title',
        },
        spec: {},
      };

      expect(getProjectDisplayName(entity)).toBe('My Entity Title');
    });

    it('returns metadata.name when title is missing', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'entity-name',
        },
        spec: {},
      };

      expect(getProjectDisplayName(entity)).toBe('entity-name');
    });

    it('returns em dash when both title and name are missing', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {} as Entity['metadata'],
        spec: {},
      };

      expect(getProjectDisplayName(entity)).toBe('—');
    });

    it('prefers title over name', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'entity-name',
          title: 'Entity Title',
        },
        spec: {},
      };

      expect(getProjectDisplayName(entity)).toBe('Entity Title');
    });
  });

  describe('buildRawReadmeFetchUrl', () => {
    const branch = 'main';
    const file = 'README.md';

    it('builds GitHub raw URL from org/repo', () => {
      expect(
        buildRawReadmeFetchUrl('https://github.com/acme/widgets', branch, file),
      ).toBe('https://raw.githubusercontent.com/acme/widgets/main/README.md');
    });

    it('builds GitLab raw URL for two-segment project path', () => {
      expect(
        buildRawReadmeFetchUrl('https://gitlab.com/org/repo', branch, file),
      ).toBe('https://gitlab.com/org/repo/-/raw/main/README.md');
    });

    it('builds GitLab raw URL for nested group / subgroup project path', () => {
      expect(
        buildRawReadmeFetchUrl(
          'https://gitlab.com/my-group/my-subgroup/my-project',
          branch,
          file,
        ),
      ).toBe(
        'https://gitlab.com/my-group/my-subgroup/my-project/-/raw/main/README.md',
      );
    });

    it('derives GitLab project path from blob URL (strips /-/blob/...)', () => {
      expect(
        buildRawReadmeFetchUrl(
          'https://gitlab.com/g1/g2/g3/proj/-/blob/main/README.md',
          branch,
          file,
        ),
      ).toBe('https://gitlab.com/g1/g2/g3/proj/-/raw/main/README.md');
    });

    it('supports self-hosted GitLab hostnames containing gitlab', () => {
      expect(
        buildRawReadmeFetchUrl(
          'https://gitlab.example.com/ns/subns/app',
          branch,
          file,
        ),
      ).toBe('https://gitlab.example.com/ns/subns/app/-/raw/main/README.md');
    });

    it('returns null for hosts that only contain github as a substring', () => {
      expect(
        buildRawReadmeFetchUrl(
          'https://notgithub.com/acme/widgets',
          branch,
          file,
        ),
      ).toBeNull();
    });

    it('returns null for hosts that only contain gitlab as a substring', () => {
      expect(
        buildRawReadmeFetchUrl('https://notgitlab.com/org/repo', branch, file),
      ).toBeNull();
    });

    it('returns null for GitHub URL missing owner or repo', () => {
      expect(
        buildRawReadmeFetchUrl('https://github.com/', branch, file),
      ).toBeNull();
      expect(
        buildRawReadmeFetchUrl('https://github.com/acme', branch, file),
      ).toBeNull();
    });

    it('returns null for GitLab URL with empty pathname', () => {
      expect(
        buildRawReadmeFetchUrl('https://gitlab.com/', branch, file),
      ).toBeNull();
    });

    it('returns null for invalid URL string', () => {
      expect(buildRawReadmeFetchUrl('not-a-url', branch, file)).toBeNull();
    });

    it('strips .git suffix from GitHub repo name', () => {
      expect(
        buildRawReadmeFetchUrl(
          'https://github.com/acme/widgets.git',
          branch,
          file,
        ),
      ).toBe('https://raw.githubusercontent.com/acme/widgets/main/README.md');
    });
  });
});
