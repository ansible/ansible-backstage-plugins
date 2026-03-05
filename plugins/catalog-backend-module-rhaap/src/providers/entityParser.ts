import {
  formatNameSpace,
  buildFileUrl,
  getDirectoryFromPath,
} from '../helpers';

import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
  Entity,
} from '@backstage/catalog-model';
import {
  Collection,
  IJobTemplate,
  Organization,
  ISurvey,
  Team,
  User,
  InstanceGroup,
} from '@ansible/backstage-rhaap-common';
import { generateTemplate } from './dynamicJobTemplate';
import {
  generateSourceId,
  generateRepositoryEntityName,
  getDefaultHost,
  sanitizeEntityName,
  sanitizeTagForBackstage,
  sanitizeHostName,
} from './ansible-collections/utils';
import type {
  CollectionParserOptions,
  RepositoryParserOptions,
} from './ansible-collections/utils';
import type { AnsibleGitContentsSourceConfig, GalaxyMetadata } from './types';

// Re export types and helpers for external use
export type {
  CollectionParserOptions,
  RepositoryParserOptions,
} from './ansible-collections/utils';
export {
  createCollectionIdentifier,
  createCollectionKey,
  generateSourceId,
  generateCollectionEntityName,
  generateRepositoryEntityName,
  createRepositoryKey,
  parseDependencies,
  createDependencyRelations,
} from './ansible-collections/utils';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replaceAll(/\/$/g, '');
}

export function organizationParser(options: {
  baseUrl: string;
  nameSpace: string;
  org: Organization;
  orgMembers: string[];
  teams: string[];
}): Entity {
  const { baseUrl, org, nameSpace, orgMembers, teams } = options;
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Group',
    metadata: {
      namespace: nameSpace,
      name: formatNameSpace(org.name),
      title: org.name,
      annotations: {
        [ANNOTATION_LOCATION]: `url:${normalizedBaseUrl}/access/organizations/${org.id}/details`,
        [ANNOTATION_ORIGIN_LOCATION]: `url:${normalizedBaseUrl}/access/organizations/${org.id}/details`,
      },
    },
    spec: {
      type: 'organization',
      children: teams,
      members: orgMembers,
    },
  };
}

export function teamParser(options: {
  baseUrl: string;
  nameSpace: string;
  team: Team;
  teamMembers: string[];
}): Entity {
  const { baseUrl, team, nameSpace, teamMembers } = options;
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Group',
    metadata: {
      namespace: nameSpace,
      name: team.groupName,
      title: team.name,
      description: team.description,
      annotations: {
        [ANNOTATION_LOCATION]: `url:${normalizedBaseUrl}/access/teams/${team.id}/details`,
        [ANNOTATION_ORIGIN_LOCATION]: `url:${normalizedBaseUrl}/access/teams/${team.id}/details`,
      },
    },
    spec: {
      type: 'team',
      children: [],
      members: teamMembers,
    },
  };
}

export function userParser(options: {
  baseUrl: string;
  nameSpace: string;
  user: User;
  groupMemberships: string[];
}): Entity {
  const { baseUrl, user, nameSpace, groupMemberships } = options;
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  // Add aap-admins group for superusers (this should always be included)
  const finalGroupMemberships = [...groupMemberships];
  if (user.is_superuser === true) {
    finalGroupMemberships.push('aap-admins');
  }

  const name =
    user.first_name?.length || user.last_name?.length
      ? `${user.first_name} ${user.last_name}`
      : user.username;

  const annotations: Record<string, string> = {
    [ANNOTATION_LOCATION]: `url:${normalizedBaseUrl}/access/users/${user.id}/details`,
    [ANNOTATION_ORIGIN_LOCATION]: `url:${normalizedBaseUrl}/access/users/${user.id}/details`,
  };

  // Add RBAC-relevant annotations
  if (user.is_superuser !== undefined) {
    annotations['aap.platform/is_superuser'] = String(user.is_superuser);
  }

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: {
      namespace: nameSpace,
      name: user.username,
      title: name,
      annotations,
    },
    spec: {
      profile: {
        username: user.username,
        displayName: name,
        email: user?.email ? user.email : ' ',
      },
      memberOf: finalGroupMemberships,
    },
  };
}

