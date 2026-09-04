/*
 * Copyright Red Hat
 */

import { Entity } from '@backstage/catalog-model';
import {
  defaultBranchFromEntity,
  normalizeRepoUrl,
  normalizeRepoUrlFromEntity,
  normalizeSourceLocation,
  projectLookupKey,
  projectLookupKeyFromEntity,
  projectNameFromRepoUrl,
  scmOrganizationFromEntity,
} from './catalogEntity';

describe('catalogEntity', () => {
  const gitEntity = (branch?: string): Entity => ({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'terrible-playbook-main',
      annotations: {
        'backstage.io/source-location':
          'url:https://github.com/acme/terrible-playbook.git',
      },
    },
    spec: {
      type: 'git-repository',
      repository_default_branch: branch,
    },
  });

  it('builds a stable project lookup key from repo URL and branch', () => {
    expect(
      projectLookupKey('https://github.com/acme/terrible-playbook.git', 'main'),
    ).toBe('https://github.com/acme/terrible-playbook#main');
    expect(
      projectLookupKey('https://github.com/acme/terrible-playbook', 'backup'),
    ).toBe('https://github.com/acme/terrible-playbook#backup');
  });

  it('builds equivalent lookup keys for HTTPS and SCP-style SSH clone URLs', () => {
    expect(
      projectLookupKey('git@github.com:acme/terrible-playbook.git', 'main'),
    ).toBe(
      projectLookupKey('https://github.com/acme/terrible-playbook', 'main'),
    );
  });

  it('defaults branch to main when omitted', () => {
    expect(projectLookupKey('https://github.com/acme/repo')).toBe(
      'https://github.com/acme/repo#main',
    );
  });

  it('reads default branch from entity spec', () => {
    expect(defaultBranchFromEntity(gitEntity('backup'))).toBe('backup');
    expect(defaultBranchFromEntity(gitEntity())).toBe('main');
  });

  it('derives project lookup key from catalog entity', () => {
    expect(projectLookupKeyFromEntity(gitEntity('backup'))).toBe(
      'https://github.com/acme/terrible-playbook#backup',
    );
  });

  it('derives lookup key from an SCP-style source-location annotation', () => {
    const entity = gitEntity();
    entity.metadata.annotations = {
      'backstage.io/source-location':
        'url:git@github.com:acme/terrible-playbook.git',
    };
    expect(projectLookupKeyFromEntity(entity)).toBe(
      'https://github.com/acme/terrible-playbook#main',
    );
  });

  it('returns null when entity has no repo URL', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'no-repo' },
      spec: { type: 'git-repository' },
    };
    expect(projectLookupKeyFromEntity(entity)).toBeNull();
  });

  it('derives a project name from org/repo in a clone URL', () => {
    expect(
      projectNameFromRepoUrl('https://github.com/acme/playbooks.git'),
    ).toBe('acme/playbooks');
    expect(projectNameFromRepoUrl('not-a-url')).toBe('not-a-url');
    expect(projectNameFromRepoUrl('')).toBe('repository');
  });

  it('normalizes a host-only source location', () => {
    expect(normalizeSourceLocation('https://github.com')).toBe(
      'https://github.com',
    );
  });

  it('falls back to github.com for org/repo source locations', () => {
    expect(normalizeSourceLocation('acme/playbooks')).toBe(
      'https://github.com/acme/playbooks',
    );
  });

  it('returns null for a source location that is not a URL or org/repo', () => {
    expect(normalizeSourceLocation('solo')).toBeNull();
  });

  it('reads a repo URL from github.com/project-slug when source-location is absent', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'slug-repo',
        annotations: { 'github.com/project-slug': 'acme/playbooks' },
      },
    };
    expect(normalizeRepoUrlFromEntity(entity)).toBe(
      'https://github.com/acme/playbooks',
    );
  });

  it('reads a repo URL from SCM annotations', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'scm-repo',
        annotations: {
          'ansible.io/scm-host': 'https://gitlab.com/',
          'ansible.io/scm-organization': 'acme',
          'ansible.io/scm-repository': 'playbooks',
        },
      },
    };
    expect(normalizeRepoUrlFromEntity(entity)).toBe(
      'https://gitlab.com/acme/playbooks',
    );
    expect(scmOrganizationFromEntity(entity)).toBe('acme');
  });

  it('strips trailing slashes from clone URLs', () => {
    expect(normalizeRepoUrl('https://github.com/acme/playbooks///')).toBe(
      'https://github.com/acme/playbooks',
    );
  });
});
