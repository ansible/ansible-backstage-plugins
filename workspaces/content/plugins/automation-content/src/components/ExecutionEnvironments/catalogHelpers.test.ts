import { environmentHref, matchesEnvironment } from './catalogHelpers';
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
