import type {
  LoggerService,
  SchedulerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';

import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import type { Config } from '@backstage/config';

import { InputError, isError, NotFoundError } from '@backstage/errors';
import { Entity } from '@backstage/catalog-model';
import {
  IAAPService,
  RoleAssignments,
  User,
  Users,
  Team,
  Organization,
} from '@ansible/backstage-rhaap-common';
import { readAapApiEntityConfigs } from './config';
import { organizationParser, teamParser, userParser } from './entityParser';
import { AapConfig } from './types';

export class AAPEntityProvider implements EntityProvider {
  private readonly env: string;
  private readonly baseUrl: string;
  private readonly orgs: string[];
  private readonly logger: LoggerService;
  private readonly ansibleServiceRef: IAAPService;
  private readonly scheduleFn: () => Promise<void>;
  private connection?: EntityProviderConnection;

  static pluginLogName = 'plugin-catalog-rhaap';
  static syncEntity = 'orgsUsersTeams';

  static fromConfig(
    config: Config,
    ansibleServiceRef: IAAPService,
    options: {
      logger: LoggerService;
      schedule?: SchedulerServiceTaskRunner;
      scheduler?: SchedulerService;
    },
  ): AAPEntityProvider[] {
    const { logger } = options;
    const providerConfigs = readAapApiEntityConfigs(config, this.syncEntity);
    logger.info(`Init AAP entity provider from config.`);
    return providerConfigs.map(providerConfig => {
      let taskRunner;
      if ('scheduler' in options && providerConfig.schedule) {
        taskRunner = options.scheduler!.createScheduledTaskRunner(
          providerConfig.schedule,
        );
      } else if ('schedule' in options) {
        taskRunner = options.schedule;
      } else {
        logger.info(
          `[${this.pluginLogName}]:No schedule provided via config for AAP Resource Entity Provider:${providerConfig.id}.`,
        );
        throw new InputError(
          `No schedule provided via config for AapResourceEntityProvider:${providerConfig.id}.`,
        );
      }
      if (!taskRunner) {
        logger.info(
          `[${this.pluginLogName}]:No schedule provided via config for AAP Resource Entity Provider:${providerConfig.id}.`,
        );
        throw new InputError(
          `No schedule provided via config for AapResourceEntityProvider:${providerConfig.id}.`,
        );
      }
      return new AAPEntityProvider(
        providerConfig,
        config,
        logger,
        taskRunner,
        ansibleServiceRef,
      );
    });
  }

  private constructor(
    providerConfig: AapConfig,
    _config: Config,
    logger: LoggerService,
    taskRunner: SchedulerServiceTaskRunner,
    ansibleServiceRef: IAAPService,
  ) {
    this.env = providerConfig.id;
    this.baseUrl = providerConfig.baseUrl;
    this.orgs = providerConfig.organizations;
    this.logger = logger.child({
      target: this.getProviderName(),
    });
    this.ansibleServiceRef = ansibleServiceRef;

    this.scheduleFn = this.createScheduleFn(taskRunner);
  }

  createScheduleFn(
    taskRunner: SchedulerServiceTaskRunner,
  ): () => Promise<void> {
    return async () => {
      const taskId = `${this.getProviderName()}:run`;
      this.logger.info('[${this.pluginLogName}]:Creating Schedule function.');
      return taskRunner.run({
        id: taskId,
        fn: async () => {
          try {
            await this.run();
          } catch (error) {
            if (isError(error)) {
              // Ensure that we don't log any sensitive internal data:
              this.logger.error(
                `Error while syncing resources from AAP ${this.baseUrl}`,
                {
                  // Default Error properties:
                  name: error.name,
                  message: error.message,
                  stack: error.stack,
                  // Additional status code if available:
                  status: (error.response as { status?: string })?.status,
                },
              );
            }
          }
        },
      });
    };
  }

  getProviderName(): string {
    return `AapEntityProvider:${this.env}`;
  }

  async run(): Promise<boolean> {
    if (!this.connection) {
      throw new NotFoundError('Not initialized');
    }
    let groupCount = 0;
    let usersCount = 0;
    let userRoleAssignments: RoleAssignments;
    let systemUsers = [] as Users;
    const entities: Entity[] = [];
    let orgsDetails: Array<{
      organization: Organization;
      teams: Team[];
      users: User[];
    }> = [];

    let error = false;
    try {
      orgsDetails = await this.ansibleServiceRef.getOrganizations(true);
      this.logger.info(
        `[${AAPEntityProvider.pluginLogName}]: Fetched ${
          Object.keys(orgsDetails).length
        } organizations.`,
      );
    } catch (e: any) {
      this.logger.error(
        `[${
          AAPEntityProvider.pluginLogName
        }]: Error while fetching organizations. ${e?.message ?? ''}`,
      );
      error = true;
    }

    try {
      userRoleAssignments =
        await this.ansibleServiceRef.getUserRoleAssignments();
      this.logger.info(
        `[${AAPEntityProvider.pluginLogName}]: Fetched ${
          Object.keys(userRoleAssignments).length
        } user role assignments.`,
      );
    } catch (e: any) {
      this.logger.error(
        `[${AAPEntityProvider.pluginLogName}]: Error while fetching users. ${
          e?.message ?? ''
        }`,
      );
      error = true;
    }

    try {
      systemUsers = await this.ansibleServiceRef.listSystemUsers();
      this.logger.info(
        `[${AAPEntityProvider.pluginLogName}]: Fetched ${systemUsers.length} system users.`,
      );
    } catch (e: any) {
      this.logger.error(
        `[${
          AAPEntityProvider.pluginLogName
        }]: Error while fetching system users. ${e?.message ?? ''}`,
      );
      error = true;
    }

    if (!error) {
      for (const org of Object.values(orgsDetails)) {
        const orgTeams = org.teams
          ? Object.values(org.teams).map(team => team.groupName)
          : [];
        const orgUsers = org.users
          ? (Object.values(org.users)
              .map(user => {
                if (user.is_orguser && !user.is_orguser) {
                  return null;
                }
                return user.username;
              })
              .filter(user => !!user) as string[])
          : [];

        entities.push(
          organizationParser({
            baseUrl: this.baseUrl,
            nameSpace: 'default',
            org: org.organization,
            orgMembers: orgUsers,
            teams: orgTeams,
          }),
        );
        groupCount += 1;
      }

      for (const team of Object.values(orgsDetails).flatMap(org =>
        Object.values(org.teams || {}),
      )) {
        entities.push(
          teamParser({
            baseUrl: this.baseUrl,
            nameSpace: 'default',
            team: team as unknown as Team,
            teamMembers: [],
          }),
        );
        groupCount += 1;
      }

      // Process users in batches to avoid overwhelming the AAP server
      const allUsers = orgsDetails.flatMap(org => org.users || []);
      const batchSize = 100; // Process 100 users at a time
      this.logger.info(
        `[${AAPEntityProvider.pluginLogName}]: Processing ${allUsers.length} users in batches of ${batchSize}`,
      );

      for (let i = 0; i < allUsers.length; i += batchSize) {
        const batch = allUsers.slice(i, i + batchSize);
        this.logger.debug(
          `[${AAPEntityProvider.pluginLogName}]: Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allUsers.length / batchSize)}`,
        );

        const batchResults = await Promise.allSettled(
          batch.map(async (user: User) => {
            try {
              const userTeams = await this.ansibleServiceRef.getTeamsByUserId(
                user.id,
              );
              const userMembers: string[] = [];
              for (const team of userTeams) {
                let matched = false;
                for (const org of orgsDetails) {
                  const matchingTeam = org.teams.find(t => t.id === team.id);
                  if (matchingTeam) {
                    userMembers.push(matchingTeam.groupName);
                    matched = true;
                    break;
                  }
                }

                if (!matched) {
                  for (const org of orgsDetails) {
                    if (org.organization.id === team.orgId) {
                      if (org.organization.namespace) {
                        userMembers.push(org.organization.namespace);
                      }
                      break;
                    }
                  }
                }
              }
              const userEntity = userParser({
                baseUrl: this.baseUrl,
                nameSpace: 'default',
                user: user as User,
                groupMemberships: userMembers,
              });
              entities.push(userEntity);
              return { success: true, user };
            } catch (userError) {
              this.logger.warn(
                `[${AAPEntityProvider.pluginLogName}]: Failed to process user ${user.username} (ID: ${user.id}): ${userError}`,
              );
              return { success: false, user, error: userError };
            }
          }),
        );

        // Count successful users from this batch
        const successfulUsers = batchResults.filter(
          result => result.status === 'fulfilled' && result.value.success,
        ).length;
        usersCount += successfulUsers;

        // Small delay between batches to avoid overwhelming the server
        if (i + batchSize < allUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Process system users with the same batched approach
      this.logger.info(
        `[${AAPEntityProvider.pluginLogName}]: Processing ${systemUsers.length} system users in batches of ${batchSize}`,
      );

      for (let i = 0; i < systemUsers.length; i += batchSize) {
        const batch = systemUsers.slice(i, i + batchSize);

        const batchResults = await Promise.allSettled(
          batch.map(async (user: User) => {
            try {
              const userTeams = await this.ansibleServiceRef.getTeamsByUserId(
                user.id,
              );
              const userMembers: string[] = [];
              for (const team of userTeams) {
                for (const org of orgsDetails) {
                  const matchingTeam = org.teams.find(t => t.id === team.id);
                  if (matchingTeam) {
                    userMembers.push(matchingTeam.groupName);
                    break;
                  }
                }
              }
              const userEntity = userParser({
                baseUrl: this.baseUrl,
                nameSpace: 'default',
                user: user as User,
                groupMemberships: userMembers,
              });
              entities.push(userEntity);
              return { success: true, user };
            } catch (systemUserError) {
              this.logger.warn(
                `[${AAPEntityProvider.pluginLogName}]: Failed to process system user ${user.username} (ID: ${user.id}): ${systemUserError}`,
              );
              return { success: false, user, error: systemUserError };
            }
          }),
        );

        // Count successful system users from this batch
        const successfulSystemUsers = batchResults.filter(
          result => result.status === 'fulfilled' && result.value.success,
        ).length;
        usersCount += successfulSystemUsers;

        // Small delay between batches
        if (i + batchSize < systemUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // 🚀 DYNAMIC RBAC: Create aap-admins group with current superusers as members
      const aapAdminsGroup = this.createAapAdminsGroup(systemUsers);
      entities.push(aapAdminsGroup);

      await this.connection.applyMutation({
        type: 'full',
        entities: entities.map(entity => ({
          entity,
          locationKey: this.getProviderName(),
        })),
      });

      this.logger.info(
        `[${
          AAPEntityProvider.pluginLogName
        }]: Refreshed ${this.getProviderName()}: ${groupCount} groups added.`,
      );
      this.logger.info(
        `[${
          AAPEntityProvider.pluginLogName
        }]: Refreshed ${this.getProviderName()}: ${usersCount} users added.`,
      );
    }
    return !error;
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.scheduleFn();
  }

  async createSingleUser(username: string, userID: number): Promise<boolean> {
    if (!this.connection) {
      throw new NotFoundError('Not initialized');
    }

    let error = false;
    try {
      this.logger.info(
        `Checking for user ${userID} in configured organizations`,
      );

      // get user's information and memberships in parallel
      let foundUser: User;
      let userOrgs: { name: string; groupName: string }[];
      let userTeams: {
        name: string;
        groupName: string;
        id: number;
        orgId: number;
        orgName: string;
      }[];

      try {
        [foundUser, userOrgs, userTeams] = await Promise.all([
          this.ansibleServiceRef.getUserInfoById(userID),
          this.ansibleServiceRef.getOrgsByUserId(userID),
          this.ansibleServiceRef.getTeamsByUserId(userID),
        ]);
        this.logger.info(`User ${username} details fetched successfully`);
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

      // check if user is a superuser
      const isSuperuser = foundUser.is_superuser;

      // Process user organizations and teams
      const userOrgNames = userOrgs.map(org => org.name.toLowerCase());
      const matchingOrgs = userOrgs
        .filter(org => this.orgs.includes(org.name.toLowerCase()))
        .map(org => org.groupName);

      const teamsInConfiguredOrgs = userTeams
        .filter(team => this.orgs.includes(team.orgName.toLowerCase()))
        .map(team => team.name);

      const hasDirectOrgAccess = matchingOrgs.length > 0;
      const hasTeamAccess = teamsInConfiguredOrgs.length > 0;

      if (!hasDirectOrgAccess && !hasTeamAccess && !isSuperuser) {
        throw new Error(
          `User ${username} (ID: ${userID}) does not belong to any configured organizations: ${this.orgs.join(
            ', ',
          )}, is not a member of any teams in those organizations, and is not a system user.`,
        );
      }

      // Build user memberships efficiently (avoiding duplicate API calls)
      // Note: Order matters for tests - teams first, then organizations
      // Note: userParser will automatically add 'aap-admins' for superusers
      const userMembers: string[] = [...teamsInConfiguredOrgs, ...matchingOrgs];

      // Log access type and superuser status
      if (hasDirectOrgAccess) {
        this.logger.info(
          `User ${username} found in organizations: ${userOrgNames.filter(orgName => this.orgs.includes(orgName)).join(', ')}`,
        );
      } else if (hasTeamAccess) {
        this.logger.info(
          `User ${username} not in configured organizations but found in teams: ${teamsInConfiguredOrgs.join(
            ', ',
          )}`,
        );
      } else if (isSuperuser) {
        this.logger.info(
          `User ${username} not in configured organizations or teams but found as system user`,
        );
      }

      if (isSuperuser) {
        this.logger.info(
          `User ${username} is a superuser - added to aap-admins group`,
        );
      }

      const userEntity = userParser({
        baseUrl: this.baseUrl,
        nameSpace: 'default',
        user: foundUser,
        groupMemberships: userMembers,
      });

      const entitiesToAdd = [
        {
          entity: userEntity,
          locationKey: this.getProviderName(),
        },
      ];

      // 🚀 DYNAMIC RBAC: Update aap-admins group if user is a superuser
      if (isSuperuser) {
        const aapAdminsGroup = await this.applyAapAdminsGroupUpdate(
          'to include new superuser',
          username,
        );
        if (aapAdminsGroup) {
          entitiesToAdd.push({
            entity: aapAdminsGroup,
            locationKey: this.getProviderName(),
          });
        }
      }

      await this.connection.applyMutation({
        type: 'delta',
        added: entitiesToAdd,
        removed: [],
      });

      this.logger.info(
        `[${
          AAPEntityProvider.pluginLogName
        }]: Created user ${username} with groups: ${userMembers.join(', ')}`,
      );
    } catch (e: any) {
      this.logger.error(
        `[${
          AAPEntityProvider.pluginLogName
        }]: Error creating user ${username}. ${e?.message ?? ''}`,
      );
      error = true;
      throw e;
    }

    return !error;
  }

  /**
   * Fetches only superusers for aap-admins group creation
   * ⚡ OPTIMIZED: Only fetches what's needed for superuser detection
   */
  private async getSuperusers(): Promise<User[]> {
    // listSystemUsers already filters by is_superuser=true, so this gets ALL superusers
    return await this.ansibleServiceRef.listSystemUsers();
  }

  /**
   * Applies aap-admins group update to the catalog
   * ⚡ OPTIMIZED: Only fetches superusers, not all organization users
   * Handles errors gracefully and provides consistent logging
   */
  private async applyAapAdminsGroupUpdate(
    context: string,
    username?: string,
  ): Promise<Entity | null> {
    try {
      // Only fetch superusers for aap-admins group - much more efficient!
      const superusers = await this.getSuperusers();
      const aapAdminsGroup = this.createAapAdminsGroup(superusers);
      this.logger.info(
        `Updated aap-admins group ${context}${username ? ` for ${username}` : ''}`,
      );
      return aapAdminsGroup;
    } catch (groupError) {
      this.logger.warn(
        `Failed to update aap-admins group ${context}${username ? ` for ${username}` : ''}: ${groupError}`,
      );
      return null;
    }
  }

  /**
   * Create the aap-admins group dynamically with all current AAP superusers
   * This handles both adding new admins and removing users who are no longer admins
   */
  private createAapAdminsGroup(allUsers: User[]): Entity {
    // Find all current AAP superusers
    const currentSuperusers = allUsers.filter(
      user => user.is_superuser === true,
    );
    const memberNames = currentSuperusers.map(
      user => `user:default/${user.username}`,
    );

    this.logger.info(
      `🚀 Creating aap-admins group with ${memberNames.length} current superusers: ${memberNames.join(', ')}`,
    );

    // Create group entity with dynamic member list
    const groupEntity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Group',
      metadata: {
        name: 'aap-admins',
        namespace: 'default',
        description:
          'Ansible Automation Platform Superusers - Dynamically managed',
        annotations: {
          'backstage.io/managed-by-location': `${this.getProviderName()}:${this.env}`,
          'backstage.io/managed-by-origin-location': `${this.getProviderName()}:${this.env}`,
          'aap.platform/managed': 'true',
          'aap.platform/last-sync': new Date().toISOString(),
        },
      },
      spec: {
        type: 'team',
        profile: {
          displayName: 'AAP Administrators',
          description:
            'Automatically assigned AAP superusers with RBAC admin access',
        },
        children: [],
        members: memberNames, // This will update automatically on each sync
      },
    };

    return groupEntity;
  }

  // Note: Admin access is now handled via dynamic aap-admins group membership
  // No separate API-based assignment needed
}
