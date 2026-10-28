import type { Collection, ContentCounts } from '../../api';

/** Grouped display identity retaining all versions and providers. */
export interface CollectionGroup {
  fqcn: string;
  namespace: string;
  name: string;
  description: string;
  versions: Collection[];
  latest: string;
  counts: ContentCounts;
  providedBy: string[];
}

/** Compare numeric versions, with releases after prereleases. */
export function compareVersions(a: string, b: string): number {
  const [ac, ap] = a.split('-', 2);
  const [bc, bp] = b.split('-', 2);
  const core = ac.localeCompare(bc, 'en', { numeric: true });
  if (core) return core;
  if (!ap && bp) return 1;
  if (ap && !bp) return -1;
  return (ap ?? '').localeCompare(bp ?? '', 'en', { numeric: true });
}

/** Union providers; counts are maxima per version, summed across versions. */
export function groupCollections(items: Collection[]): CollectionGroup[] {
  const groups = new Map<string, Collection[]>();
  for (const item of items)
    groups.set(item.fqcn, [...(groups.get(item.fqcn) ?? []), item]);
  return Array.from(groups, ([fqcn, occurrences]) => {
    const versions = new Map<string, Collection>();
    for (const item of occurrences) {
      const previous = versions.get(item.version);
      const counts = { ...previous?.counts };
      for (const key of [
        'plugins',
        'roles',
        'playbooks',
        'edaPlugins',
        'rulebooks',
      ] as const) {
        if (item.counts[key] !== undefined)
          counts[key] = Math.max(counts[key] ?? 0, item.counts[key]!);
      }
      versions.set(item.version, {
        ...item,
        description: item.description || previous?.description,
        counts,
        providedBy: [
          ...new Set([...(previous?.providedBy ?? []), ...item.providedBy]),
        ],
      });
    }
    const sorted = [...versions.values()].sort((a, b) =>
      compareVersions(b.version, a.version),
    );
    const counts: ContentCounts = {};
    for (const version of sorted) {
      for (const key of [
        'plugins',
        'roles',
        'playbooks',
        'edaPlugins',
        'rulebooks',
      ] as const) {
        if (version.counts[key] !== undefined)
          counts[key] = (counts[key] ?? 0) + version.counts[key]!;
      }
    }
    return {
      fqcn,
      namespace: sorted[0].namespace,
      name: sorted[0].name,
      description: sorted.find(v => v.description)?.description ?? '',
      versions: sorted,
      latest: sorted[0].version,
      counts,
      providedBy: [...new Set(occurrences.flatMap(v => v.providedBy))],
    };
  }).sort((a, b) => a.fqcn.localeCompare(b.fqcn));
}

/** Keep namespace and potentially dotted names as separate encoded segments. */
export function collectionHref(
  base: string,
  namespace: string,
  name: string,
): string {
  return `${base}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}
