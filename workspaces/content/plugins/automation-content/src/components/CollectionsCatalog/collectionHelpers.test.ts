import type { Collection } from '../../api';
import {
  collectionHref,
  compareVersions,
  groupCollections,
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
