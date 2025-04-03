import { formatNameSpace } from '../helpers';

import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
  Entity,
} from '@backstage/catalog-model';
import { Team, User, Organization } from '../client';

export function OrganizationParser(options: {
  baseUrl: string;
  nameSpace: string;
  org: Organization;
  orgMembers: string[];
}): Entity {
  const { baseUrl, org, nameSpace, orgMembers } = options;
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
      children: [],
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
  const name =
    user.first_name?.length || user.last_name?.length
      ? `${user.first_name} ${user.last_name}`
      : user.username;

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: {
      namespace: nameSpace,
      name: user.username,
      title: name,
      annotations: {
        [ANNOTATION_LOCATION]: `url:${baseUrl}/access/users/${user.id}/details`,
        [ANNOTATION_ORIGIN_LOCATION]: `url:${baseUrl}/access/users/${user.id}/details`,
      },
    },
    spec: {
      profile: {
        username: user.username,
        displayName: name,
        email: user?.email ? user.email : ' ',
      },
      memberOf: groupMemberships,
    },
  };
}
