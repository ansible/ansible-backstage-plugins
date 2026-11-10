import type { IndexedArtifact } from './ContentStore';

const groupKey = (artifact: IndexedArtifact): string =>
  JSON.stringify([artifact.registry, artifact.repository]);

/** Newest timestamp first, latest last on ties, then natural descending tag. */
export function compareTags(
  a: { tag: string; timestamp: number },
  b: { tag: string; timestamp: number },
): number {
  const left = Number.isFinite(a.timestamp) ? a.timestamp : -Infinity;
  const right = Number.isFinite(b.timestamp) ? b.timestamp : -Infinity;
  if (left !== right) return right > left ? 1 : -1;
  if (a.tag === 'latest' && b.tag !== 'latest') return 1;
  if (b.tag === 'latest' && a.tag !== 'latest') return -1;
  return b.tag.localeCompare(a.tag, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/** Catalog-only projection; the index and all digest-level operations stay intact. */
export function groupImages(
  artifacts: IndexedArtifact[],
  matches: IndexedArtifact[],
): IndexedArtifact[] {
  const matchingGroups = new Set(matches.map(groupKey));
  const groups = new Map<string, IndexedArtifact[]>();
  for (const artifact of artifacts) {
    const key = groupKey(artifact);
    if (!matchingGroups.has(key)) continue;
    const group = groups.get(key) ?? [];
    group.push(artifact);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const tags = group.flatMap(artifact =>
      artifact.tags.map(tag => ({
        tag,
        artifact,
        timestamp: Date.parse(artifact.tagTimestamps?.[tag] ?? ''),
      })),
    );
    tags.sort(compareTags);
    return {
      ...(tags[0]?.artifact ?? group[0]),
      tags: [...new Set(tags.map(entry => entry.tag))],
    };
  });
}
