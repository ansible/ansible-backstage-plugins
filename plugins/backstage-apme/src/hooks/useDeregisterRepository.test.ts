/*
 * Copyright Red Hat
 */

import { isManuallyRegisteredRepository } from './useDeregisterRepository';
import type { Entity } from '@backstage/catalog-model';

describe('isManuallyRegisteredRepository', () => {
  it('returns true for manually registered git repository', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-repo',
        annotations: {
          'ansible.io/registration-method': 'manual',
        },
      },
      spec: {
        type: 'git-repository',
      },
    };
    expect(isManuallyRegisteredRepository(entity)).toBe(true);
  });

  it('returns false for crawler-discovered repository', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-repo',
        annotations: {
          'ansible.io/discovery-source-id': 'github:github.com:my-org',
        },
      },
      spec: {
        type: 'git-repository',
      },
    };
    expect(isManuallyRegisteredRepository(entity)).toBe(false);
  });

  it('returns false for non-git-repository type', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-component',
        annotations: {
          'ansible.io/registration-method': 'manual',
        },
      },
      spec: {
        type: 'service',
      },
    };
    expect(isManuallyRegisteredRepository(entity)).toBe(false);
  });

  it('returns false when annotation is missing', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-repo',
      },
      spec: {
        type: 'git-repository',
      },
    };
    expect(isManuallyRegisteredRepository(entity)).toBe(false);
  });

  it('returns false when spec is missing', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-repo',
        annotations: {
          'ansible.io/registration-method': 'manual',
        },
      },
    };
    expect(isManuallyRegisteredRepository(entity)).toBe(false);
  });
});
