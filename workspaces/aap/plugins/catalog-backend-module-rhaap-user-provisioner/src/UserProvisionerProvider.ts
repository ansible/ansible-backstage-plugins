import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import { NotFoundError } from '@backstage/errors';
import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
  Entity,
} from '@backstage/catalog-model';
import type {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { User } from '@ansible/aap-common';
import {
  IAAPService,
  resolveActiveOrganizations,
  toUserEntityName,
  toUserEntityRef,
  toSourceNamespace,
  toOrgGroupRef,
  toTeamGroupRef,
} from '@ansible/backstage-rhaap-common';

const PROVIDER_NAME = 'rhaap-user-provisioner';
const BACKSTAGE_NAMESPACE_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replaceAll(/\/$/g, '');
}

function validateNamespace(namespace: string, orgName: string): void {
  if (!namespace || !BACKSTAGE_NAMESPACE_REGEX.test(namespace)) {
    throw new Error(
      `Organization name "${orgName}" produces invalid Backstage namespace "${namespace}". ` +
        `Namespaces must match ${BACKSTAGE_NAMESPACE_REGEX}.`,
    );
  }
}

function createUserEntity(options: {
  baseUrl: string;
  nameSpace: string;
  user: User;
  groupMemberships: string[];
  orgNames?: string[];
  multiOrgEnabled: boolean;
}): Entity {
  const {
    baseUrl,
    user,
    nameSpace,
    groupMemberships,
    orgNames,
    multiOrgEnabled,
  } = options;
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  const finalGroupMemberships = [...groupMemberships];
  if (user.is_superuser === true) {
    finalGroupMemberships.push('group:default/aap-admins');
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const displayName = fullName
    ? `${fullName} (${user.username})`
    : user.username;

  const annotations: Record<string, string> = {
    [ANNOTATION_LOCATION]: `url:${normalizedBaseUrl}/access/users/${user.id}/details`,
    [ANNOTATION_ORIGIN_LOCATION]: `url:${normalizedBaseUrl}/access/users/${user.id}/details`,
    'ansible.com/aap-username': user.username,
    ...(multiOrgEnabled && { 'ansible.com/aap-user-id': String(user.id) }),
  };

  if (user.is_superuser !== undefined) {
    annotations['aap.platform/is_superuser'] = String(user.is_superuser);
  }
  if (orgNames && orgNames.length > 0) {
    annotations['ansible.com/organizations'] = orgNames.join(',');
  }

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: {
      namespace: nameSpace,
      name: toUserEntityName(user.username, user.id, { multiOrgEnabled }),
      title: displayName,
      annotations,
    },
    spec: {
      profile: {
        username: user.username,
        displayName,
        email: user?.email ? user.email : ' ',
      },
      memberOf: finalGroupMemberships,
    },
  };
}

function createAapAdminsGroupEntity(
  superusers: User[],
  providerName: string,
  multiOrgEnabled: boolean,
): Entity {
  const memberNames = superusers
    .filter(u => u.is_superuser === true)
    .map(u => toUserEntityRef(u.username, u.id, { multiOrgEnabled }));

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Group',
    metadata: {
      name: 'aap-admins',
      namespace: 'default',
      description:
        'Ansible Automation Platform Superusers - Dynamically managed',
      annotations: {
        [ANNOTATION_LOCATION]: `${providerName}:aap-admins`,
        [ANNOTATION_ORIGIN_LOCATION]: `${providerName}:aap-admins`,
      },
    },
    spec: {
      type: 'team',
      children: [],
      members: memberNames,
    },
  };
}

export class UserProvisionerProvider implements EntityProvider {
  private connection: EntityProviderConnection | undefined;
  private readonly ansibleService: IAAPService;
  private readonly baseUrl: string;
  private readonly orgs: string[];
  private readonly multiOrgEnabled: boolean;
  private readonly logger: LoggerService;

  constructor(options: {
    ansibleService: IAAPService;
    config: Config;
    logger: LoggerService;
  }) {
    this.ansibleService = options.ansibleService;
    this.logger = options.logger;

    this.baseUrl = options.config.getString('ansible.rhaap.baseUrl');

    // Collect all organizations across all configured catalog provider environments.
    const providerConfigs = options.config.getOptionalConfig(
      'catalog.providers.rhaap',
    );
    const allOrgs = new Set<string>();
    this.multiOrgEnabled =
      providerConfigs
        ?.keys()
        .some(
          key =>
            providerConfigs
              .getConfig(key)
              .getOptionalBoolean('multiOrgEnabled') === true,
        ) ?? false;
    if (providerConfigs) {
      for (const envKey of providerConfigs.keys()) {
        const envConfig = providerConfigs.getConfig(envKey);
        const orgs = resolveActiveOrganizations(envConfig);
        for (const org of orgs) {
          allOrgs.add(org.toLowerCase());
        }
      }
    }
    this.orgs = Array.from(allOrgs);
  }

