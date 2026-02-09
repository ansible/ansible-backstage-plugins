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
  sanitizeHostName,
} from './ansible-collections/utils';
import type {
  CollectionParserOptions,
  RepositoryParserOptions,
} from './ansible-collections/utils';

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

export function organizationParser(options: {
  baseUrl: string;
  nameSpace: string;
  org: Organization;
  orgMembers: string[];
  teams: string[];
}): Entity {
  const { baseUrl, org, nameSpace, orgMembers, teams } = options;
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Group',
    metadata: {
      namespace: nameSpace,
      name: formatNameSpace(org.name),
      title: org.name,
      annotations: {
        [ANNOTATION_LOCATION]: `url:${baseUrl}/access/organizations/${org.id}/details`,
        [ANNOTATION_ORIGIN_LOCATION]: `url:${baseUrl}/access/organizations/${org.id}/details`,
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
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Group',
    metadata: {
      namespace: nameSpace,
      name: team.groupName,
      title: team.name,
      description: team.description,
      annotations: {
        [ANNOTATION_LOCATION]: `url:${baseUrl}/access/teams/${team.id}/details`,
        [ANNOTATION_ORIGIN_LOCATION]: `url:${baseUrl}/access/teams/${team.id}/details`,
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
    [ANNOTATION_LOCATION]: `url:${baseUrl}/access/users/${user.id}/details`,
    [ANNOTATION_ORIGIN_LOCATION]: `url:${baseUrl}/access/users/${user.id}/details`,
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

export function collectionParser(options: CollectionParserOptions): Entity {
  const { galaxyFile, sourceConfig, sourceLocation } = options;
  const { metadata, repository, ref, refType, path } = galaxyFile;
  const host = sourceConfig.host || getDefaultHost(sourceConfig.scmProvider);
  const hostName = sanitizeHostName(sourceConfig.hostName);

  const entityName = sanitizeEntityName(
    `${metadata.namespace}-${metadata.name}-${metadata.version}-${sourceConfig.scmProvider}-${hostName}`,
  );

  const sourceId = generateSourceId(sourceConfig);

  const sanitizedGalaxyTags = metadata.tags
    ? metadata.tags.map((t: string) =>
        t.toLowerCase().replaceAll(/[^a-z0-9-]/g, '-'),
      )
    : [];
  const tags: string[] = [
    ...sanitizedGalaxyTags,
    sourceConfig.scmProvider,
    'ansible-collection',
  ];

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

  let readmeUrl: string | undefined;
  if (metadata.readme) {
    const directoryPath = getDirectoryFromPath(path);
    const readmePath = directoryPath
      ? `${directoryPath}/${metadata.readme}`
      : metadata.readme;
    readmeUrl = buildFileUrl(
      sourceConfig.scmProvider,
      host,
      repository.fullPath,
      ref,
      readmePath,
    );
  }

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
        'ansible.io/scm-repository': repository.fullPath,
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
      ...(metadata.dependencies &&
        Object.keys(metadata.dependencies).length > 0 && {
          collection_dependencies: metadata.dependencies,
        }),
      ...(metadata.authors &&
        metadata.authors.length > 0 && {
          collection_authors: metadata.authors,
        }),
      ...(metadata.license && {
        collection_license: Array.isArray(metadata.license)
          ? metadata.license.join(', ')
          : metadata.license,
      }),
      ...(readmeUrl && { collection_readme_url: readmeUrl }),
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
        'ansible.io/scm-repository': repository.fullPath,
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
