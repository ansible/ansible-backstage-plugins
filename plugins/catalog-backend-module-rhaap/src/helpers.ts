import { AnsibleGitContentsProvider } from './providers/AnsibleGitContentsProvider';

export function formatNameSpace(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^\w\s]/gi, '')
    .replaceAll(/\s/g, '-');
}

export function buildFileUrl(
  scmProvider: 'github' | 'gitlab',
  host: string,
  repoPath: string,
  ref: string,
  filePath: string,
): string {
  if (scmProvider === 'github') {
    return `https://${host}/${repoPath}/blob/${ref}/${filePath}`;
  }
  // gitlab
  return `https://${host}/${repoPath}/-/blob/${ref}/${filePath}`;
}

export function getDirectoryFromPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : '';
}

export interface SyncFilter {
  scmProvider?: 'github' | 'gitlab';
  hostName?: string;
  organization?: string;
}

export function validateSyncFilter(filter: SyncFilter): string | null {
  if (!filter.scmProvider && !filter.hostName && !filter.organization) {
    return null;
  }

  if (filter.hostName && !filter.scmProvider) {
    return 'hostName requires scmProvider to be specified';
  }

  if (filter.organization) {
    if (!filter.scmProvider) {
      return 'organization requires scmProvider to be specified';
    }
    if (!filter.hostName) {
      return 'organization requires hostName to be specified';
    }
  }

  return null;
}

export interface ParsedSourceInfo {
  env: string;
  scmProvider: string;
  hostName: string;
  organization: string;
}

export function parseSourceId(sourceId: string): ParsedSourceInfo {
  const parts = sourceId.split(':');

  if (parts.length !== 4) {
    console.warn(
      `[parseSourceId] Invalid sourceId format: ${sourceId}, expected 4 parts separated by ':'`,
    );
    return {
      env: parts[0] || 'unknown',
      scmProvider: parts[1] || 'unknown',
      hostName: parts[2] || 'unknown',
      organization: parts.slice(3).join(':') || 'unknown',
    };
  }

  return {
    env: parts[0],
    scmProvider: parts[1],
    hostName: parts[2],
    organization: parts[3],
  };
}

export function providerMatchesFilter(
  providerInfo: ParsedSourceInfo,
  filter: SyncFilter,
): boolean {
  if (filter.scmProvider && providerInfo.scmProvider !== filter.scmProvider) {
    return false;
  }
  if (filter.hostName && providerInfo.hostName !== filter.hostName) {
    return false;
  }
  if (
    filter.organization &&
    providerInfo.organization !== filter.organization
  ) {
    return false;
  }
  return true;
}

export function findMatchingProviders(
  providers: AnsibleGitContentsProvider[],
  filters: SyncFilter[],
): Set<string> {
  const matchedProviderIds = new Set<string>();

  for (const filter of filters) {
    for (const provider of providers) {
      const sourceId = provider.getSourceId();
      const providerInfo = parseSourceId(sourceId);

      if (providerMatchesFilter(providerInfo, filter)) {
        matchedProviderIds.add(sourceId);
      }
    }
  }

  return matchedProviderIds;
}

export interface SyncStatus {
  sync_started: number;
  already_syncing: number;
  failed: number;
  invalid: number;
}

export type SyncResultStatus =
  | 'sync_started'
  | 'already_syncing'
  | 'failed'
  | 'invalid';

export interface SCMSyncResult {
  scmProvider: string;
  hostName: string;
  organization: string;
  providerName?: string;
  status: SyncResultStatus;
  error?: { code: string; message: string };
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
