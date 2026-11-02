import {
  sanitizeHostName,
  createCollectionIdentifier,
  createCollectionKey,
  getDefaultHost,
  generateSourceId,
  sanitizeEntityName,
  sanitizeTagForBackstage,
  generateCollectionEntityName,
  generateRepositoryEntityName,
  createRepositoryKey,
  parseDependencies,
  createDependencyRelations,
} from './utils';
import type {
  DiscoveredGalaxyFile,
  AnsibleGitContentsSourceConfig,
  RepositoryInfo,
} from '../types';

describe('utils', () => {
  const mockSourceConfig: AnsibleGitContentsSourceConfig = {
    enabled: true,
    scmProvider: 'github',
    hostName: 'GitHub.com',
    host: 'github.com',
    organization: 'ansible',
    env: 'development',
    schedule: { frequency: { minutes: 30 }, timeout: { minutes: 10 } },
  };

  const mockGalaxyFile: DiscoveredGalaxyFile = {
    repository: {
      name: 'test-collection',
      fullPath: 'ansible/test-collection',
      defaultBranch: 'main',
      url: 'https://github.com/ansible/test-collection',
    },
    ref: 'main',
    refType: 'branch',
    path: 'galaxy.yml',
    content: '',
    metadata: {
      namespace: 'ansible',
      name: 'posix',
      version: '1.5.0',
    },
  };

  const mockRepository: RepositoryInfo = {
    name: 'test-repo',
    fullPath: 'org/test-repo',
    defaultBranch: 'main',
    url: 'https://github.com/org/test-repo',
  };

  describe('sanitizeHostName', () => {
    it('should lowercase and replace special characters with hyphens', () => {
      expect(sanitizeHostName('GitHub.com')).toBe('github-com');
      expect(sanitizeHostName('gitlab.example.com')).toBe('gitlab-example-com');
    });

    it('should collapse multiple hyphens into one', () => {
      expect(sanitizeHostName('host--name')).toBe('host-name');
      expect(sanitizeHostName('a---b---c')).toBe('a-b-c');
    });

    it('should remove leading and trailing hyphens', () => {
      expect(sanitizeHostName('-hostname-')).toBe('hostname');
      expect(sanitizeHostName('--host--')).toBe('host');
    });

    it('should handle simple hostnames', () => {
      expect(sanitizeHostName('localhost')).toBe('localhost');
      expect(sanitizeHostName('github')).toBe('github');
    });

    it('should handle empty and edge cases', () => {
      expect(sanitizeHostName('')).toBe('');
      expect(sanitizeHostName('---')).toBe('');
    });
  });

  describe('createCollectionIdentifier', () => {
    it('should create a collection identifier from galaxy file and source config', () => {
      const result = createCollectionIdentifier(
        mockGalaxyFile,
        mockSourceConfig,
      );

      expect(result).toEqual({
        scmProvider: 'github',
        hostName: 'github-com',
        host: 'github.com',
        organization: 'ansible',
        namespace: 'ansible',
        name: 'posix',
        version: '1.5.0',
      });
    });

    it('should use default host when host is not provided', () => {
      const configWithoutHost = { ...mockSourceConfig, host: undefined };
      const result = createCollectionIdentifier(
        mockGalaxyFile,
        configWithoutHost,
      );

      expect(result.host).toBe('github.com');
    });

    it('should use gitlab.com as default for gitlab provider', () => {
      const gitlabConfig = {
        ...mockSourceConfig,
        scmProvider: 'gitlab' as const,
        host: undefined,
      };
      const result = createCollectionIdentifier(mockGalaxyFile, gitlabConfig);

      expect(result.host).toBe('gitlab.com');
    });
  });

  describe('createCollectionKey', () => {
    it('should create a unique key for a collection', () => {
      const identifier = {
        scmProvider: 'github' as const,
        hostName: 'github-com',
        host: 'github.com',
        organization: 'ansible',
        namespace: 'ansible',
        name: 'posix',
        version: '1.5.0',
      };

      const result = createCollectionKey(identifier);

      expect(result).toBe('github:github-com:ansible:ansible.posix@1.5.0');
    });
  });

  describe('getDefaultHost', () => {
    it('should return github.com for github provider', () => {
      expect(getDefaultHost('github')).toBe('github.com');
    });

    it('should return gitlab.com for gitlab provider', () => {
      expect(getDefaultHost('gitlab')).toBe('gitlab.com');
    });
  });

  describe('generateSourceId', () => {
    it('should generate a source ID from config', () => {
      const result = generateSourceId(mockSourceConfig);

      expect(result).toBe('development:github:github-com:ansible');
    });

    it('should sanitize special characters', () => {
      const config = {
        ...mockSourceConfig,
        env: 'Dev_Environment',
        organization: 'My.Org',
      };
      const result = generateSourceId(config);

      expect(result).toBe('dev-environment:github:github-com:my-org');
    });
  });

  describe('sanitizeEntityName', () => {
    it('should lowercase and replace special characters', () => {
      expect(sanitizeEntityName('My_Collection.Name')).toBe(
        'my-collection-name',
      );
    });

    it('should collapse multiple hyphens', () => {
      expect(sanitizeEntityName('name--with---hyphens')).toBe(
        'name-with-hyphens',
      );
    });

    it('should remove leading and trailing hyphens', () => {
      expect(sanitizeEntityName('-my-name-')).toBe('my-name');
    });

    it('should truncate to 63 characters', () => {
      const longName = 'a'.repeat(100);
      expect(sanitizeEntityName(longName).length).toBe(63);
    });
  });

  describe('sanitizeTagForBackstage', () => {
    it('should convert underscores to hyphens for Backstage tag policy', () => {
      expect(sanitizeTagForBackstage('ee_utilities')).toBe('ee-utilities');
    });

    it('should accept object with name property', () => {
      expect(sanitizeTagForBackstage({ name: 'my_tag' })).toBe('my-tag');
    });

    it('should allow only [a-z0-9+#] and hyphens', () => {
      expect(sanitizeTagForBackstage('cloud')).toBe('cloud');
      expect(sanitizeTagForBackstage('networking')).toBe('networking');
    });
  });

  describe('generateCollectionEntityName', () => {
    it('should generate a sanitized entity name for a collection', () => {
      const result = generateCollectionEntityName(
        mockGalaxyFile,
        mockSourceConfig,
      );

      expect(result).toBe('ansible-posix-1-5-0-github-github-com');
    });

    it('should handle special characters in metadata', () => {
      const galaxyFile = {
        ...mockGalaxyFile,
        metadata: {
          namespace: 'My_Namespace',
          name: 'Collection.Name',
          version: '2.0.0-beta',
        },
      };
      const result = generateCollectionEntityName(galaxyFile, mockSourceConfig);

      expect(result).toMatch(/^[a-z0-9-]+$/);
      expect(result.length).toBeLessThanOrEqual(63);
    });
  });

  describe('generateRepositoryEntityName', () => {
    it('should generate a sanitized entity name for a repository', () => {
      const result = generateRepositoryEntityName(
        mockRepository,
        mockSourceConfig,
      );

      expect(result).toBe('org-test-repo-github-github-com');
    });
  });

  describe('createRepositoryKey', () => {
    it('should create a unique key for a repository', () => {
      const result = createRepositoryKey(mockRepository, mockSourceConfig);

      expect(result).toBe('github:github-com:org/test-repo');
    });
  });

  describe('parseDependencies', () => {
    it('should parse dependencies into structured format', () => {
      const dependencies = {
        'ansible.netcommon': '>=2.0.0',
        'community.general': '*',
      };

      const result = parseDependencies(dependencies);

      expect(result).toEqual([
        { namespace: 'ansible', name: 'netcommon', version: '>=2.0.0' },
        { namespace: 'community', name: 'general', version: '*' },
      ]);
    });

    it('should handle undefined dependencies', () => {
      expect(parseDependencies(undefined)).toEqual([]);
    });

    it('should handle empty dependencies', () => {
      expect(parseDependencies({})).toEqual([]);
    });

    it('should handle dependencies without namespace separator', () => {
      const dependencies = { singlename: '1.0.0' };
      const result = parseDependencies(dependencies);

      // When no dot separator, namespace gets the value, name falls back to fullName
      expect(result).toEqual([
        { namespace: 'singlename', name: 'singlename', version: '1.0.0' },
      ]);
    });
  });

  describe('createDependencyRelations', () => {
    it('should create backstage component relations', () => {
      const dependencies = {
        'ansible.netcommon': '>=2.0.0',
        'community.general': '*',
      };

      const result = createDependencyRelations(dependencies);

      expect(result).toEqual([
        'component:default/ansible-netcommon',
        'component:default/community-general',
      ]);
    });

    it('should handle undefined dependencies', () => {
      expect(createDependencyRelations(undefined)).toEqual([]);
    });

    it('should handle empty dependencies', () => {
      expect(createDependencyRelations({})).toEqual([]);
    });
  });
});
