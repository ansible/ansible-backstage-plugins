import type { IndexedArtifact } from './ContentStore';

const groupKey = (artifact: IndexedArtifact): string =>
  JSON.stringify([artifact.registry, artifact.repository]);

/** Catalog-only projection; the index and all digest-level operations stay intact. */
export function groupImages(
  artifacts: IndexedArtifact[],
  matches: IndexedArtifact[],
  type?: string,
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
    tags.sort((a, b) => {
      const left = Number.isFinite(a.timestamp) ? a.timestamp : -Infinity;
      const right = Number.isFinite(b.timestamp) ? b.timestamp : -Infinity;
      if (left !== right) return right > left ? 1 : -1;
      if (a.tag === 'latest' && b.tag !== 'latest') return 1;
      if (b.tag === 'latest' && a.tag !== 'latest') return -1;
      return b.tag.localeCompare(a.tag, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
    return {
      ...(tags.find(entry => !type || entry.artifact.type === type)?.artifact ??
        group.find(artifact => !type || artifact.type === type) ??
        group[0]),
      tags: [...new Set(tags.map(entry => entry.tag))],
    };
  });
}
