import type {
  DiscoveredGalaxyFile,
  AnsibleGitContentsSourceConfig,
  CollectionIdentifier,
  RepositoryInfo,
} from './types';

export interface CollectionParserOptions {
  galaxyFile: DiscoveredGalaxyFile;
  sourceConfig: AnsibleGitContentsSourceConfig;
  sourceLocation: string;
}

export interface RepositoryParserOptions {
  repository: RepositoryInfo;
  sourceConfig: AnsibleGitContentsSourceConfig;
  collectionCount: number;
  collectionEntityNames?: string[];
}

export function sanitizeHostName(hostName: string): string {
  return hostName
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/(^-)|(-$)/g, '');
}

export function createCollectionIdentifier(
  galaxyFile: DiscoveredGalaxyFile,
  sourceConfig: AnsibleGitContentsSourceConfig,
): CollectionIdentifier {
  return {
    scmProvider: sourceConfig.scmProvider,
    hostName: sanitizeHostName(sourceConfig.hostName),
    host: sourceConfig.host || getDefaultHost(sourceConfig.scmProvider),
    organization: sourceConfig.organization,
    namespace: galaxyFile.metadata.namespace,
    name: galaxyFile.metadata.name,
    version: galaxyFile.metadata.version,
  };
}

export function createCollectionKey(identifier: CollectionIdentifier): string {
  return `${identifier.scmProvider}:${identifier.hostName}:${identifier.organization}:${identifier.namespace}.${identifier.name}@${identifier.version}`;
}

export function getDefaultHost(scmProvider: 'github' | 'gitlab'): string {
  return scmProvider === 'github' ? 'github.com' : 'gitlab.com';
}

export function generateSourceId(
  sourceConfig: AnsibleGitContentsSourceConfig,
): string {
  const sanitize = (s: string) =>
    s.toLowerCase().replaceAll(/[^a-z0-9-]/g, '-');

  return `${sanitize(sourceConfig.env)}:${sanitize(sourceConfig.scmProvider)}:${sanitize(sourceConfig.hostName)}:${sanitize(sourceConfig.organization)}`;
}

export function sanitizeEntityName(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/(^-)|(-$)/g, '')
    .substring(0, 63);
}

export function generateCollectionEntityName(
  galaxyFile: DiscoveredGalaxyFile,
  sourceConfig: AnsibleGitContentsSourceConfig,
): string {
  const { metadata } = galaxyFile;
  const hostName = sanitizeHostName(sourceConfig.hostName);
  return sanitizeEntityName(
    `${metadata.namespace}-${metadata.name}-${metadata.version}-${sourceConfig.scmProvider}-${hostName}`,
  );
}

export function generateRepositoryEntityName(
  repository: RepositoryInfo,
  sourceConfig: AnsibleGitContentsSourceConfig,
): string {
  const hostName = sanitizeHostName(sourceConfig.hostName);
  return sanitizeEntityName(
    `${repository.fullPath}-${sourceConfig.scmProvider}-${hostName}`,
  );
}

export function createRepositoryKey(
  repository: RepositoryInfo,
  sourceConfig: AnsibleGitContentsSourceConfig,
): string {
  const hostName = sanitizeHostName(sourceConfig.hostName);
  return `${sourceConfig.scmProvider}:${hostName}:${repository.fullPath}`;
}

export function parseDependencies(
  dependencies: Record<string, string> | undefined,
): Array<{ namespace: string; name: string; version: string }> {
  if (!dependencies) {
    return [];
  }

  return Object.entries(dependencies).map(([fullName, version]) => {
    const [namespace, name] = fullName.split('.');
    return {
      namespace: namespace || '',
      name: name || fullName,
      version,
    };
  });
}

export function createDependencyRelations(
  dependencies: Record<string, string> | undefined,
): string[] {
  if (!dependencies) {
    return [];
  }

  return Object.keys(dependencies).map(fullName => {
    const entityName = fullName.toLowerCase().replaceAll('.', '-');
    return `component:default/${entityName}`;
  });
}
