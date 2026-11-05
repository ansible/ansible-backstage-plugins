import { Entity } from '@backstage/catalog-model';
import { PaginatedEntityCache, BaseCacheState } from '../common/cache';
import { getRepoHost, getRepoHostName } from './scmUtils';

export interface GitReposCacheState extends BaseCacheState {
  allSources: Array<{ value: string; label: string }>;
}

function getUniqueSources(
  entities: Entity[],
): Array<{ value: string; label: string }> {
  const hostToLabel = new Map<string, string>();
  for (const entity of entities) {
    const host = getRepoHost(entity);
    if (host && !hostToLabel.has(host)) {
      hostToLabel.set(host, getRepoHostName(entity));
    }
  }
  return Array.from(hostToLabel.entries())
    .sort((a, b) =>
      a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }),
    )
    .map(([value, label]) => ({ value, label }));
}

export const gitReposCache = new PaginatedEntityCache<
  GitReposCacheState,
  Array<{ value: string; label: string }>
>({
  entityFilter: { kind: 'Component', 'spec.type': 'git-repository' },
  extractFilters: getUniqueSources,
  buildState: (base, sources) => ({
    ...base,
    allSources: [{ value: 'All', label: 'All' }, ...sources],
  }),
  createEmptyState: () => ({
    entities: [],
    totalServerItems: 0,
    loadedOffset: 0,
    isFullyLoaded: false,
    allSources: [{ value: 'All', label: 'All' }],
    lastUpdated: Date.now(),
    error: null,
  }),
});
