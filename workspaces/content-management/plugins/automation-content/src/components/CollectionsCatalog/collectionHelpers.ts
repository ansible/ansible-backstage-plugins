import type { Collection, ContentCounts, Registry } from '../../api';
import type { Entity } from '@backstage/catalog-model';

const COLLECTION_ANNOTATION = 'ansible.com/collection';
const COLLECTION_VERSION_ANNOTATION = 'ansible.com/version';

/** Only expose navigable web sources; registry repository names remain labels. */
export function collectionSourceHref(repository?: string): string | undefined {
  if (!repository) return undefined;
  try {
    const url = new URL(repository);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

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

export function collectionIdentityKey(fqcn: string, version: string): string {
  return `${fqcn.toLowerCase()}\u0000${version}`;
}

/** Match only the collection and version annotations emitted by the OCI provider. */
export function collectionIdentityFromEntity(
  entity: Entity | undefined,
): { fqcn: string; version: string } | undefined {
  if (!entity || entity.kind.toLowerCase() !== 'component') return undefined;
  const annotations = entity.metadata.annotations ?? {};
  const fqcn = annotations[COLLECTION_ANNOTATION];
  const version = annotations[COLLECTION_VERSION_ANNOTATION];
  if (typeof fqcn !== 'string' || !fqcn || typeof version !== 'string') {
    return undefined;
  }
  return { fqcn, version };
}

/** Return a registry only when a provider reference has the backend's ref shape and exact name. */
export function registryForProviderRef(
  providerRef: string,
  registries: Registry[],
): Registry | undefined {
  const slashIndex = providerRef.indexOf('/');
  const digestIndex = providerRef.lastIndexOf('@sha256:');
  if (
    slashIndex <= 0 ||
    digestIndex <= slashIndex + 1 ||
    digestIndex + '@sha256:'.length >= providerRef.length
  ) {
    return undefined;
  }

  const repository = providerRef.slice(slashIndex + 1, digestIndex);
  const digest = providerRef.slice(digestIndex + '@sha256:'.length);
  if (!repository || digest.includes('/') || /\s/.test(providerRef)) {
    return undefined;
  }

  const name = providerRef.slice(0, slashIndex);
  return registries.find(registry => registry.name === name);
}

export function registriesForProviders(
  providerRefs: string[],
  registries: Registry[],
): Registry[] {
  const matchingNames = new Set(
    providerRefs.flatMap(ref => {
      const registry = registryForProviderRef(ref, registries);
      return registry ? [registry.name] : [];
    }),
  );
  return registries.filter(registry => matchingNames.has(registry.name));
}

export type CollectionSourceType = 'external-registry' | 'unknown';
export type CollectionSourceFilter = 'all' | CollectionSourceType;

/** Classify only provider refs whose registry prefix is verified in registry data. */
export function collectionSourceType(
  providerRefs: string[],
  registries: Registry[],
): CollectionSourceType {
  return providerRefs.length > 0 &&
    providerRefs.every(ref => registryForProviderRef(ref, registries))
    ? 'external-registry'
    : 'unknown';
}

export function matchesCollectionSourceFilter(
  providerRefs: string[],
  registries: Registry[],
  filter: CollectionSourceFilter,
): boolean {
  return (
    filter === 'all' ||
    collectionSourceType(providerRefs, registries) === filter
  );
}

export function getLatestRegistryCheck(
  registries: Registry[],
): Registry | undefined {
  return registries
    .filter(registry => {
      return (
        typeof registry.lastReconciledAt === 'string' &&
        Number.isFinite(Date.parse(registry.lastReconciledAt))
      );
    })
    .sort(
      (left, right) =>
        Date.parse(right.lastReconciledAt!) -
        Date.parse(left.lastReconciledAt!),
    )[0];
}
