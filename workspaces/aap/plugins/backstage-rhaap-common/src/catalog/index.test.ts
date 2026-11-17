/**
 * @jest-environment node
 */
import { ConfigReader } from '@backstage/config';

import {
  assertCatalogModuleSliceAllowed,
  createCatalogModule,
  createCollectionIdentifier,
  createCollectionKey,
  createRepositoryKey,
  createRouter,
  generateCollectionEntityName,
  generateRepositoryEntityName,
  generateSourceId,
  getDefaultHost,
  pahCollectionParser,
  readAapApiEntityConfigs,
  repositoryParser,
  resetCatalogModuleSliceGuardForTests,
  sanitizeEntityName,
  sanitizeHostName,
  sanitizeTagForBackstage,
  scmCollectionParser,
  stampLatestVersionAnnotations,
} from './index';
import type {
  AnsibleGitContentsSourceConfig,
  DiscoveredGalaxyFile,
  RepositoryInfo,
} from './providers/types';

describe('catalog barrel', () => {
  const sourceConfig: AnsibleGitContentsSourceConfig = {
    enabled: true,
    scmProvider: 'github',
    hostName: 'GitHub.com',
    host: 'github.com',
    organization: 'ansible',
    env: 'development',
    schedule: { frequency: { minutes: 30 }, timeout: { minutes: 10 } },
  };

  const galaxyFile: DiscoveredGalaxyFile = {
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

  const repository: RepositoryInfo = {
    name: 'test-repo',
    fullPath: 'org/test-repo',
    defaultBranch: 'main',
    url: 'https://github.com/org/test-repo',
  };

  afterEach(() => {
    resetCatalogModuleSliceGuardForTests();
  });

  it('re-exports module, router, and slice-guard entry points', () => {
    expect(typeof createCatalogModule).toBe('function');
    expect(typeof createRouter).toBe('function');
    expect(typeof assertCatalogModuleSliceAllowed).toBe('function');
    expect(() =>
      createCatalogModule({ moduleId: 'aap', slice: 'aap' }),
    ).not.toThrow();
  });

  it('re-exports collection naming helpers used by the content slice', () => {
    const identifier = createCollectionIdentifier(galaxyFile, sourceConfig);
    expect(createCollectionKey(identifier)).toContain('ansible.posix');
    expect(createRepositoryKey(repository, sourceConfig)).toContain(
      'org/test-repo',
    );
    expect(generateCollectionEntityName(galaxyFile, sourceConfig)).toBeTruthy();
    expect(generateRepositoryEntityName(repository, sourceConfig)).toBeTruthy();
    expect(generateSourceId(sourceConfig)).toContain('github');
    expect(getDefaultHost('github')).toBe('github.com');
    expect(sanitizeEntityName('My Collection')).toBe('my-collection');
    expect(sanitizeHostName('GitHub.com')).toBe('github-com');
    expect(sanitizeTagForBackstage('1.2.3')).toBe('1-2-3');
  });

  it('re-exports config, parsers, and version stamping', () => {
    expect(
      readAapApiEntityConfigs(new ConfigReader({}), 'jobTemplates'),
    ).toEqual([]);

    expect(typeof pahCollectionParser).toBe('function');
    expect(typeof scmCollectionParser).toBe('function');
    expect(typeof repositoryParser).toBe('function');

    const entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'community-general' },
      spec: {
        type: 'ansible-collection',
        collection_full_name: 'community.general',
        collection_version: '1.0.0',
      },
    };
    stampLatestVersionAnnotations([entity]);
    expect(entity.metadata.annotations?.['ansible.io/is-latest-version']).toBe(
      'true',
    );
  });
});
