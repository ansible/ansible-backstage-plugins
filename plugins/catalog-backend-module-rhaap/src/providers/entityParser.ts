import { formatNameSpace } from '../helpers';

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

  // Build links array from galaxy.yml metadata (same style as SCM collections in PR #156)
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

      // Tags displayed in the Backstage UI tags column (sanitized for Backstage compatibility)
      tags: [
        ...new Set(
          (options.collection.tags || [])
            .filter(
              (tag): tag is string => typeof tag === 'string' && tag.length > 0,
            )
            .map(tag =>
              tag
                .toLowerCase()
                .replaceAll(/[^a-z0-9+#-]/g, '-')
                .replaceAll(/-+/g, '-')
                .replaceAll(/^-|-$/g, ''),
            )
            .filter(tag => tag.length > 0),
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