export const aapJobTemplateParser = (options: {
  baseUrl: string;
  nameSpace: string;
  job: IJobTemplate;
  survey: ISurvey | null;
  instanceGroup: InstanceGroup[];
}): Entity => {
  return generateTemplate(options);
};

export const pahCollectionParser = (options: {
  collection: Collection;
  baseUrl: string;
  sourceId: string;
}): Entity => {
  const collectionBaseUrl =
    `${normalizeBaseUrl(options.baseUrl)}/content/collections/` +
    `${options.collection.repository_name}/` +
    `${options.collection.namespace}/` +
    `${options.collection.name}`;

  const links: Array<{ url: string; title: string; icon?: string }> = [];

  if (options.collection.links?.repository) {
    links.push({
      url: options.collection.links.repository,
      title: 'Repository',
      icon: 'github',
    });
  }
  if (options.collection.links?.documentation) {
    links.push({
      url: options.collection.links.documentation,
      title: 'Documentation',
      icon: 'docs',
    });
  }
  if (options.collection.links?.homepage) {
    links.push({
      url: options.collection.links.homepage,
      title: 'Homepage',
      icon: 'web',
    });
  }
  if (options.collection.links?.issues) {
    links.push({
      url: options.collection.links.issues,
      title: 'Issues',
      icon: 'bug',
    });
  }

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',

    metadata: {
      namespace: 'default',
      // name needs to be unique across all collections
      name: `pah-${options.collection.repository_name}-${options.collection.namespace}.${options.collection.name}-${options.collection.version}`,

      title:
        options.collection.version && options.collection.version !== 'N/A'
          ? `${options.collection.namespace}.${options.collection.name} v${options.collection.version}`
          : `${options.collection.namespace}.${options.collection.name}`,

      description:
        options.collection.description ??
        `Ansible Collection: ${options.collection.namespace}.${options.collection.name}`,

      // Tags displayed in the Backstage UI (must match Backstage policy: [a-z0-9+#] and [-], max 63 chars)
      tags: [
        ...new Set(
          (options.collection.tags || [])
            .map((tag: string | { name?: string }) =>
              sanitizeTagForBackstage(tag),
            )
            .filter((s): s is string => s.length > 0),
        ),
      ],

      // Links from galaxy.yml metadata
      links: links.length > 0 ? links : undefined,

      annotations: {
        'backstage.io/source-url': `${collectionBaseUrl}/details?version=${options.collection.version}`,
        'backstage.io/view-url': `${collectionBaseUrl}/documentation?version=${options.collection.version}`,
        'backstage.io/managed-by-location': `url:${collectionBaseUrl}/details?version=${options.collection.version}`,
        'backstage.io/managed-by-origin-location': `url:${collectionBaseUrl}/details?version=${options.collection.version}`,

        'ansible.io/collection-source': 'pah',
        'ansible.io/collection-source-repository':
          options.collection.repository_name,
        'ansible.io/collection-install-url': `${collectionBaseUrl}/install?version=${options.collection.version}`,
        'ansible.io/collection-readme-format': 'html',
        'ansible.io/discovery-source-id': options.sourceId,
      },
    },
    spec: {
      type: 'ansible-collection',
      lifecycle: options.collection.version ? 'production' : 'development',
      owner: options.collection.namespace,
      system: `${options.collection.namespace}-collections`,

      collection_namespace: options.collection.namespace,
      collection_name: options.collection.name,
      collection_version: options.collection.version || '',
      collection_full_name: `${options.collection.namespace}.${options.collection.name}`,
      collection_tags: options.collection.tags || [],
      collection_dependencies: options.collection.dependencies,
      collection_description:
        options.collection.description ??
        `Ansible Collection: ${options.collection.namespace}.${options.collection.name}`,
      collection_authors: options.collection.authors || [],
      collection_readme_html: options.collection.collection_readme_html || '',
    },
  };
};

