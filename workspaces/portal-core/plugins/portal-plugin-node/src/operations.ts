import Ajv, { type ValidateFunction } from 'ajv';
import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  type BackstageCredentials,
  type PermissionsService,
  type LoggerService,
} from '@backstage/backend-plugin-api';
import { InputError, NotAllowedError, NotFoundError } from '@backstage/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type {
  OperationDescriptor,
  OperationRequest,
} from '@ansible/portal-extension-common';
import type { PortalContext } from './types';
import { AuditEmitter } from './auditEmitter';
import {
  portalActiveOrganizationServiceRef,
  portalEntitlementsServiceRef,
  type ActiveOrganizationResolver,
  type PortalEntitlements,
  resolveOrganizationMemberships,
} from './entitlements';

export interface OperationContext extends PortalContext {
  credentials: BackstageCredentials;
}

export interface OperationRegistration {
  pluginId: string;
  descriptor: OperationDescriptor;
  handler(
    request: OperationRequest,
    context: OperationContext,
  ): Promise<unknown>;
}

/** Injected root service: registrations do not rely on shared module singletons. */
export class PortalOperations {
  private readonly ajv = new Ajv({ strict: true, allErrors: true });
  private readonly registrations = new Map<
    string,
    {
      registration: OperationRegistration;
      input?: ValidateFunction;
      output?: ValidateFunction;
    }
  >();

  constructor(
    private readonly logger: LoggerService,
    private readonly organizations: ActiveOrganizationResolver,
    private readonly entitlements: Pick<PortalEntitlements, 'check'>,
  ) {}

  register(registration: OperationRegistration): void {
    const { descriptor, pluginId } = registration;
    if (
      descriptor.organizationScope !== undefined &&
      !['organization', 'shared'].includes(descriptor.organizationScope)
    ) {
      throw new InputError('Invalid operation organization scope');
    }
    if (!descriptor.id.startsWith(`${pluginId}.`) || !descriptor.permission) {
      throw new InputError(
        'An operation must have an owner-prefixed ID and a permission',
      );
    }
    if (this.registrations.has(descriptor.id)) {
      throw new InputError(`Duplicate operation: ${descriptor.id}`);
    }
    if (
      descriptor.requiredEntitlements &&
      (new Set(descriptor.requiredEntitlements).size !==
        descriptor.requiredEntitlements.length ||
        descriptor.requiredEntitlements.some(
          id => !/^[a-z][a-z0-9-]*\.[a-z0-9.-]+$/.test(id),
        ))
    )
      throw new InputError('Invalid operation entitlement requirements');
    this.registrations.set(descriptor.id, {
      registration: {
        ...registration,
        descriptor: {
          ...descriptor,
          requiredEntitlements: [...(descriptor.requiredEntitlements ?? [])],
        },
      },
      input: descriptor.inputSchema
        ? this.ajv.compile(descriptor.inputSchema)
        : undefined,
      output: descriptor.outputSchema
        ? this.ajv.compile(descriptor.outputSchema)
        : undefined,
    });
  }

  async execute(
    operationId: string,
    request: OperationRequest,
    context: OperationContext,
    permissions: PermissionsService,
  ): Promise<unknown> {
    const entry = this.registrations.get(operationId);
    if (!entry || !entry.registration.descriptor.exposure?.rest) {
      throw new NotFoundError(`Operation is not available: ${operationId}`);
    }
    const { registration } = entry;
    const audit = new AuditEmitter(registration.pluginId, this.logger);
    const event = {
      operationId,
      userId: context.userId,
      organizationId: undefined as string | undefined,
      organizationIds: [] as readonly string[],
      input: { entityRef: request.subject.entityRef },
    };
    try {
      const principal = context.credentials.principal;
      if (
        !principal ||
        typeof principal !== 'object' ||
        !('type' in principal) ||
        principal.type !== 'user'
      ) {
        throw new NotAllowedError('Operation requires an authenticated user');
      }
      let memberships: readonly string[];
      try {
        memberships = await resolveOrganizationMemberships(
          this.organizations,
          context.credentials,
        );
      } catch {
        throw new NotAllowedError('Active organization could not be resolved');
      }
      const organizationId =
        context.organizationId ??
        (memberships.length === 1 ? memberships[0] : undefined);
      event.organizationIds = memberships;
      if (organizationId && memberships.includes(organizationId))
        event.organizationId = organizationId;
      if (
        !memberships.length ||
        (organizationId !== undefined &&
          !memberships.includes(organizationId)) ||
        (registration.descriptor.organizationScope !== 'shared' &&
          !organizationId) ||
        (context.organizationIds !== undefined &&
          [...context.organizationIds].sort().join('\0') !==
            memberships.join('\0'))
      ) {
        throw new NotAllowedError(
          'Operation organization context is missing, ambiguous or inconsistent',
        );
      }
      const requirement = registration.descriptor.permission!;
      const query =
        'permission' in requirement ? requirement : { permission: requirement };
      const [decision] = await permissions.authorize([query], {
        credentials: context.credentials,
      });
      if (decision?.result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('Operation permission denied');
      }
      if (entry.input && !entry.input(request.input ?? {})) {
        throw new InputError('Operation input does not match its schema');
      }
      for (const id of registration.descriptor.requiredEntitlements ?? []) {
        const entitlementDecision = await this.entitlements.check(
          id,
          context.credentials,
          permissions,
        );
        const grantedOrganizations = [
          ...(entitlementDecision.organizationIds ?? []),
          ...(entitlementDecision.organizationId
            ? [entitlementDecision.organizationId]
            : []),
        ];
        const entitlementApplies =
          entitlementDecision.scope === 'global' ||
          grantedOrganizations.some(grantedOrganization =>
            registration.descriptor.organizationScope === 'shared'
              ? memberships.includes(grantedOrganization)
              : grantedOrganization === organizationId,
          );
        if (!entitlementDecision.allowed || !entitlementApplies) {
          throw new NotAllowedError('Operation entitlement denied');
        }
      }
      const result = await registration.handler(request, {
        ...context,
        organizationId,
        ...(memberships.length > 1 ? { organizationIds: memberships } : {}),
      });
      if (entry.output && !entry.output(result)) {
        throw new Error('Operation output does not match its schema');
      }
      audit.emit({ ...event, outcome: 'SUCCESS' });
      return result;
    } catch (error) {
      audit.emit({ ...event, outcome: 'FAILURE' });
      throw error;
    }
  }
}

export const portalOperationsServiceRef = createServiceRef<PortalOperations>({
  id: 'portal.operations',
  scope: 'root',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        logger: coreServices.rootLogger,
        organizations: portalActiveOrganizationServiceRef,
        entitlements: portalEntitlementsServiceRef,
      },
      factory: async ({ logger, organizations, entitlements }) =>
        new PortalOperations(logger, organizations, entitlements),
    }),
});
