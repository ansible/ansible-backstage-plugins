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

import { readAapApiEntityConfigs } from './config';
import { InputError, isError, NotFoundError } from '@backstage/errors';
import { AapConfig } from './types';
import {
  AAPConnector,
  Organization,
  RoleAssignments,
  Team,
  Users,
  User,
} from '../client';
import { Entity } from '@backstage/catalog-model';
import { OrganizationParser, teamParser, userParser } from './entityParser';

export class AAPEntityProvider implements EntityProvider {
  private readonly env: string;
  private readonly baseUrl: string;
  private readonly logger: LoggerService;
  private readonly orgSync: string = '';
  private readonly scheduleFn: () => Promise<void>;
  private connection?: EntityProviderConnection;
  private readonly accessToken: string;
  private readonly checkSSL: boolean;

  static pluginLogName = 'plugin-catalog-rh-aap';

  static fromConfig(
    config: Config,
    options: {
      logger: LoggerService;
      schedule?: SchedulerServiceTaskRunner;
      scheduler?: SchedulerService;
    },
  ): AAPEntityProvider[] {
    const { logger } = options;
    const providerConfigs = readAapApiEntityConfigs(config);
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
      return new AAPEntityProvider(providerConfig, logger, taskRunner);
    });
  }

  private constructor(
    config: AapConfig,
    logger: LoggerService,
    taskRunner: SchedulerServiceTaskRunner,
  ) {
    this.env = config.id;
    this.baseUrl = config.baseUrl;
    this.logger = logger.child({
      target: this.getProviderName(),
    });

    this.scheduleFn = this.createScheduleFn(taskRunner);
    this.accessToken = config.token;
    this.checkSSL = config.checkSSL;
    this.orgSync = config.orgSync ?? '';
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

  async run(): Promise<void> {
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
    const apiClient = new AAPConnector({
      logger: this.logger,
      baseUrl: this.baseUrl,
      token: this.accessToken,
      checkSSL: this.checkSSL,
      orgSync: this.orgSync,
    });
    try {
      orgsDetails = await apiClient.getOrganizationsWithDetails();
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
      userRoleAssignments = await apiClient.getUserRoleAssignments();
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
      systemUsers = await apiClient.listSystemUsers();
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
          ? Object.values(org.users).map(user => user.username)
          : [];

        entities.push(
          OrganizationParser({
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

      for (const user of orgsDetails.flatMap(org => org.users || [])) {
        const userTeams = await apiClient.getTeamsByUserId(user.id);
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
                userMembers.push(org.organization.namespace);
                break;
              }
            }
          }
        }
        entities.push(
          userParser({
            baseUrl: this.baseUrl,
            nameSpace: 'default',
            user: user as User,
            groupMemberships: userMembers,
          }),
        );
        usersCount += 1;
      }

      for (const user of systemUsers) {
        const userTeams = await apiClient.getTeamsByUserId(user.id);
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
        entities.push(
          userParser({
            baseUrl: this.baseUrl,
            nameSpace: 'default',
            user: user as User,
            groupMemberships: userMembers,
          }),
        );
        usersCount += 1;
      }
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
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.scheduleFn();
  }
}
