export function formatNameSpace(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^\w\s]/gi, '')
    .replaceAll(/\s/g, '-');
}

export interface SyncStatus {
  sync_started: number;
  already_syncing: number;
  failed: number;
  invalid: number;
}

/**
 * Resolves which providers to run from repository names.
 * If repositoryNames is empty, returns all providers; otherwise splits names
 * into valid (providers to run) and invalid (not in the map).
 */
export function resolveProvidersToRun<T>(
  repositoryNames: string[],
  providerMap: Map<string, T>,
  allProviders: T[],
): { providersToRun: T[]; invalidRepositories: string[] } {
  const invalidRepositories: string[] = [];
  if (repositoryNames.length === 0) {
    return { providersToRun: allProviders, invalidRepositories };
  }
  const validNames: string[] = [];
  for (const name of repositoryNames) {
    if (providerMap.has(name)) {
      validNames.push(name);
    } else {
      invalidRepositories.push(name);
    }
  }
  const providersToRun = validNames.map(name => providerMap.get(name)!);
  return { providersToRun, invalidRepositories };
}

/** Result entry for a repository that was not found in configured providers */
export interface InvalidRepositoryResult {
  repositoryName: string;
  status: 'invalid';
  error: { code: string; message: string };
}

/**
 * Builds sync result entries for invalid (unknown) repository names.
 */
export function buildInvalidRepositoryResults(
  invalidRepositories: string[],
): InvalidRepositoryResult[] {
  return invalidRepositories.map(repositoryName => ({
    repositoryName,
    status: 'invalid' as const,
    error: {
      code: 'INVALID_REPOSITORY',
      message: `Repository '${repositoryName}' not found in configured providers`,
    },
  }));
}

/**
 * Computes the HTTP status code for the PAH collection sync response based on
 * result flags and whether the request was empty.
 */
export function getSyncResponseStatusCode(params: {
  results: { status: string }[];
  emptyRequest: boolean;
}): number {
  const { results, emptyRequest } = params;
  const hasFailures = results.some(r => r.status === 'failed');
  const hasStarted = results.some(r => r.status === 'sync_started');
  const hasInvalid = results.some(r => r.status === 'invalid');
  const allStarted =
    results.length > 0 && results.every(r => r.status === 'sync_started');
  const allSkipped =
    results.length > 0 && results.every(r => r.status === 'already_syncing');
  const allFailed =
    results.length > 0 && results.every(r => r.status === 'failed');
  const allInvalid =
    results.length > 0 && results.every(r => r.status === 'invalid');

  if (
    allInvalid ||
    emptyRequest ||
    (hasInvalid && hasFailures && !hasStarted)
  ) {
    return 400;
  }
  if (allFailed) return 500;
  if (allStarted) return 202;
  if (allSkipped) return 200;
  return 207; // Mixed results (e.g., some started + some skipped/failed/invalid)
}
