/*
 * Copyright Red Hat
 */

import { Entity } from '@backstage/catalog-model';
import {
  defaultBranchFromEntity,
  projectLookupKey,
  projectLookupKeyFromEntity,
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

  it('returns null when entity has no repo URL', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'no-repo' },
      spec: { type: 'git-repository' },
    };
    expect(projectLookupKeyFromEntity(entity)).toBeNull();
  });
});
