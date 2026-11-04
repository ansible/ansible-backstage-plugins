import type { Collection } from '../../api';
import {
  collectionHref,
  collectionIdentityFromEntity,
  collectionIdentityKey,
  collectionSourceType,
  compareVersions,
  getLatestRegistryCheck,
  groupCollections,
  registryForProviderRef,
  registriesForProviders,
  matchesCollectionSourceFilter,
} from './collectionHelpers';

const collectionFixtures: Collection[] = [
  {
    namespace: 'ns',
    name: 'dotted_name.extra',
    fqcn: 'ns.dotted_name.extra',
    version: '1.9.0',
    description: '',
    counts: { plugins: 3 },
    providedBy: ['r/ee@sha256:one'],
  },
  {
    namespace: 'ns',
    name: 'dotted_name.extra',
    fqcn: 'ns.dotted_name.extra',
    version: '1.9.0',
    description: '',
    counts: { plugins: 3 },
    providedBy: ['r/ee@sha256:two'],
  },
  {
    namespace: 'ns',
    name: 'dotted_name.extra',
    fqcn: 'ns.dotted_name.extra',
    version: '1.10.0',
    description: '',
    counts: { plugins: 4 },
    providedBy: ['r/ee@sha256:two'],
  },
];

it('groups occurrences while retaining both providers and all versions', () => {
  const [group] = groupCollections(collectionFixtures);
  expect(group.latest).toBe('1.10.0');
  expect(group.versions).toHaveLength(2);
  expect(group.versions[1].providedBy).toEqual([
    'r/ee@sha256:one',
    'r/ee@sha256:two',
  ]);
  expect(group.counts.plugins).toBe(7);
  expect(group.description).toBe('');
});

it('compares releases and encodes each path segment without splitting dotted names', () => {
  expect(compareVersions('2.0.0', '2.0.0-rc.1')).toBeGreaterThan(0);
  expect(
    collectionHref('/collections', 'name space', 'dotted_name.extra'),
  ).toBe('/collections/name%20space/dotted_name.extra');
});

it('matches catalog collection identity only from the provider annotations', () => {
  expect(
    collectionIdentityFromEntity({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'collection-ee-ns-name-1-0-0',
        annotations: {
          'ansible.com/collection': 'ns.name',
          'ansible.com/version': '1.0.0',
        },
      },
      spec: { type: 'ansible-collection' },
    }),
  ).toEqual({ fqcn: 'ns.name', version: '1.0.0' });
  expect(collectionIdentityKey('NS.Name', '1.0.0')).toBe(
    collectionIdentityKey('ns.name', '1.0.0'),
  );
  expect(
    collectionIdentityFromEntity({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'not-a-collection' },
      spec: { type: 'other' },
    }),
  ).toBeUndefined();
});

it('uses only a validated provider ref prefix that exactly matches a registry', () => {
  const registries = [
    { name: 'registry', url: 'https://registry.example.test' },
    { name: 'registry-other', url: 'https://other.example.test' },
  ];
  expect(
    registryForProviderRef('registry/team/ee@sha256:abc123', registries)?.name,
  ).toBe('registry');
  expect(
    registryForProviderRef(
      'registry-unknown/team/ee@sha256:abc123',
      registries,
    ),
  ).toBeUndefined();
  expect(
    registryForProviderRef('registry/team/ee', registries),
  ).toBeUndefined();
  expect(
    registryForProviderRef('registry/team/ee@sha256:abc/path', registries),
  ).toBeUndefined();
  expect(
    registriesForProviders(
      ['registry/team/ee@sha256:abc123', 'unknown/team/ee@sha256:def456'],
      registries,
    ).map(registry => registry.name),
  ).toEqual(['registry']);
  expect(
    collectionSourceType(['registry/team/ee@sha256:abc123'], registries),
  ).toBe('external-registry');
  expect(
    collectionSourceType(['unknown/team/ee@sha256:abc123'], registries),
  ).toBe('unknown');
  expect(
    collectionSourceType(
      ['registry/team/ee@sha256:abc123', 'unknown/team/ee@sha256:def456'],
      registries,
    ),
  ).toBe('unknown');
  expect(
    matchesCollectionSourceFilter(
      ['registry/team/ee@sha256:abc123'],
      registries,
      'external-registry',
    ),
  ).toBe(true);
  expect(
    matchesCollectionSourceFilter(
      ['unknown/team/ee@sha256:abc123'],
      registries,
      'external-registry',
    ),
  ).toBe(false);
});

it('selects the latest valid registry check time', () => {
  const registries = [
    {
      name: 'older',
      url: 'https://older.example.test',
      lastReconciledAt: '2025-01-01T00:00:00Z',
    },
    {
      name: 'newer',
      url: 'https://newer.example.test',
      lastReconciledAt: '2025-02-01T00:00:00Z',
    },
    {
      name: 'invalid',
      url: 'https://invalid.example.test',
      lastReconciledAt: 'unknown',
    },
  ];
  expect(getLatestRegistryCheck(registries)?.name).toBe('newer');
  expect(
    getLatestRegistryCheck([
      { name: 'empty', url: 'https://empty.example.test' },
    ]),
  ).toBeUndefined();
});
