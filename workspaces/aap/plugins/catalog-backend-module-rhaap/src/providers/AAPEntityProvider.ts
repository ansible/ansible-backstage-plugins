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

import { NotFoundError } from '@backstage/errors';
import { Entity } from '@backstage/catalog-model';
import {
  RoleAssignments,
  User,
  Users,
  Team,
  Organization,
  toOrgEntityName,
  toOrgGroupRef,
  toTeamEntityName,
  toTeamGroupRef,
  toUserEntityRef,
} from '@ansible/aap-common';
import {
  IAAPService,
  findMissingConfiguredOrganizations,
} from '@ansible/backstage-rhaap-common';
import { readAapApiEntityConfigs } from './config';
import { organizationParser, teamParser, userParser } from './entityParser';
import { resolveTaskRunner } from './helpers';
import { SyncStateTracker } from './SyncStateTracker';
import type { SignalsService } from '@backstage/plugin-signals-node';
import { AapConfig } from './types';
import { getEffectiveNamespace, validateNamespace } from '../helpers';
import { deduplicateCatalogEntities } from './deduplicateCatalogEntities';

export class AAPEntityProvider implements EntityProvider {
  private readonly env: string;
  private readonly baseUrl: string;
  private readonly orgs: string[];
  private readonly multiOrgEnabled: boolean;
  private readonly logger: LoggerService;
  private readonly ansibleServiceRef: IAAPService;
  private readonly scheduleFn: () => Promise<void>;
  private connection?: EntityProviderConnection;
  private readonly syncState = new SyncStateTracker();

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
      const taskRunner = resolveTaskRunner(
        options,
        providerConfig.schedule,
        this.pluginLogName,
        providerConfig.id,
      );
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
    this.multiOrgEnabled = providerConfig.multiOrgEnabled;
    this.logger = logger.child({
      target: this.getProviderName(),
    });
    this.ansibleServiceRef = ansibleServiceRef;

