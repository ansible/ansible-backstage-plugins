import { Entity } from '@backstage/catalog-model';
import { compareVersions, stampLatestVersionAnnotations } from './versionUtils';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('returns positive when first is higher', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('1.1.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
  });

  it('returns negative when first is lower', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '1.1.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
  });

  it('handles different length versions', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0.1', '1.0.0')).toBeGreaterThan(0);
  });

  it('handles non-numeric parts as zero', () => {
    expect(compareVersions('1.abc.0', '1.0.0')).toBe(0);
  });
});

function makeCollectionEntity(
  fullName: string,
  version: string,
  name?: string,
): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: name || `${fullName.replace('.', '-')}-${version}`,
      namespace: 'default',
      annotations: {
        'ansible.io/discovery-source-id': 'test-source',
      },
    },
    spec: {
      type: 'ansible-collection',
      collection_full_name: fullName,
      collection_version: version,
    },
  };
}

describe('stampLatestVersionAnnotations', () => {
  it('stamps the latest version entity for each collection', () => {
    const entities = [
      makeCollectionEntity('ns.col', '1.0.0'),
      makeCollectionEntity('ns.col', '2.0.0'),
      makeCollectionEntity('ns.col', '1.5.0'),
    ];

    stampLatestVersionAnnotations(entities);

    expect(
      entities[0].metadata.annotations?.['ansible.io/is-latest-version'],
    ).toBeUndefined();
    expect(
      entities[1].metadata.annotations?.['ansible.io/is-latest-version'],
    ).toBe('true');
    expect(
      entities[2].metadata.annotations?.['ansible.io/is-latest-version'],
    ).toBeUndefined();
  });

  it('handles multiple collections independently', () => {
    const entities = [
      makeCollectionEntity('ns.alpha', '1.0.0'),
      makeCollectionEntity('ns.alpha', '2.0.0'),
      makeCollectionEntity('ns.beta', '3.0.0'),
      makeCollectionEntity('ns.beta', '1.0.0'),
    ];

    stampLatestVersionAnnotations(entities);

    expect(
      entities[0].metadata.annotations?.['ansible.io/is-latest-version'],
    ).toBeUndefined();
    expect(
      entities[1].metadata.annotations?.['ansible.io/is-latest-version'],
    ).toBe('true');
    expect(
      entities[2].metadata.annotations?.['ansible.io/is-latest-version'],
    ).toBe('true');
    expect(
      entities[3].metadata.annotations?.['ansible.io/is-latest-version'],
    ).toBeUndefined();
  });

  it('stamps single version as latest', () => {
    const entities = [makeCollectionEntity('ns.only', '1.0.0')];

    stampLatestVersionAnnotations(entities);

    expect(
      entities[0].metadata.annotations?.['ansible.io/is-latest-version'],
    ).toBe('true');
  });

  it('skips non-collection entities', () => {
    const repoEntity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'my-repo',
        namespace: 'default',
        annotations: {},
      },
      spec: {
        type: 'ansible-repository',
      },
    };

    const entities = [
      makeCollectionEntity('ns.col', '1.0.0'),
      repoEntity,
      makeCollectionEntity('ns.col', '2.0.0'),
    ];

    stampLatestVersionAnnotations(entities);

    expect(
      repoEntity.metadata.annotations?.['ansible.io/is-latest-version'],
    ).toBeUndefined();
    expect(
      entities[2].metadata.annotations?.['ansible.io/is-latest-version'],
    ).toBe('true');
  });

  it('handles empty array', () => {
    expect(() => stampLatestVersionAnnotations([])).not.toThrow();
  });

  it('handles entities without collection_full_name', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'no-fullname',
        namespace: 'default',
        annotations: {},
      },
      spec: {
        type: 'ansible-collection',
        collection_version: '1.0.0',
      },
    };

    expect(() => stampLatestVersionAnnotations([entity])).not.toThrow();
    expect(
      entity.metadata.annotations?.['ansible.io/is-latest-version'],
    ).toBeUndefined();
  });
});