function buildMetadataLinks(
  metadata: GalaxyMetadata,
): Array<{ url: string; title: string; icon?: string }> {
  const linkConfigs: Array<{
    url: string | undefined;
    title: string;
    icon: string;
  }> = [
    { url: metadata.repository, title: 'Repository', icon: 'github' },
    { url: metadata.documentation, title: 'Documentation', icon: 'docs' },
    { url: metadata.homepage, title: 'Homepage', icon: 'web' },
    { url: metadata.issues, title: 'Issues', icon: 'bug' },
  ];

  return linkConfigs
    .filter((config): config is { url: string; title: string; icon: string } =>
      Boolean(config.url),
    )
    .map(({ url, title, icon }) => ({ url, title, icon }));
}

function buildReadmeUrl(
  metadata: GalaxyMetadata,
  sourceConfig: AnsibleGitContentsSourceConfig,
  host: string,
  repositoryFullPath: string,
  ref: string,
  galaxyFilePath: string,
): string | undefined {
  if (!metadata.readme) {
    return undefined;
  }

  const directoryPath = getDirectoryFromPath(galaxyFilePath);
  const readmePath = directoryPath
    ? `${directoryPath}/${metadata.readme}`
    : metadata.readme;

  return buildFileUrl(
    sourceConfig.scmProvider,
    host,
    repositoryFullPath,
    ref,
    readmePath,
  );
}

function buildCollectionSpecExtras(
  metadata: GalaxyMetadata,
  readmeUrl: string | undefined,
): Record<string, unknown> {
  const extras: Record<string, unknown> = {};

  if (metadata.tags && metadata.tags.length > 0) {
    extras.collection_tags = metadata.tags;
  }
  if (metadata.dependencies && Object.keys(metadata.dependencies).length > 0) {
    extras.collection_dependencies = metadata.dependencies;
  }
  if (metadata.authors && metadata.authors.length > 0) {
    extras.collection_authors = metadata.authors;
  }
  if (metadata.license) {
    extras.collection_license = Array.isArray(metadata.license)
      ? metadata.license.join(', ')
      : metadata.license;
  }
  if (readmeUrl) {
    extras.collection_readme_url = readmeUrl;
  }

  return extras;
}