    this.scheduleFn = this.createScheduleFn(taskRunner);
  }

  createScheduleFn(
    taskRunner: SchedulerServiceTaskRunner,
  ): () => Promise<void> {
    this.logger.info('[${this.pluginLogName}]:Creating Schedule function.');
    return this.syncState.createScheduleFn(
      taskRunner,
      this.getProviderName(),
      () => this.run(),
      this.logger,
      `AAP ${this.baseUrl}`,
    );
  }

  getProviderName(): string {
    return `AapEntityProvider:${this.env}`;
  }

  getLastSyncTime(): string | null {
    return this.syncState.getLastSyncTime();
  }

  setSignals(signals: SignalsService): void {
    this.syncState.setSignals(signals, `aap-entity:${this.env}`);
  }

  getLastFailedSyncTime(): string | null {
    return this.syncState.getLastFailedSyncTime();
  }

  getLastSyncStatus(): 'success' | 'failure' | null {
    return this.syncState.getLastSyncStatus();
  }

  getLastDuplicateEntityCount(): number {
    return this.syncState.getLastDuplicateEntityCount();
  }

  getLastMissingOrganizations(): string[] {
    return this.syncState.getLastMissingOrganizations();
  }

  getIsSyncing(): boolean {
    return this.syncState.getIsSyncing();
  }

  getTaskId(): string | undefined {
    return this.syncState.getTaskId();
  }

  async run(): Promise<boolean> {
    if (!this.connection) {
      throw new NotFoundError('Not initialized');
    }

    if (!this.multiOrgEnabled) {
      for (const orgName of this.orgs) {
        validateNamespace(getEffectiveNamespace(orgName, this.orgs), orgName);
      }
    }

    this.syncState.markSyncStarted();
    try {
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
      let missingOrganizations: string[] = [];

      let error = false;
      try {
        const allOrgsDetails =
          await this.ansibleServiceRef.getOrganizations(true);
        this.logger.info(
          `[${AAPEntityProvider.pluginLogName}]: Fetched ${allOrgsDetails.length} organizations from AAP.`,
        );

        // Filter to only configured organizations
        orgsDetails = allOrgsDetails.filter(org =>
          this.orgs.includes(org.organization.name.toLowerCase()),
        );
        this.logger.info(
          `[${AAPEntityProvider.pluginLogName}]: Matched ${
            orgsDetails.length
          } configured organizations (configured: ${this.orgs.join(', ')}).`,
        );

        missingOrganizations = findMissingConfiguredOrganizations(
          this.orgs,
          allOrgsDetails.map(org => org.organization.name),
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

      if (error) {
        this.syncState.markSyncFailed();
        return false;
      }

      const isMultiOrg = this.multiOrgEnabled;

      for (const org of Object.values(orgsDetails)) {
        const orgName = org.organization.name;
        const identity = {
          multiOrgEnabled: this.multiOrgEnabled,
          orgId: org.organization.id,
        };
        const ns = getEffectiveNamespace(orgName, this.orgs, identity);
        const orgTeams = org.teams
          ? Object.values(org.teams).map(team =>
              toTeamEntityName(team.name, team.id, identity),
            )
          : [];
        const orgUsers = org.users
          ? Object.values(org.users).filter(user => user.is_orguser !== false)
          : [];

        // Users live in 'default' namespace as they can be part of multiple orgs
        const orgMemberRefs = orgUsers.map(u =>
          toUserEntityRef(u.username, u.id, identity),
        );

        entities.push(
          organizationParser({
            baseUrl: this.baseUrl,
            nameSpace: ns,
            org: org.organization,
            orgMembers: orgMemberRefs,
            teams: orgTeams,
            orgName: isMultiOrg ? orgName : undefined,
            identity,
          }),
        );
        groupCount += 1;

        // Teams belong to their org's namespace
        for (const team of Object.values(org.teams || {})) {
          entities.push(
            teamParser({
              baseUrl: this.baseUrl,
              nameSpace: ns,
              team: team as unknown as Team,
              teamMembers: [],
              orgName: isMultiOrg ? orgName : undefined,
              orgGroupName: toOrgEntityName(
                orgName,
                org.organization.id,
                identity,
              ),
              identity,
            }),
          );
          groupCount += 1;
        }
      }

      // Process users in batches to avoid overwhelming the AAP server
      // Deduplicate across orgs — the same user can belong to multiple orgs
      const allUsers = [
        ...new Map(
          orgsDetails.flatMap(org => org.users || []).map(u => [u.id, u]),
        ).values(),
      ];
      const batchSize = 100; // Process 100 users at a time
      this.logger.info(
        `[${AAPEntityProvider.pluginLogName}]: Processing ${allUsers.length} users in batches of ${batchSize}`,
      );

      const processedOrgUserIds = new Set<number>();

      for (let i = 0; i < allUsers.length; i += batchSize) {
        const batch = allUsers.slice(i, i + batchSize);
        this.logger.debug(
          `[${AAPEntityProvider.pluginLogName}]: Processing batch ${
            Math.floor(i / batchSize) + 1
          }/${Math.ceil(allUsers.length / batchSize)}`,
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
                    const memberIdentity = {
                      multiOrgEnabled: this.multiOrgEnabled,
                      orgId: org.organization.id,
                    };
                    const memberNs = getEffectiveNamespace(
                      org.organization.name,
                      this.orgs,
                      memberIdentity,
                    );
                    userMembers.push(
                      toTeamGroupRef(
                        memberNs,
                        matchingTeam.name,
                        matchingTeam.id,
                        undefined,
                        memberIdentity,
                      ),
                    );
                    matched = true;
                    break;
                  }
                }

                // Team group entities come from the bulk org payload. A missing
                // team is a source disagreement, not direct org membership.
                if (!matched) {
                  this.logger.warn(
                    `[${AAPEntityProvider.pluginLogName}]: Team ${team.name} (ID: ${team.id}) for user ${user.username} (ID: ${user.id}) not found in bulk org payload; skipping team membership`,
                  );
                }
              }

              // Bulk is_orguser data is the only source for direct org access.
              // Per-user team results must not promote a missing team to org access.
              for (const org of orgsDetails) {
                if (
                  org.users?.some(
                    u => u.id === user.id && u.is_orguser !== false,
                  )
                ) {
                  const orgIdentity = {
                    multiOrgEnabled: this.multiOrgEnabled,
                    orgId: org.organization.id,
                  };
                  const orgNs = getEffectiveNamespace(
                    org.organization.name,
                    this.orgs,
                    orgIdentity,
                  );
                  const orgRef = toOrgGroupRef(
                    orgNs,
                    org.organization.name,
                    org.organization.id,
                    undefined,
                    orgIdentity,
                  );
                  if (!userMembers.includes(orgRef)) {
                    userMembers.push(orgRef);
                  }
                }
              }

              // Collect org names for user annotations
              const userOrgNames = orgsDetails
                .filter(o => o.users?.some(u => u.id === user.id))
                .map(o => o.organization.name);

              const userEntity = userParser({
                baseUrl: this.baseUrl,
                nameSpace: 'default',
                user: user as User,
                groupMemberships: userMembers,
                orgNames: isMultiOrg ? userOrgNames : undefined,
                identity: { multiOrgEnabled: isMultiOrg },
              });
              entities.push(userEntity);
              processedOrgUserIds.add(user.id);
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

      // Process system users — skip those already processed as org users
      const processedUserIds = processedOrgUserIds;
      const uniqueSystemUsers = systemUsers.filter(
        u => !processedUserIds.has(u.id),
      );
      this.logger.info(
        `[${AAPEntityProvider.pluginLogName}]: Processing ${
          uniqueSystemUsers.length
        } system users in batches of ${batchSize} (${
          systemUsers.length - uniqueSystemUsers.length
        } already processed as org users)`,
      );

      for (let i = 0; i < uniqueSystemUsers.length; i += batchSize) {
        const batch = uniqueSystemUsers.slice(i, i + batchSize);

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
                    const sysNs = getEffectiveNamespace(
                      org.organization.name,
                      this.orgs,
                      {
                        multiOrgEnabled: this.multiOrgEnabled,
                        orgId: org.organization.id,
                      },
                    );
                    userMembers.push(
                      toTeamGroupRef(
                        sysNs,
                        matchingTeam.name,
                        matchingTeam.id,
                        undefined,
                        {
                          multiOrgEnabled: this.multiOrgEnabled,
                          orgId: org.organization.id,
                        },
                      ),
                    );
                    break;
                  }
                }
              }

              const sysUserOrgNames = orgsDetails
                .filter(o => o.users?.some(u => u.id === user.id))
                .map(o => o.organization.name);

              const userEntity = userParser({
                baseUrl: this.baseUrl,
                nameSpace: 'default',
                user: user as User,
                groupMemberships: userMembers,
                orgNames: isMultiOrg ? sysUserOrgNames : undefined,
                identity: { multiOrgEnabled: isMultiOrg },
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
        if (i + batchSize < uniqueSystemUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // 🚀 DYNAMIC RBAC: Create aap-admins group with current superusers as members
      const aapAdminsGroup = this.createAapAdminsGroup(systemUsers);
      entities.push(aapAdminsGroup);

      // AAP can return the same logical entity through multiple organization
      // or membership paths. Catalog identity is the full kind/namespace/name
      // tuple, so remove later duplicates before the full mutation.
      const { entities: uniqueEntities, duplicateEntityCount } =
        deduplicateCatalogEntities(
          entities,
          this.logger,
          AAPEntityProvider.pluginLogName,
        );
      await this.connection.applyMutation({
        type: 'full',
        entities: uniqueEntities.map(entity => ({
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

      this.syncState.markSyncSucceeded({
        duplicateEntityCount,
        missingOrganizations,
      });
      return true;
    } catch (e) {
      this.syncState.markSyncFailed();
      throw e;
    }
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.scheduleFn();
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
    const memberNames = currentSuperusers.map(user =>
      toUserEntityRef(user.username, user.id, {
        multiOrgEnabled: this.multiOrgEnabled,
      }),
    );

    this.logger.info(
      `🚀 Creating aap-admins group with ${
        memberNames.length
      } current superusers: ${memberNames.join(', ')}`,
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
          'backstage.io/managed-by-location': `${this.getProviderName()}:${
            this.env
          }`,
          'backstage.io/managed-by-origin-location': `${this.getProviderName()}:${
            this.env
          }`,
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
