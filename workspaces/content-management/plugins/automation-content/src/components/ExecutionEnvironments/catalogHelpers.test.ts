import {
  definitionFileHref,
  definitionFileName,
  environmentHref,
  imageContentsSummary,
  imageSourceLabel,
  matchesEnvironment,
  relativeTime,
  sortRepositoryTagsNewestFirst,
  STALE_AFTER_MS,
  syncStateLabel,
  syncStatusTone,
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

it.each([
  ['Available', 'success'],
  ['Failed', 'danger'],
  ['Stale', 'warning'],
  ['Syncing', 'info'],
  ['Unknown', 'info'],
])('uses the shared image status tone for %s', (status, tone) => {
  expect(syncStatusTone(status)).toBe(tone);
});

it.each([
  ['registry', 'component:default/ee', 'Definition file'],
  ['registry', undefined, 'External registry'],
  ['', undefined, 'Definition file'],
])('labels image sources consistently for %s / %s', (registry, ref, label) => {
  expect(imageSourceLabel(registry, ref)).toBe(label);
});

it('round trips slashes and digest in immutable navigation', () => {
  const href = environmentHref('/images', image.ref);
  expect(decodeURIComponent(href.slice('/images/'.length))).toBe(image.ref);
  expect(href).toContain('%2F');
});

it('orders repository tags by push time and defines the no-time fallback', () => {
  const tags = [
    {
      tag: 'latest',
      digest: 'sha256:latest',
      ref: 'registry/repo@sha256:latest',
    },
    {
      tag: 'v10',
      digest: 'sha256:ten',
      ref: 'registry/repo@sha256:ten',
      lastModified: '2026-11-01T00:00:00.000Z',
    },
    {
      tag: 'v2',
      digest: 'sha256:two',
      ref: 'registry/repo@sha256:two',
      lastModified: '2026-11-08T00:00:00.000Z',
    },
  ];
  expect(sortRepositoryTagsNewestFirst(tags).map(tag => tag.tag)).toEqual([
    'v2',
    'v10',
    'latest',
  ]);

  expect(
    sortRepositoryTagsNewestFirst(
      tags.map(tag => ({ ...tag, lastModified: undefined })),
    ).map(tag => tag.tag),
  ).toEqual(['v10', 'v2', 'latest']);
});

it('builds a definition details route from a stable component ref', () => {
  expect(
    definitionFileHref('/content/ee/', 'component:default/networking-ee'),
  ).toBe('/content/ee/catalog/default/networking-ee');
  expect(
    definitionFileHref('/content/ee', 'component:team+one/networking+ee'),
  ).toBe('/content/ee/catalog/team%2Bone/networking%2Bee');
  expect(definitionFileName('component:default/networking-ee')).toBe(
    'networking-ee',
  );
});

it('omits definition routes for missing, malformed, or non-component refs', () => {
  expect(definitionFileHref('/content/ee', '')).toBeUndefined();
  expect(definitionFileHref('/content/ee', 'networking-ee')).toBeUndefined();
  expect(
    definitionFileHref('/content/ee', 'component:default/'),
  ).toBeUndefined();
  expect(definitionFileHref('/content/ee', 'group:default/networking')).toBe(
    undefined,
  );
  expect(
    definitionFileHref('', 'component:default/networking-ee'),
  ).toBeUndefined();
  expect(definitionFileName('invalid')).toBeUndefined();
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

it('derives syncing, failed, stale, and available reconciliation states', () => {
  jest.useFakeTimers();
  const now = new Date('2025-01-01T12:00:00.000Z');
  jest.setSystemTime(now);
  try {
    const withinThreshold = new Date(
      now.getTime() - STALE_AFTER_MS + 1,
    ).toISOString();
    const exactlyAtThreshold = new Date(
      now.getTime() - STALE_AFTER_MS,
    ).toISOString();
    const beyondThreshold = new Date(
      now.getTime() - STALE_AFTER_MS - 1,
    ).toISOString();

    expect(syncStateLabel()).toBe('Syncing');
    expect(syncStateLabel(undefined, false)).toBe('Syncing');
    expect(syncStateLabel(beyondThreshold, false)).toBe('Failed');
    expect(syncStateLabel(beyondThreshold, true)).toBe('Stale');
    expect(syncStateLabel(withinThreshold, true)).toBe('Available');
    expect(syncStateLabel(exactlyAtThreshold, true)).toBe('Available');
    expect(syncStateLabel('not-a-timestamp', true)).toBe('Stale');
    expect(syncStateLabel('', true)).toBe('Syncing');
  } finally {
    jest.useRealTimers();
  }
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
