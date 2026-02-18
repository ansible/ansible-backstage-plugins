import { AnsibleGitContentsProvider } from './providers/ansible-collections';

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

export function buildSourcesTree(
  providers: AnsibleGitContentsProvider[],
): Record<string, Record<string, string[]>> {
  const tree: Record<string, Record<string, string[]>> = {};

  for (const provider of providers) {
    const info = parseSourceId(provider.getSourceId());

    if (!tree[info.scmProvider]) {
      tree[info.scmProvider] = {};
    }
    if (!tree[info.scmProvider][info.hostName]) {
      tree[info.scmProvider][info.hostName] = [];
    }
    tree[info.scmProvider][info.hostName].push(info.organization);
  }

  return tree;
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

export function buildFilterDescription(filters: SyncFilter[]): string {
  if (filters.length === 0) {
    return 'all sources';
  }

  const filterDescriptions = filters.map(f => {
    const parts: string[] = [];
    if (f.scmProvider) parts.push(`scmProvider=${f.scmProvider}`);
    if (f.hostName) parts.push(`hostName=${f.hostName}`);
    if (f.organization) parts.push(`org=${f.organization}`);
    return parts.length > 0 ? `{${parts.join(', ')}}` : 'all';
  });

  return `filters: [${filterDescriptions.join(', ')}]`;
}
