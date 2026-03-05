import { Entity } from '@backstage/catalog-model';
import {
  getGitHubOwnerRepo,
  getGitLabProjectPath,
  getProjectDisplayName,
} from './scmUtils';

describe('scmUtils', () => {
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
});
