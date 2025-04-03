import {
  Organization,
  Organizations,
  PaginatedResponse,
  RoleAssignmentResponse,
  RoleAssignments,
  Team,
  Teams,
  Users,
} from './types';
import { formatNameSpace } from '../helpers';

import { Agent, fetch } from 'undici';
import type { LoggerService } from '@backstage/backend-plugin-api';

export class AAPConnector {
  private readonly logger: LoggerService;
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly proxyAgent: Agent;

  constructor({
    token,
    baseUrl,
    checkSSL,
    logger,
  }: {
    token: string;
    baseUrl: string;
    checkSSL: boolean;
    logger: LoggerService;
  }) {
    this.logger = logger;
    this.token = token;
    this.baseUrl = baseUrl.slice(-1) === '/' ? baseUrl.slice(0, -1) : baseUrl;
    this.proxyAgent = new Agent({
      connect: {
        rejectUnauthorized: checkSSL,
      },
    });
  }

  private async executeGetRequest(
    endPoint: string,
    results?: never[],
  ): Promise<never[]> {
    let result = results ? results : [];
    const url = this.baseUrl + endPoint;
    this.logger.info(`Fetching data from ${url}`);
    let response;
    try {
      response = await fetch(url, {
        dispatcher: this.proxyAgent,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (e) {
      this.logger.error(`Error retrieving records from ${url}.`);
      throw new Error(`Error retrieving records from ${url}.`);
    }

    if (!response.ok) {
      this.logger.error(
        `Error retrieving records from ${url}. ${response.statusText}`,
      );
      throw new Error(response.statusText);
    }
    const jsonResponse = (await response.json()) as PaginatedResponse;
    result = [...result, ...jsonResponse.results];
    if (jsonResponse.next) {
      return await this.executeGetRequest(jsonResponse.next, result);
    }
    return result;
  }

  async getOrganizationsByID(): Promise<Organizations> {
    const endPoint = '/api/gateway/v1/organizations/';
    this.logger.info(`Fetching organizations from RH AAP.`);
    const organizations = await this.executeGetRequest(endPoint);
    return organizations.reduce((map: Organizations, item: Organization) => {
      map[item.id] = {
        id: item.id,
        name: item.name,
        namespace: formatNameSpace(item.name),
      } as Organization;
      return map;
    }, {}) as Organizations;
  }

  async getAllTeamsById(): Promise<Teams> {
    const endPoint = '/api/gateway/v1/teams/';
    this.logger.info(`Fetching teams from RH AAP.`);
    const teams = await this.executeGetRequest(endPoint);
    return teams.reduce((map: Teams, item: Team) => {
      map[item.id] = {
        id: item.id,
        organization: item.organization,
        name: item.name,
        groupName: `${formatNameSpace(item.name)}`,
        description: item?.description,
      };
      return map;
    }, {}) as Teams;
  }

  async listUsers(): Promise<Users> {
    const endPoint = '/api/gateway/v1/users/';
    this.logger.info(`Fetching users from RH AAP.`);
    const users = await this.executeGetRequest(endPoint);
    return users as Users;
  }

  async getUsersByTeamId(teamID: number): Promise<{ name: string }[]> {
    const endPoint = `/api/gateway/v1/teams/${teamID}/users/`;
    this.logger.info(`Fetching users for team ID: ${teamID} from RH AAP.`);
    const users = await this.executeGetRequest(endPoint);
    return users
      .filter((user: any) => user?.username)
      .map((user: any) => ({
        name: user.username,
      }));
  }

  async getTeamsByUserId(
    userID: number,
  ): Promise<{ name: string; groupName: string }[]> {
    const endPoint = `/api/gateway/v1/users/${userID}/teams/`;
    this.logger.info(`Fetching teams for user ID: ${userID} from RH AAP.`);
    const teams = await this.executeGetRequest(endPoint);
    return teams
      .filter((team: any) => team?.name)
      .map((team: any) => ({
        name: team.name,
        groupName: formatNameSpace(team.name),
      }));
  }

  async getOrgsByUserId(
    userID: number,
  ): Promise<{ name: string; groupName: string }[]> {
    const endPoint = `/api/gateway/v1/users/${userID}/organizations/`;
    this.logger.info(`Fetching orgs for user ID: ${userID} from RH AAP.`);
    const orgs = await this.executeGetRequest(endPoint);
    return orgs
      .filter((org: any) => org?.name)
      .map((org: any) => ({
        name: org.name,
        groupName: formatNameSpace(org.name),
      }));
  }

  async getUsersByOrgId(orgID: number): Promise<{ name: string }[]> {
    const endPoint = `/api/gateway/v1/organizations/${orgID}/users/`;
    this.logger.info(`Fetching users for org ID: ${orgID} from RH AAP.`);
    const users = await this.executeGetRequest(endPoint);
    return users
      .filter((user: any) => user?.username)
      .map((user: any) => ({
        name: user.username,
      }));
  }

  async getUserRoleAssignments(): Promise<RoleAssignments> {
    const endPoint = '/api/gateway/v1/role_user_assignments/';
    this.logger.info(`Fetching role assignments from RH AAP.`);
    const roles = await this.executeGetRequest(endPoint);
    return roles.reduce(
      (map: RoleAssignments, item: RoleAssignmentResponse) => {
        const tmp = map?.[item.user] ? map[item.user] : {};
        if (item?.summary_fields?.role_definition?.name) {
          const roleDef = tmp?.[item.summary_fields.role_definition.name]
            ? tmp[item.summary_fields.role_definition.name]
            : [];
          if (item?.object_id) {
            roleDef.push(item.object_id);
          }
          tmp[item.summary_fields.role_definition.name] = roleDef;
        }
        map[item.user] = tmp;
        return map;
      },
      {},
    ) as RoleAssignments;
  }
}
