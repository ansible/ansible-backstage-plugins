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
  host?: string;
  organization?: string;
}

export interface ParsedSourceInfo {
  scmProvider: string;
  host: string;
  organization: string;
}

export function parseSourceId(sourceId: string): ParsedSourceInfo {
  const parts = sourceId.split('-');
  const scmProvider = parts[0];
  let hostParts: string[] = [];
  let orgParts: string[] = [];

  // common TLDs to detect the end of host portion
  const knownTLDs = new Set([
    'com',
    'net',
    'org',
    'io',
    'dev',
    'co',
    'edu',
    'gov',
    'uk',
    'de',
    'fr',
    'jp',
    'cn',
    'au',
    'ca',
    'in',
    'br',
    'local',
    'internal',
    'corp',
    'lan',
  ]);

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (knownTLDs.has(part)) {
      hostParts = parts.slice(1, i + 1);
      orgParts = parts.slice(i + 1);
      break;
    }
  }

  if (hostParts.length === 0) {
    hostParts = parts.slice(1, 3);
    orgParts = parts.slice(3);
  }

  return {
    scmProvider,
    host: hostParts.join('.'),
    organization: orgParts.join('-'),
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
    if (!tree[info.scmProvider][info.host]) {
      tree[info.scmProvider][info.host] = [];
    }
    tree[info.scmProvider][info.host].push(info.organization);
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
  if (filter.host && providerInfo.host !== filter.host) {
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
    if (f.host) parts.push(`host=${f.host}`);
    if (f.organization) parts.push(`org=${f.organization}`);
    return parts.length > 0 ? `{${parts.join(', ')}}` : 'all';
  });

  return `filters: [${filterDescriptions.join(', ')}]`;
}
