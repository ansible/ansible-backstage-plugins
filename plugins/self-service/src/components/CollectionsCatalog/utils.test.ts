import { Entity } from '@backstage/catalog-model';
import {
  formatTimeAgo,
  buildSourceString,
  getSourceUrl,
  getCollectionFullName,
  compareVersions,
  sortEntities,
  filterLatestVersions,
  getUniqueFilters,
} from './utils';

describe('CollectionsCatalog utils', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('formatTimeAgo', () => {
    it('returns "Unknown" for undefined', () => {
      expect(formatTimeAgo(undefined)).toBe('Unknown');
    });

    it('returns "Unknown" for null-like', () => {
      expect(formatTimeAgo(undefined)).toBe('Unknown');
    });

    it('returns "Just now" for dates within the last minute', () => {
      const d = new Date('2024-06-15T11:59:30Z');
      expect(formatTimeAgo(d)).toBe('Just now');
      expect(formatTimeAgo(d.toISOString())).toBe('Just now');
    });

    it('returns "X minute(s) ago" for last hour', () => {
      expect(formatTimeAgo(new Date('2024-06-15T11:30:00Z'))).toBe(
        '30 minutes ago',
      );
      expect(formatTimeAgo(new Date('2024-06-15T11:59:00Z'))).toBe(
        '1 minute ago',
      );
    });

    it('returns "X hour(s) ago" for last day', () => {
      expect(formatTimeAgo(new Date('2024-06-15T10:00:00Z'))).toBe(
        '2 hours ago',
      );
      expect(formatTimeAgo(new Date('2024-06-15T11:00:00Z'))).toBe(
        '1 hour ago',
      );
    });

    it('returns "X day(s) ago" for last ~30 days', () => {
      expect(formatTimeAgo(new Date('2024-06-14T12:00:00Z'))).toBe('1 day ago');
      expect(formatTimeAgo(new Date('2024-06-13T12:00:00Z'))).toBe(
        '2 days ago',
      );
    });

    it('returns "X month(s) ago" for older', () => {
      expect(formatTimeAgo(new Date('2024-05-15T12:00:00Z'))).toBe(
        '1 month ago',
      );
      expect(formatTimeAgo(new Date('2024-04-15T12:00:00Z'))).toBe(
        '2 months ago',
      );
    });
  });

  describe('buildSourceString', () => {
    it('returns "Private Automation Hub" for PAH without repository', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'c',
          annotations: { 'ansible.io/collection-source': 'pah' },
        },
        spec: {},
      };
      expect(buildSourceString(entity)).toBe('Private Automation Hub');
    });

    it('returns "Private Automation Hub (repo)" for PAH with repository', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'c',
          annotations: {
            'ansible.io/collection-source': 'pah',
            'ansible.io/collection-source-repository': 'my-repo',
          },
        },
        spec: {},
      };
      expect(buildSourceString(entity)).toBe(
        'Private Automation Hub (my-repo)',
      );
    });

    it('returns scmProvider only when host/repo missing', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'c',
          annotations: { 'ansible.io/scm-provider': 'github' },
        },
        spec: {},
      };
      expect(buildSourceString(entity)).toBe('github');
    });

    it('returns "scmProvider@host/repo.git" for SCM with host and repo', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'c',
          annotations: {
            'ansible.io/scm-provider': 'github',
            'ansible.io/scm-host': 'github.com',
            'ansible.io/scm-repository': 'org/repo',
          },
        },
        spec: {},
      };
      expect(buildSourceString(entity)).toBe('github@github.com/org/repo.git');
    });
  });

  describe('getSourceUrl', () => {
    it('returns undefined when no source url', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'c' },
        spec: {},
      };
      expect(getSourceUrl(entity)).toBeUndefined();
    });

    it('returns backstage.io/source-url for PAH', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'c',
          annotations: {
            'ansible.io/collection-source': 'pah',
            'backstage.io/source-url': 'https://example.com/source',
          },
        },
        spec: {},
      };
      expect(getSourceUrl(entity)).toBe('https://example.com/source');
    });

    it('strips "url:" prefix from backstage.io/source-location', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'c',
          annotations: {
            'backstage.io/source-location': 'url:https://github.com/org/repo',
          },
        },
        spec: {},
      };
      expect(getSourceUrl(entity)).toBe('https://github.com/org/repo');
    });

    it('returns source-location as-is when not url: prefix', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'c',
          annotations: {
            'backstage.io/source-location': 'https://github.com/org/repo',
          },
        },
        spec: {},
      };
      expect(getSourceUrl(entity)).toBe('https://github.com/org/repo');
    });
  });

  describe('getCollectionFullName', () => {
    it('uses spec.collection_full_name when present', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'c' },
        spec: { collection_full_name: 'MyNamespace.MyCollection' } as any,
      };
      expect(getCollectionFullName(entity)).toBe('mynamespace.mycollection');
    });

    it('builds from namespace and name when full_name missing', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'c' },
        spec: {
          collection_namespace: 'Ns',
          collection_name: 'Col',
        } as any,
      };
      expect(getCollectionFullName(entity)).toBe('ns.col');
    });

    it('handles empty spec', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'c' },
        spec: {},
      };
      expect(getCollectionFullName(entity)).toBe('.');
    });
  });

  describe('compareVersions', () => {
    it('returns 0 for equal versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.1.3', '2.1.3')).toBe(0);
    });

    it('returns 1 when first is greater', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    });

    it('returns -1 when second is greater', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
    });

    it('handles different segment lengths', () => {
      expect(compareVersions('1.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.1', '1.0')).toBe(1);
    });
  });

  describe('sortEntities', () => {
    it('sorts by collection full name', () => {
      const entities: Entity[] = [
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: { name: 'z' },
          spec: { collection_full_name: 'z.z' } as any,
        },
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: { name: 'a' },
          spec: { collection_full_name: 'a.a' } as any,
        },
      ];
      const sorted = sortEntities(entities);
      expect(getCollectionFullName(sorted[0])).toBe('a.a');
      expect(getCollectionFullName(sorted[1])).toBe('z.z');
    });

    it('does not mutate original array', () => {
      const entities: Entity[] = [
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: { name: 'b' },
          spec: { collection_full_name: 'b.b' } as any,
        },
      ];
      sortEntities(entities);
      expect(entities[0].metadata.name).toBe('b');
    });
  });

  describe('filterLatestVersions', () => {
    it('keeps one entity per fullName+sourceId with highest version', () => {
      const entities: Entity[] = [
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'a-1',
            annotations: { 'ansible.io/discovery-source-id': 'src1' },
          },
          spec: {
            collection_full_name: 'ns.col',
            collection_version: '1.0.0',
          } as any,
        },
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'a-2',
            annotations: { 'ansible.io/discovery-source-id': 'src1' },
          },
          spec: {
            collection_full_name: 'ns.col',
            collection_version: '2.0.0',
          } as any,
        },
      ];
      const result = filterLatestVersions(entities);
      expect(result).toHaveLength(1);
      expect(result[0].spec?.collection_version).toBe('2.0.0');
    });

    it('keeps separate entities for different sourceIds', () => {
      const entities: Entity[] = [
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'a',
            annotations: { 'ansible.io/discovery-source-id': 'src1' },
          },
          spec: {
            collection_full_name: 'ns.col',
            collection_version: '1.0.0',
          } as any,
        },
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'b',
            annotations: { 'ansible.io/discovery-source-id': 'src2' },
          },
          spec: {
            collection_full_name: 'ns.col',
            collection_version: '1.0.0',
          } as any,
        },
      ];
      const result = filterLatestVersions(entities);
      expect(result).toHaveLength(2);
    });
  });

  describe('getUniqueFilters', () => {
    it('extracts unique sources and tags from entities', () => {
      const entities: Entity[] = [
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'a',
            tags: ['tag1', 'ansible-collection'],
            annotations: {
              'ansible.io/collection-source': 'pah',
              'ansible.io/collection-source-repository': 'repo1',
            },
          },
          spec: {},
        },
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'b',
            tags: ['tag2'],
            annotations: {
              'ansible.io/scm-host-name': 'github.com',
            },
          },
          spec: {},
        },
      ];
      const { sources, tags } = getUniqueFilters(entities);
      expect(sources).toEqual(expect.arrayContaining(['repo1', 'github.com']));
      expect(sources).toHaveLength(2);
      expect(tags).toEqual(expect.arrayContaining(['tag1', 'tag2']));
      expect(tags).not.toContain('ansible-collection');
    });

    it('sorts sources and tags', () => {
      const entities: Entity[] = [
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'b',
            tags: ['z-tag'],
            annotations: { 'ansible.io/scm-host-name': 'z-host' },
          },
          spec: {},
        },
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'a',
            tags: ['a-tag'],
            annotations: { 'ansible.io/scm-host-name': 'a-host' },
          },
          spec: {},
        },
      ];
      const { sources, tags } = getUniqueFilters(entities);
      expect(sources).toEqual(['a-host', 'z-host']);
      expect(tags).toEqual(['a-tag', 'z-tag']);
    });
  });
});