  getProviderName(): string {
    return PROVIDER_NAME;
  }

  /** Attach the catalog connection before sign-in can provision entities through this provider. */
  connect(connection: EntityProviderConnection): Promise<void> {
    return Promise.resolve().then(() => {
      this.connection = connection;
    });
  }

  async createUser(username: string, userID: number): Promise<boolean> {
    if (!this.connection) {
      throw new NotFoundError(
        'UserProvisionerProvider: not connected to catalog yet. ' +
          'Ensure the catalog plugin is initialized before the auth plugin handles sign-in requests.',
      );
    }

    this.logger.info(
      `[${PROVIDER_NAME}]: Provisioning user "${username}" (ID: ${userID}) into catalog`,
    );

    let foundUser: User;
    let userOrgs: { name: string; id: number; groupName: string }[];
    let userTeams: {
      name: string;
      groupName: string;
      id: number;
      orgId: number;
      orgName: string;
    }[];

    try {
      [foundUser, userOrgs, userTeams] = await Promise.all([
        this.ansibleService.getUserInfoById(userID),
        this.ansibleService.getOrgsByUserId(userID, this.orgs),
        this.ansibleService.getTeamsByUserId(userID),
      ]);
    } catch (e: any) {
      throw new Error(
        `Failed to fetch user details for ${username} (ID: ${userID}): ${
          e?.message ?? ''
        }`,
      );
    }

    if (!foundUser.username || foundUser.username.trim() === '') {
      throw new Error(
        `User ${username} (ID: ${userID}) has invalid username: '${foundUser.username}'`,
      );
    }

    const isSuperuser = foundUser.is_superuser;
    const isMultiOrg = this.multiOrgEnabled;

    const matchingOrgs = userOrgs
      .filter(org => this.orgs.includes(org.name.toLowerCase()))
      .map(org => {
        const identity = { multiOrgEnabled: isMultiOrg, orgId: org.id };
        const ns = toSourceNamespace(org.name, 'aap', identity);
        validateNamespace(ns, org.name);
        return toOrgGroupRef(ns, org.name, org.id, undefined, identity);
      });

    const teamsInConfiguredOrgs = userTeams
      .filter(team => this.orgs.includes(team.orgName.toLowerCase()))
      .map(team => {
        const identity = { multiOrgEnabled: isMultiOrg, orgId: team.orgId };
        const ns = toSourceNamespace(team.orgName, 'aap', identity);
        return toTeamGroupRef(ns, team.name, team.id, undefined, identity);
      });

    const hasDirectOrgAccess = matchingOrgs.length > 0;
    const hasTeamAccess = teamsInConfiguredOrgs.length > 0;

    if (!hasDirectOrgAccess && !hasTeamAccess && !isSuperuser) {
      throw new Error(
        `User ${username} (ID: ${userID}) does not belong to any configured organizations: ${this.orgs.join(
          ', ',
        )}, is not a member of any teams in those organizations, and is not a system user.`,
      );
    }

    // Note: Order matters — teams first, then organizations (consistent with AAPEntityProvider)
    const groupMemberships: string[] = [
      ...teamsInConfiguredOrgs,
      ...matchingOrgs,
    ];

    const matchedOrgNames = userOrgs
      .filter(org => this.orgs.includes(org.name.toLowerCase()))
      .map(org => org.name);

    const userEntity = createUserEntity({
      baseUrl: this.baseUrl,
      nameSpace: 'default',
      user: foundUser,
      groupMemberships,
      orgNames: isMultiOrg ? matchedOrgNames : undefined,
      multiOrgEnabled: isMultiOrg,
    });

    const entitiesToAdd: Array<{ entity: Entity; locationKey: string }> = [
      { entity: userEntity, locationKey: this.getProviderName() },
    ];

    // Update aap-admins group when a new superuser signs in for the first time.
    if (isSuperuser) {
      try {
        const superusers = await this.ansibleService.listSystemUsers();
        const aapAdminsGroup = createAapAdminsGroupEntity(
          superusers,
          this.getProviderName(),
          isMultiOrg,
        );
        entitiesToAdd.push({
          entity: aapAdminsGroup,
          locationKey: this.getProviderName(),
        });
        this.logger.info(
          `[${PROVIDER_NAME}]: Updated aap-admins group to include new superuser "${username}"`,
        );
      } catch (groupError) {
        this.logger.warn(
          `[${PROVIDER_NAME}]: Failed to update aap-admins group for "${username}": ${groupError}`,
        );
      }
    }

    await this.connection.applyMutation({
      type: 'delta',
      added: entitiesToAdd,
      removed: [],
    });

    this.logger.info(
      `[${PROVIDER_NAME}]: Created user "${username}" with groups: ${groupMemberships.join(
        ', ',
      )}`,
    );

    return true;
  }
}
