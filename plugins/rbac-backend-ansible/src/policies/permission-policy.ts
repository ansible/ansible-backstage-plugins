/*
 * Copyright 2024 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type {
  AuditorService,
  AuditorServiceEvent,
  AuthService,
  BackstageUserInfo,
  LoggerService,
} from '@backstage/backend-plugin-api';
import type { ConfigApi } from '@backstage/core-plugin-api';
import {
  AuthorizeResult,
  ConditionalPolicyDecision,
  isResourcePermission,
  PermissionCondition,
  PermissionCriteria,
  PermissionRuleParams,
  PolicyDecision,
  ResourcePermission,
} from '@backstage/plugin-permission-common';
import type {
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';

import type { Knex } from 'knex';
import { Entity } from '@backstage/catalog-model';

import {
  NonEmptyArray,
  toPermissionAction,
} from '@backstage-community/plugin-rbac-common';
import {
  IAAPService,
  IAAPTokenLookup,
} from '@ansible/backstage-rhaap-common';
import {
  createCatalogConditionalDecision,
  catalogConditions,
} from '@backstage/plugin-catalog-backend/alpha';

import {
  setAdminPermissions,
  useAdminsFromConfig,
} from '../admin-permissions/admin-creation';
import { createPermissionEvaluationAuditorEvent } from '../auditor/auditor';
import { replaceAliases } from '../conditional-aliases/alias-resolver';
import { ConditionalStorage } from '../database/conditional-storage';
import { RoleMetadataStorage } from '../database/role-metadata';
import { CSVFileWatcher } from '../file-permissions/csv-file-watcher';
import { YamlConditinalPoliciesFileWatcher } from '../file-permissions/yaml-conditional-file-watcher';
import { EnforcerDelegate } from '../service/enforcer-delegate';
import { PluginPermissionMetadataCollector } from '../service/plugin-endpoints';

export class RBACPermissionPolicy implements PermissionPolicy {
  private readonly superUserList?: string[];
  private readonly preferPermissionPolicy: boolean;
  private readonly aapService?: IAAPService;
  private readonly aapTokenLookup?: IAAPTokenLookup;
  private readonly logger: LoggerService;
  private readonly accessCache = new Map<string, { templateIds: Set<number>; expiresAt: number }>();
  private readonly cacheTTLMs = 60000; // 1 minute cache

  public static async build(
    logger: LoggerService,
    auditor: AuditorService,
    configApi: ConfigApi,
    conditionalStorage: ConditionalStorage,
    enforcerDelegate: EnforcerDelegate,
    roleMetadataStorage: RoleMetadataStorage,
    knex: Knex,
    pluginMetadataCollector: PluginPermissionMetadataCollector,
    auth: AuthService,
    aapService?: IAAPService,
    aapTokenLookup?: IAAPTokenLookup,
  ): Promise<RBACPermissionPolicy> {
    const superUserList: string[] = [];
    const adminUsers = configApi.getOptionalConfigArray(
      'permission.rbac.admin.users',
    );

    const superUsers = configApi.getOptionalConfigArray(
      'permission.rbac.admin.superUsers',
    );

    const policiesFile = configApi.getOptionalString(
      'permission.rbac.policies-csv-file',
    );

    const allowReload =
      configApi.getOptionalBoolean('permission.rbac.policyFileReload') || false;

    const conditionalPoliciesFile = configApi.getOptionalString(
      'permission.rbac.conditionalPoliciesFile',
    );

    const preferPermissionPolicy =
      (configApi.getOptionalString(
        'permission.rbac.policyDecisionPrecedence',
      ) ?? 'conditional') === 'basic';

    if (superUsers && superUsers.length > 0) {
      for (const user of superUsers) {
        const userName = user.getString('name');
        superUserList.push(userName);
      }
    }

    await useAdminsFromConfig(
      adminUsers || [],
      enforcerDelegate,
      auditor,
      roleMetadataStorage,
      knex,
    );
    await setAdminPermissions(enforcerDelegate, auditor);

    if (
      (!adminUsers || adminUsers.length === 0) &&
      (!superUsers || superUsers.length === 0)
    ) {
      logger.warn(
        'There are no admins or super admins configured for the RBAC-backend plugin.',
      );
    }

    const csvFile = new CSVFileWatcher(
      policiesFile,
      allowReload,
      logger,
      enforcerDelegate,
      roleMetadataStorage,
      auditor,
    );
    await csvFile.initialize();

    const conditionalFile = new YamlConditinalPoliciesFileWatcher(
      conditionalPoliciesFile,
      allowReload,
      logger,
      conditionalStorage,
      auditor,
      auth,
      pluginMetadataCollector,
      roleMetadataStorage,
      enforcerDelegate,
    );
    await conditionalFile.initialize();

    if (!conditionalPoliciesFile) {
      // clean up conditional policies corresponding to roles from csv file
      logger.info('conditional policies file feature was disabled');
      await conditionalFile.cleanUpConditionalPolicies();
    }
    if (!policiesFile) {
      // remove roles and policies from csv file
      logger.info('csv policies file feature was disabled');
      await csvFile.cleanUpRolesAndPolicies();
    }

    return new RBACPermissionPolicy(
      logger,
      enforcerDelegate,
      auditor,
      conditionalStorage,
      preferPermissionPolicy,
      superUserList,
      aapService,
      aapTokenLookup,
    );
  }

  private constructor(
    logger: LoggerService,
    private readonly enforcer: EnforcerDelegate,
    private readonly auditor: AuditorService,
    private readonly conditionStorage: ConditionalStorage,
    preferPermissionPolicy: boolean,
    superUserList?: string[],
    aapService?: IAAPService,
    aapTokenLookup?: IAAPTokenLookup,
  ) {
    this.logger = logger;
    this.superUserList = superUserList;
    this.preferPermissionPolicy = preferPermissionPolicy;
    this.aapService = aapService;
    this.aapTokenLookup = aapTokenLookup;
  }

  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const userEntityRef = user?.info.userEntityRef ?? `user without entity`;

    const auditorEvent = await createPermissionEvaluationAuditorEvent(
      this.auditor,
      userEntityRef,
      request,
    );

    try {
      let status = false;
      const action = toPermissionAction(request.permission.attributes);

      if (!user) {
        await auditorEvent.success({
          meta: { result: AuthorizeResult.DENY },
        });
        return { result: AuthorizeResult.DENY };
      }

      if (this.superUserList!.includes(userEntityRef)) {
        await auditorEvent.success({
          meta: { result: AuthorizeResult.ALLOW },
        });
        return { result: AuthorizeResult.ALLOW };
      }

      // ===== ANSIBLE ENHANCEMENT: External System RBAC Checks =====
      // Check for external entities (AAP, GitHub, GitLab) BEFORE normal RBAC
      // This ensures single source of truth for external content
      if (
        isResourcePermission(request.permission, 'catalog-entity') &&
        request.permission.attributes?.action === 'read'
      ) {
        const entity = (request as any).resource as Entity | undefined;
        
        // For catalog LIST queries (no entity object), return conditional decision
        // This allows database-level filtering by AAP-accessible template IDs
        if (!entity) {
          const aapConditionalDecision = await this.getAAPConditionalDecision(
            userEntityRef,
            request.permission as ResourcePermission<'catalog-entity'>,
            auditorEvent,
          );
          if (aapConditionalDecision) {
            return aapConditionalDecision;
          }
        } else {
          // For individual entity checks, check annotation and query AAP
          const aapAnnotation = entity.metadata.annotations?.['ansible.com/aapJobTemplateId'];
          
          if (aapAnnotation) {
            this.logger.info(
              `[RBAC-Ansible] 🎯 Found AAP job template annotation: ${aapAnnotation} on entity ${entity.metadata.name}`,
            );
            const aapDecision = await this.checkAAPAccess(userEntityRef, entity, auditorEvent);
            if (aapDecision) {
              return aapDecision;
            }
          }
          
          // TODO: Add GitHub check when GitHub discovery is implemented
          // if (entity.metadata.annotations?.['github.com/project-slug']) {
          //   return await this.checkGitHubAccess(userEntityRef, entity, auditorEvent);
          // }
          
          // TODO: Add GitLab check when GitLab discovery is implemented
          // if (entity.metadata.annotations?.['gitlab.com/project-slug']) {
          //   return await this.checkGitLabAccess(userEntityRef, entity, auditorEvent);
          // }
        }
      }
      // ===== END ANSIBLE ENHANCEMENT =====

      const permissionName = request.permission.name;
      const roles = await this.enforcer.getRolesForUser(userEntityRef);
      // handle permission with 'resource' type
      const hasNamedPermission = await this.hasImplicitPermission(
        permissionName,
        action,
        roles,
      );

      // TODO: Temporary workaround to prevent breakages after the removal of the resource type `policy-entity` from the permission `policy.entity.create`
      if (
        request.permission.name === 'policy.entity.create' &&
        !hasNamedPermission
      ) {
        request.permission = {
          attributes: { action: 'create' },
          type: 'resource',
          resourceType: 'policy-entity',
          name: 'policy.entity.create',
        };
      }

      if (isResourcePermission(request.permission)) {
        const resourceType = request.permission.resourceType;
        // Let's set up higher priority for permission specified by name, than by resource type
        const obj = hasNamedPermission ? permissionName : resourceType;
        // handle conditions if they are present
        const conditionResult = await this.handleConditions(
          auditorEvent,
          userEntityRef,
          request,
          roles,
          user.info,
        );

        if (this.preferPermissionPolicy) {
          const hasResourcedPermission = await this.hasImplicitPermission(
            resourceType,
            action,
            roles,
          );
          // Permission policy first
          if (hasNamedPermission || hasResourcedPermission) {
            status = await this.isAuthorized(userEntityRef, obj, action, roles);
          } else if (conditionResult) {
            return conditionResult;
          }
        } else {
          if (conditionResult) return conditionResult;
          status = await this.isAuthorized(userEntityRef, obj, action, roles);
        }
      } else {
        // handle permission with 'basic' type
        status = await this.isAuthorized(
          userEntityRef,
          permissionName,
          action,
          roles,
        );
      }

      const result = status ? AuthorizeResult.ALLOW : AuthorizeResult.DENY;

      await auditorEvent.success({ meta: { result } });
      return { result };
    } catch (error) {
      await auditorEvent.fail({
        error: error as Error,
        meta: { result: AuthorizeResult.DENY },
      });
      return { result: AuthorizeResult.DENY };
    }
  }

  private async hasImplicitPermission(
    permissionName: string,
    action: string,
    roles: string[],
  ): Promise<boolean> {
    for (const role of roles) {
      const perms = await this.enforcer.getFilteredPolicy(
        0,
        role,
        permissionName,
        action,
      );
      if (perms.length > 0) {
        return true;
      }
    }

    return false;
  }

  private isAuthorized = async (
    userIdentity: string,
    permission: string,
    action: string,
    roles: string[],
  ): Promise<boolean> => {
    return await this.enforcer.enforce(userIdentity, permission, action, roles);
  };

  private async handleConditions(
    auditorEvent: AuditorServiceEvent,
    userEntityRef: string,
    request: PolicyQuery,
    roles: string[],
    userInfo: BackstageUserInfo,
  ): Promise<PolicyDecision | undefined> {
    const permissionName = request.permission.name;
    const resourceType = (request.permission as ResourcePermission)
      .resourceType;
    const action = toPermissionAction(request.permission.attributes);

    const conditions: PermissionCriteria<
      PermissionCondition<string, PermissionRuleParams>
    >[] = [];
    let pluginId = '';
    for (const role of roles) {
      const conditionalDecisions = await this.conditionStorage.filterConditions(
        role,
        undefined,
        resourceType,
        [action],
        [permissionName],
      );

      if (conditionalDecisions.length === 1) {
        pluginId = conditionalDecisions[0].pluginId;
        conditions.push(conditionalDecisions[0].conditions);
      }

      // this error is unexpected and should not happen, but just in case handle it.
      if (conditionalDecisions.length > 1) {
        await auditorEvent.fail({
          error: new Error(
            `Detected ${JSON.stringify(
              conditionalDecisions,
            )} collisions for conditional policies. Expected to find a stored single condition for permission with name ${permissionName}, resource type ${resourceType}, action ${action} for user ${userEntityRef}`,
          ),
          meta: { result: AuthorizeResult.DENY },
        });
        return {
          result: AuthorizeResult.DENY,
        };
      }
    }

    if (conditions.length > 0) {
      const result: ConditionalPolicyDecision = {
        pluginId,
        result: AuthorizeResult.CONDITIONAL,
        resourceType,
        conditions: {
          anyOf: conditions as NonEmptyArray<
            PermissionCriteria<
              PermissionCondition<string, PermissionRuleParams>
            >
          >,
        },
      };

      replaceAliases(result.conditions, userInfo);

      await auditorEvent.success({ meta: { ...result } });
      return result;
    }
    return undefined;
  }

  /**
   * ANSIBLE ENHANCEMENT: Check AAP RBAC for job templates
   * 
   * This method checks if a user has access to an AAP job template by:
   * 1. Looking up the user's AAP OAuth token from the session database
   * 2. Querying AAP API with the user's token to get accessible templates
   * 3. Checking if the requested template ID is in the accessible list
   * 
   * Single source of truth: AAP
   * No need to maintain duplicate RBAC rules in Backstage for AAP templates
   */
  private async checkAAPAccess(
    userEntityRef: string,
    entity: Entity,
    auditorEvent: AuditorServiceEvent,
  ): Promise<PolicyDecision | null> {
    // If AAP service not configured, skip external check
    if (!this.aapService || !this.aapTokenLookup) {
      this.logger.debug('[RBAC-Ansible] AAP service not configured - skipping external check');
      return null;
    }

    this.logger.info(`[RBAC-Ansible] 🔐 Checking AAP RBAC for user: ${userEntityRef}`);

    const templateIdStr = entity.metadata.annotations?.['ansible.com/aapJobTemplateId'];
    if (!templateIdStr) {
      return null;
    }

    const templateId = parseInt(templateIdStr, 10);
    if (isNaN(templateId)) {
      this.logger.warn(`[RBAC-Ansible] Invalid template ID: ${templateIdStr}`);
      return null;
    }

    // Check cache first
    const cached = this.accessCache.get(userEntityRef);
    if (cached && cached.expiresAt > Date.now()) {
      const hasAccess = cached.templateIds.has(templateId);
      const result = hasAccess ? AuthorizeResult.ALLOW : AuthorizeResult.DENY;
      this.logger.info(
        `[RBAC-Ansible] 📦 Cache hit: User ${userEntityRef} ${hasAccess ? 'HAS' : 'NO'} access to template ${templateId}`,
      );
      await auditorEvent.success({ meta: { result } });
      return { result };
    }

    // Lookup user's AAP token
    const tokenData = await this.aapTokenLookup.getTokenByUserEntityRef(userEntityRef);
    if (!tokenData?.accessToken) {
      this.logger.warn(`[RBAC-Ansible] ⚠️  No AAP token found for ${userEntityRef} - DENY`);
      await auditorEvent.success({ meta: { result: AuthorizeResult.DENY } });
      return { result: AuthorizeResult.DENY };
    }

    try {
      // Query AAP for accessible templates
      this.logger.debug(`[RBAC-Ansible] Querying AAP API for accessible templates...`);
      const aapResponse = await this.aapService.getResourceData(
        'job_templates',
        tokenData.accessToken,
      );

      const accessibleIds = new Set<number>(
        (aapResponse?.results || []).map((template: { id: number }) => template.id),
      );

      this.logger.info(
        `[RBAC-Ansible] User ${userEntityRef} has access to ${accessibleIds.size} AAP templates`,
      );

      // Cache for 1 minute
      this.accessCache.set(userEntityRef, {
        templateIds: accessibleIds,
        expiresAt: Date.now() + this.cacheTTLMs,
      });

      // Check if user has access to this specific template
      const hasAccess = accessibleIds.has(templateId);
      const result = hasAccess ? AuthorizeResult.ALLOW : AuthorizeResult.DENY;

      this.logger.info(
        `[RBAC-Ansible] ✅ User ${userEntityRef} ${hasAccess ? 'HAS' : 'NO'} access to template ${templateId}`,
      );

      await auditorEvent.success({ meta: { result } });
      return { result };
    } catch (error) {
      this.logger.error(`[RBAC-Ansible] Error checking AAP access: ${error}`);
      await auditorEvent.fail({
        error: error as Error,
        meta: { result: AuthorizeResult.DENY },
      });
      return { result: AuthorizeResult.DENY };
    }
  }

  /**
   * ANSIBLE ENHANCEMENT: Get conditional decision for AAP job templates (list queries)
   * 
   * For catalog list queries (e.g., GET /api/catalog/entities?filter=kind=template),
   * there's no entity object in the permission request. Instead, we return a conditional
   * decision that filters at the database level by accessible template IDs.
   * 
   * This method:
   * 1. Queries AAP for user's accessible templates
   * 2. Returns a conditional decision filtering by those IDs
   * 3. Allows database-level filtering instead of per-entity checks
   */
  private async getAAPConditionalDecision(
    userEntityRef: string,
    permission: ResourcePermission<'catalog-entity'>,
    auditorEvent: AuditorServiceEvent,
  ): Promise<PolicyDecision | null> {
    // If AAP service not configured, skip
    if (!this.aapService || !this.aapTokenLookup) {
      return null;
    }

    this.logger.info(`[RBAC-Ansible] 🔐 Creating conditional decision for catalog list query (user: ${userEntityRef})`);

    // Get accessible template IDs from AAP
    const tokenData = await this.aapTokenLookup.getTokenByUserEntityRef(userEntityRef);
    if (!tokenData?.accessToken) {
      this.logger.warn(`[RBAC-Ansible] ⚠️  No AAP token for ${userEntityRef} - blocking AAP templates`);
      // Block all AAP job templates
      const decision = createCatalogConditionalDecision(permission, {
        not: catalogConditions.hasAnnotation({
          annotation: 'ansible.com/aapJobTemplateId',
        }),
      });
      await auditorEvent.success({ meta: { result: AuthorizeResult.CONDITIONAL } });
      return decision;
    }

    try {
      // Query AAP for accessible templates
      this.logger.info(`[RBAC-Ansible] Querying AAP for accessible templates...`);
      const aapResponse = await this.aapService.getResourceData(
        'job_templates',
        tokenData.accessToken,
      );

      const accessibleIds = new Set<number>(
        (aapResponse?.results || []).map((template: { id: number }) => template.id),
      );

      this.logger.info(
        `[RBAC-Ansible] ✅ User ${userEntityRef} has access to ${accessibleIds.size} AAP templates: [${Array.from(accessibleIds).join(', ')}]`,
      );

      if (accessibleIds.size === 0) {
        // User has no accessible templates - block all AAP templates
        const decision = createCatalogConditionalDecision(permission, {
          not: catalogConditions.hasAnnotation({
            annotation: 'ansible.com/aapJobTemplateId',
          }),
        });
        await auditorEvent.success({ meta: { result: AuthorizeResult.CONDITIONAL } });
        return decision;
      }

      // Return conditional decision filtering by accessible template IDs
      const conditions = Array.from(accessibleIds).map(id =>
        catalogConditions.hasAnnotation({
          annotation: 'ansible.com/aapJobTemplateId',
          value: String(id),
        }),
      );

      const decision = createCatalogConditionalDecision(permission, {
        anyOf: conditions as any,
      });

      await auditorEvent.success({ meta: { result: AuthorizeResult.CONDITIONAL } });
      return decision;
    } catch (error) {
      this.logger.error(`[RBAC-Ansible] Error querying AAP: ${error}`);
      // On error, block all AAP templates
      const decision = createCatalogConditionalDecision(permission, {
        not: catalogConditions.hasAnnotation({
          annotation: 'ansible.com/aapJobTemplateId',
        }),
      });
      await auditorEvent.fail({
        error: error as Error,
        meta: { result: AuthorizeResult.CONDITIONAL },
      });
      return decision;
    }
  }
}
