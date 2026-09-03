import { Entity } from '@backstage/catalog-model';
import { CatalogApi } from '@backstage/plugin-catalog-react';
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

const REGISTRATION_REFRESH_KEY = 'gitRepos.registrationRefreshPending';
const PRIOR_TOTAL_KEY = 'gitRepos.priorTotal';
const MAX_REGISTRATION_REFRESH_ATTEMPTS = 6;

/** Baseline unknown when cache was cold or TTL-expired at registration time. */
export const UNKNOWN_GIT_REPOS_PRIOR_TOTAL = -1;

/**
 * Call before markStale on successful git-repository registration.
 * Persists baseline catalog count + pending flag for catalog entry retry.
 */
export function markGitReposRegistrationRefreshPending(): void {
  const state = gitReposCache.getState();
  const priorTotal =
    state === null
      ? UNKNOWN_GIT_REPOS_PRIOR_TOTAL
      : (state.totalServerItems ?? state.entities.length ?? 0);
  try {
    sessionStorage.setItem(PRIOR_TOTAL_KEY, String(priorTotal));
    sessionStorage.setItem(REGISTRATION_REFRESH_KEY, 'true');
  } catch {
    // SessionStorage unavailable
  }
}

export function consumeGitReposRegistrationRefreshPending(): boolean {
  try {
    const pending = sessionStorage.getItem(REGISTRATION_REFRESH_KEY) === 'true';
    if (pending) {
      sessionStorage.removeItem(REGISTRATION_REFRESH_KEY);
    }
    return pending;
  } catch {
    return false;
  }
}

export function consumeGitReposPriorTotal(): number {
  try {
    const raw = sessionStorage.getItem(PRIOR_TOTAL_KEY);
    sessionStorage.removeItem(PRIOR_TOTAL_KEY);
    if (raw === null) {
      return UNKNOWN_GIT_REPOS_PRIOR_TOTAL;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : UNKNOWN_GIT_REPOS_PRIOR_TOTAL;
  } catch {
    return UNKNOWN_GIT_REPOS_PRIOR_TOTAL;
  }
}

/** @internal test helper */
export function resetGitReposRegistrationRefreshPending(): void {
  try {
    sessionStorage.removeItem(REGISTRATION_REFRESH_KEY);
    sessionStorage.removeItem(PRIOR_TOTAL_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Refetch git-repository entities until catalog count exceeds baseline
 * (handles post-registration indexing delay).
 */
export async function refreshGitReposAfterRegistration(
  catalogApi: CatalogApi,
  priorTotal: number,
): Promise<void> {
  let observedBaseline = priorTotal;

  for (let attempt = 0; attempt < MAX_REGISTRATION_REFRESH_ATTEMPTS; attempt++) {
    gitReposCache.markStale();
    await gitReposCache.startLoading(catalogApi);

    const current = gitReposCache.getState()?.totalServerItems ?? 0;
    if (observedBaseline < 0) {
      // Cold/expired cache: lock in first fetch, then retry until count increases.
      observedBaseline = current;
    } else if (current > observedBaseline) {
      return;
    }

    if (attempt < MAX_REGISTRATION_REFRESH_ATTEMPTS - 1) {
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}
