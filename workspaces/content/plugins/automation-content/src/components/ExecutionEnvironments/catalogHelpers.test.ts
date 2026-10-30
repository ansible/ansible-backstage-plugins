import {
  environmentHref,
  imageContentsSummary,
  matchesEnvironment,
  relativeTime,
} from './catalogHelpers';
import type { ExecutionEnvironment } from '../../api';

const image: ExecutionEnvironment = {
  ref: 'registry/team/image@sha256:abc',
  registry: 'registry',
  repository: 'team/image',
  digest: 'sha256:abc',
  tags: ['latest'],
  pullReference: 'registry/team/image@sha256:abc',
  contentsKnown: false,
  enumeration: { status: 'unknown', source: 'labels' },
  collections: [],
};

it('round trips slashes and digest in immutable navigation', () => {
  const href = environmentHref('/images', image.ref);
  expect(decodeURIComponent(href.slice('/images/'.length))).toBe(image.ref);
  expect(href).toContain('%2F');
});

it('does not render unknown inventories as zero or partial counts as complete', () => {
  expect(
    imageContentsSummary({ ...image, counts: { collections: 0, plugins: 0 } }),
  ).toBe('Contents unknown');
  expect(
    imageContentsSummary({
      ...image,
      contentsKnown: true,
      enumeration: { status: 'partial', source: 'labels' },
      counts: { collections: 2, plugins: 3 },
    }),
  ).toBe('Approximate: 2 collections / 3 plugins');
  expect(
    imageContentsSummary({
      ...image,
      contentsKnown: true,
      enumeration: { status: 'complete', source: 'labels' },
    }),
  ).toBe('Unknown collections / Unknown plugins');
});

it('distinguishes missing and invalid reconciliation times', () => {
  expect(relativeTime()).toBe('Never reconciled');
  expect(relativeTime('invalid')).toBe('Unknown reconciliation time');
  expect(relativeTime(new Date(Date.now() - 60000).toISOString())).toBe(
    '1 minute ago',
  );
});

it('matches provider annotations and rejects another digest', () => {
  const entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'registry-team-image-abc',
      annotations: {
        'ansible.com/registry': image.registry,
        'ansible.com/repository': image.repository,
        'ansible.com/digest': image.digest,
      },
    },
  };
  expect(matchesEnvironment(entity, image)).toBe(true);
  expect(matchesEnvironment(entity, { ...image, digest: 'sha256:def' })).toBe(
    false,
  );
});
