import type { IndexedArtifact } from './ContentStore';
import { groupImages } from './groupImages';

const image = (
  digest: string,
  tags: string[],
  tagTimestamps?: Record<string, string>,
): IndexedArtifact => ({
  ref: `reg/repo@${digest}`,
  registry: 'reg',
  repository: 'repo',
  digest,
  type: 'execution-environment',
  tags,
  tagTimestamps,
  pullReference: digest,
  contentsKnown: false,
  classification: {
    type: 'execution-environment',
    signals: [],
    readsContentManifest: true,
  },
});

it('uses natural descending tags, with latest last, when timestamps are absent or invalid', () => {
  const artifacts = [
    image('a', ['latest', '2.0']),
    image('b', ['10.0'], { '10.0': 'invalid' }),
    image('c', []),
  ];
  expect(groupImages(artifacts, artifacts)[0]).toMatchObject({
    digest: 'b',
    tags: ['10.0', '2.0', 'latest'],
  });
});

it('prefers the newest valid per-tag timestamp over tag order', () => {
  const artifacts = [
    image('a', ['10.0'], { '10.0': '2026-01-01' }),
    image('b', ['2.0', '1.0'], { '1.0': '2026-03-01', '2.0': '2026-02-01' }),
  ];
  expect(groupImages(artifacts, artifacts)[0].digest).toBe('b');
});

it('keeps untagged-only groups and isolates identical repositories in different registries', () => {
  const artifacts = [
    image('a', []),
    image('b', []),
    { ...image('c', ['1']), registry: 'other' },
  ];
  expect(groupImages(artifacts, artifacts).map(a => a.digest)).toEqual([
    'a',
    'c',
  ]);
});

it('unions tags without duplicates, without mutating the indexed artifacts', () => {
  const artifacts = [image('a', ['latest']), image('b', ['latest', '2'])];
  expect(groupImages(artifacts, artifacts)[0].tags).toEqual(['2', 'latest']);
  expect(artifacts[0].tags).toEqual(['latest']);
});
