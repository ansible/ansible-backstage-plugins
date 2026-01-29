import { Entity } from '@backstage/catalog-model';
import type {
  DiscoveredGalaxyFile,
  AnsibleCollectionSourceConfig,
  CollectionIdentifier,
} from './types';

export interface CollectionParserOptions {
  galaxyFile: DiscoveredGalaxyFile;
  sourceConfig: AnsibleCollectionSourceConfig;
  sourceLocation: string;
}

export function createCollectionIdentifier(
  galaxyFile: DiscoveredGalaxyFile,
  sourceConfig: AnsibleCollectionSourceConfig,
): CollectionIdentifier {
  return {
    scmProvider: sourceConfig.scmProvider,
    host: sourceConfig.host || getDefaultHost(sourceConfig.scmProvider),
    organization: sourceConfig.organization,
    namespace: galaxyFile.metadata.namespace,
    name: galaxyFile.metadata.name,
    version: galaxyFile.metadata.version,
  };
}

export function createCollectionKey(identifier: CollectionIdentifier): string {
  return `${identifier.scmProvider}:${identifier.host}:${identifier.organization}:${identifier.namespace}.${identifier.name}@${identifier.version}`;
}

function getDefaultHost(scmProvider: 'github' | 'gitlab'): string {
  return scmProvider === 'github' ? 'github.com' : 'gitlab.com';
}

export function generateSourceId(
  sourceConfig: AnsibleCollectionSourceConfig,
): string {
  const host = sourceConfig.host || getDefaultHost(sourceConfig.scmProvider);
  return `${sourceConfig.scmProvider}-${host}-${sourceConfig.organization}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
}

function buildFileUrl(
  scmProvider: 'github' | 'gitlab',
  host: string,
  repoPath: string,
  ref: string,
  filePath: string,
): string {
  if (scmProvider === 'github') {
    return `https://${host}/${repoPath}/blob/${ref}/${filePath}`;
  }
  // for gitlab
  return `https://${host}/${repoPath}/-/blob/${ref}/${filePath}`;
}

function getDirectoryFromPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : '';
}

function sanitizeEntityName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 63);
}

export function parseCollectionToEntity(
  options: CollectionParserOptions,
): Entity {
  const { galaxyFile, sourceConfig, sourceLocation } = options;
  const { metadata, repository, ref, refType, path } = galaxyFile;
  const host = sourceConfig.host || getDefaultHost(sourceConfig.scmProvider);

  const entityName = sanitizeEntityName(
    `${metadata.namespace}-${metadata.name}-${metadata.version}-${sourceConfig.scmProvider}-${host}`,
  );

  const sourceId = generateSourceId(sourceConfig);

  const tags: string[] = [];
  if (metadata.tags) {
    tags.push(
      ...metadata.tags.map(t => t.toLowerCase().replace(/[^a-z0-9-]/g, '-')),
    );
  }
  tags.push(sourceConfig.scmProvider); // add scm provider as a tag for filtering purposes in UI
  tags.push('ansible-collection'); // add ansible-collection as a tag for filtering purposes in UI

  const links: Array<{ url: string; title: string; icon?: string }> = [];

  if (metadata.repository) {
    links.push({
      url: metadata.repository,
      title: 'Repository',
      icon: 'github',
    });
  }
  if (metadata.documentation) {
    links.push({
      url: metadata.documentation,
      title: 'Documentation',
      icon: 'docs',
    });
  }
  if (metadata.homepage) {
    links.push({
      url: metadata.homepage,
      title: 'Homepage',
      icon: 'web',
    });
  }
  if (metadata.issues) {
    links.push({
      url: metadata.issues,
      title: 'Issues',
      icon: 'bug',
    });
  }

  const galaxyFileUrl = buildFileUrl(
    sourceConfig.scmProvider,
    host,
    repository.fullPath,
    ref,
    path,
  );

  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: entityName,
      namespace: 'default',
      title:
        metadata.version && metadata.version !== 'N/A'
          ? `${metadata.namespace}.${metadata.name} v${metadata.version}`
          : `${metadata.namespace}.${metadata.name}`,
      description:
        metadata.description ||
        `Ansible Collection: ${metadata.namespace}.${metadata.name}`,
      annotations: {
        'backstage.io/source-location': sourceLocation,
        'backstage.io/view-url': galaxyFileUrl,
        'backstage.io/managed-by-location': `url:${galaxyFileUrl}`,
        'backstage.io/managed-by-origin-location': `url:${galaxyFileUrl}`,
        'ansible.io/scm-provider': sourceConfig.scmProvider,
        'ansible.io/scm-host':
          sourceConfig.host || getDefaultHost(sourceConfig.scmProvider),
        'ansible.io/scm-organization': sourceConfig.organization,
        'ansible.io/scm-repository': repository.fullPath,
        'ansible.io/galaxy-namespace': metadata.namespace,
        'ansible.io/galaxy-name': metadata.name,
        'ansible.io/galaxy-version': metadata.version,
        'ansible.io/galaxy-full-name': `${metadata.namespace}.${metadata.name}`,
        'ansible.io/galaxy-ref': ref,
        'ansible.io/galaxy-ref-type': refType,
        'ansible.io/galaxy-file-path': path,
        'ansible.io/discovery-source-id': sourceId,
        ...(metadata.dependencies &&
          Object.keys(metadata.dependencies).length > 0 && {
            'ansible.io/galaxy-dependencies': JSON.stringify(
              metadata.dependencies,
            ),
          }),
        ...(metadata.authors &&
          metadata.authors.length > 0 && {
            'ansible.io/galaxy-authors': JSON.stringify(metadata.authors),
          }),
        ...(metadata.license && {
          'ansible.io/galaxy-license': Array.isArray(metadata.license)
            ? metadata.license.join(', ')
            : metadata.license,
        }),
        ...(metadata.readme && {
          'ansible.io/galaxy-readme-url': buildFileUrl(
            sourceConfig.scmProvider,
            host,
            repository.fullPath,
            ref,
            getDirectoryFromPath(path)
              ? `${getDirectoryFromPath(path)}/${metadata.readme}`
              : metadata.readme,
          ),
        }),
      },
      tags: [...new Set(tags)],
      links: links.length > 0 ? links : undefined,
    },
    spec: {
      type: 'ansible-collection',
      lifecycle: refType === 'tag' ? 'production' : 'development',
      owner: metadata.namespace,
      system: `${metadata.namespace}-collections`,
    },
  };

  return entity;
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
    const entityName = fullName.toLowerCase().replace(/\./g, '-');
    return `component:default/${entityName}`;
  });
}