export function scmCollectionParser(options: CollectionParserOptions): Entity {
  const { galaxyFile, sourceConfig, sourceLocation } = options;
  const { metadata, repository, ref, refType, path } = galaxyFile;
  const host = sourceConfig.host || getDefaultHost(sourceConfig.scmProvider);
  const hostName = sanitizeHostName(sourceConfig.hostName);

  const entityName = sanitizeEntityName(
    `${metadata.namespace}-${metadata.name}-${metadata.version}-${sourceConfig.scmProvider}-${hostName}`,
  );

  const sourceId = generateSourceId(sourceConfig);

  const sanitizedGalaxyTags = metadata.tags
    ? metadata.tags.map((t: string) => sanitizeTagForBackstage(t))
    : [];
  const tags: string[] = [
    ...sanitizedGalaxyTags,
    sourceConfig.scmProvider,
    'ansible-collection',
  ];

  const links = buildMetadataLinks(metadata);

  const galaxyFileUrl = buildFileUrl(
    sourceConfig.scmProvider,
    host,
    repository.fullPath,
    ref,
    path,
  );

  const readmeUrl = buildReadmeUrl(
    metadata,
    sourceConfig,
    host,
    repository.fullPath,
    ref,
    path,
  );

  const title =
    metadata.version && metadata.version !== 'N/A'
      ? `${metadata.namespace}.${metadata.name} v${metadata.version}`
      : `${metadata.namespace}.${metadata.name}`;

  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: entityName,
      namespace: 'default',
      title,
      description:
        metadata.description ||
        `Ansible Collection: ${metadata.namespace}.${metadata.name}`,
      annotations: {
        'backstage.io/source-location': sourceLocation,
        'backstage.io/view-url': galaxyFileUrl,
        'backstage.io/managed-by-location': `url:${galaxyFileUrl}`,
        'backstage.io/managed-by-origin-location': `url:${galaxyFileUrl}`,
        'ansible.io/scm-provider': sourceConfig.scmProvider,
        'ansible.io/scm-host': host,
        'ansible.io/scm-host-name': hostName,
        'ansible.io/scm-organization': sourceConfig.organization,
        'ansible.io/scm-repository': repository.name,
        'ansible.io/ref': ref,
        'ansible.io/ref-type': refType,
        'ansible.io/galaxy-file-path': path,
        'ansible.io/discovery-source-id': sourceId,
      },
      tags: [...new Set(tags)],
      links: links.length > 0 ? links : undefined,
    },
    spec: {
      type: 'ansible-collection',
      lifecycle: refType === 'tag' ? 'production' : 'development',
      owner: metadata.namespace,
      system: `${metadata.namespace}-collections`,
      subcomponentOf: `component:default/${generateRepositoryEntityName(repository, sourceConfig)}`,
      collection_namespace: metadata.namespace,
      collection_name: metadata.name,
      collection_version: metadata.version,
      collection_full_name: `${metadata.namespace}.${metadata.name}`,
      ...buildCollectionSpecExtras(metadata, readmeUrl),
    },
  };

  return entity;
}

export function repositoryParser(options: RepositoryParserOptions): Entity {
  const { repository, sourceConfig, collectionCount, collectionEntityNames } =
    options;

  const host = sourceConfig.host || getDefaultHost(sourceConfig.scmProvider);
  const hostName = sanitizeHostName(sourceConfig.hostName);

  const entityName = sanitizeEntityName(
    `${repository.fullPath}-${sourceConfig.scmProvider}-${hostName}`,
  );

  const sourceId = generateSourceId(sourceConfig);

  const tags: string[] = [
    'git-repository',
    sourceConfig.scmProvider,
    'ansible-collections-source',
  ];

  const repoUrl = repository.url || `https://${host}/${repository.fullPath}`;

  const links: Array<{ url: string; title: string; icon?: string }> = [
    {
      url: repoUrl,
      title: 'Repository',
      icon: sourceConfig.scmProvider === 'github' ? 'github' : 'gitlab',
    },
  ];

  const hasPart = collectionEntityNames?.map(
    (name: string) => `component:default/${name}`,
  );

  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: entityName,
      namespace: 'default',
      title: repository.fullPath,
      description:
        repository.description ||
        `Git repository containing Ansible collections: ${repository.fullPath}`,
      annotations: {
        'backstage.io/source-location': `url:${repoUrl}`,
        'backstage.io/view-url': repoUrl,
        'backstage.io/managed-by-location': `url:${repoUrl}`,
        'backstage.io/managed-by-origin-location': `url:${repoUrl}`,
        'ansible.io/scm-provider': sourceConfig.scmProvider,
        'ansible.io/scm-host': host,
        'ansible.io/scm-host-name': hostName,
        'ansible.io/scm-organization': sourceConfig.organization,
        'ansible.io/scm-repository': repository.name,
        'ansible.io/discovery-source-id': sourceId,
      },
      tags,
      links,
    },
    spec: {
      type: 'git-repository',
      lifecycle: 'production',
      owner: sourceConfig.organization,
      system: `${sourceConfig.organization}-repositories`,

      repository_name: repository.name,
      repository_default_branch: repository.defaultBranch,
      repository_collection_count: collectionCount,
      ...(collectionEntityNames &&
        collectionEntityNames.length > 0 && {
          repository_collections: collectionEntityNames,
        }),
      ...(hasPart && hasPart.length > 0 && { dependsOn: hasPart }),
    },
  };

  return entity;
}
