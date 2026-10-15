import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  type BackstageCredentials,
  type PermissionsService,
} from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import {
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
import type {
  EntitlementDefinition,
  EntitlementDecision,
} from '@ansible/portal-extension-common';

export type { EntitlementDecision } from '@ansible/portal-extension-common';

/** Trusted deployment context. No client input or user-namespace inference. */
export interface ActiveOrganizationResolver {
  resolve(credentials: BackstageCredentials): Promise<string | undefined>;
  /** Trusted configured memberships, not a selection supplied by the browser. */
  resolveAll?(credentials: BackstageCredentials): Promise<readonly string[]>;
}

/** Validate trusted memberships and return unique IDs in a stable order. */
export async function resolveOrganizationMemberships(
  resolver: ActiveOrganizationResolver,
  credentials: BackstageCredentials,
): Promise<readonly string[]> {
  const values = resolver.resolveAll
    ? await resolver.resolveAll(credentials)
    : [await resolver.resolve(credentials)].filter(
        (id): id is string => id !== undefined,
      );
  if (
    !Array.isArray(values) ||
    values.some(id => typeof id !== 'string' || !id.trim() || id !== id.trim())
  ) {
    throw new InputError('Invalid organization memberships');
  }
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export class ConfiguredOrganizationResolver
  implements ActiveOrganizationResolver
{
  constructor(private readonly config: Config) {}
  resolve(_credentials: BackstageCredentials): Promise<string | undefined> {
    return Promise.resolve().then(() => {
      return (
        this.config.getOptionalString('portal.organization.id')?.trim() ||
        undefined
      );
    });
  }
}

/** Availability gates complement Backstage permissions; they never grant RBAC. */
export class PortalEntitlements {
  private readonly definitions = new Map<string, EntitlementDefinition>();
  constructor(
    private readonly config: Config,
    private readonly organizations: ActiveOrganizationResolver,
  ) {}

  register(
    pluginId: string,
    definitions: readonly EntitlementDefinition[],
  ): void {
    const ids = new Set<string>();
    for (const definition of definitions) {
      if (
        !/^[a-z][a-z0-9-]*$/.test(pluginId) ||
        !definition.id.startsWith(`${pluginId}.`) ||
        definition.id.length <= pluginId.length + 1 ||
        !definition.permissionName.trim() ||
        !['global', 'organization'].includes(definition.scope)
      ) {
        throw new InputError(
          'Entitlements require owner-prefixed IDs, a permission, and a supported scope',
        );
      }
      if (ids.has(definition.id) || this.definitions.has(definition.id))
        throw new InputError(`Duplicate entitlement: ${definition.id}`);
      ids.add(definition.id);
    }
    definitions.forEach(definition =>
      this.definitions.set(definition.id, { ...definition }),
    );
  }

  async check(
    id: string,
    credentials: BackstageCredentials,
    permissions: PermissionsService,
  ): Promise<EntitlementDecision> {
    const principal = credentials.principal;
    if (
      !principal ||
      typeof principal !== 'object' ||
      !('type' in principal) ||
      principal.type !== 'user'
    )
      return { allowed: false };
    const definition = this.definitions.get(id);
    if (!definition) return { allowed: false };
    try {
      const memberships = await resolveOrganizationMemberships(
        this.organizations,
        credentials,
      );
      const organizationId =
        memberships.length === 1 ? memberships[0] : undefined;
      const denied = { allowed: false, organizationId };
      if (definition.scope === 'organization' && !memberships.length)
        return denied;
      const grants =
        this.config.getOptionalConfigArray('portal.entitlements.grants') ?? [];
      const granted = new Set(
        grants
          .filter(grant => grant.getString('id') === id)
          .flatMap(grant => grant.getStringArray('organizations')),
      );
      const matching = memberships.filter(
        member => granted.has('*') || granted.has(member),
      );
      const available =
        definition.scope === 'global' ? granted.has('*') : matching.length > 0;
      if (!available) return denied;
      const [decision] = await permissions.authorize(
        [
          {
            permission: createPermission({
              name: definition.permissionName,
              attributes: { action: 'read' },
            }),
          },
        ],
        { credentials },
      );
      return {
        allowed: decision?.result === AuthorizeResult.ALLOW,
        ...(definition.scope === 'global' ? { scope: 'global' as const } : {}),
        ...(definition.scope === 'organization' && matching.length > 1
          ? { organizationIds: matching }
          : {
              organizationId:
                definition.scope === 'organization'
                  ? matching[0]
                  : organizationId,
            }),
      };
    } catch {
      // Missing/invalid policy, organization resolution, and permission errors deny.
      return { allowed: false };
    }
  }
}

export const portalActiveOrganizationServiceRef =
  createServiceRef<ActiveOrganizationResolver>({
    id: 'portal.active-organization',
    scope: 'root',
    defaultFactory: service =>
      Promise.resolve(
        createServiceFactory({
          service,
          deps: { config: coreServices.rootConfig },
          factory: ({ config }) => new ConfiguredOrganizationResolver(config),
        }),
      ),
  });

export const portalEntitlementsServiceRef =
  createServiceRef<PortalEntitlements>({
    id: 'portal.entitlements',
    scope: 'root',
    defaultFactory: service =>
      Promise.resolve(
        createServiceFactory({
          service,
          deps: {
            config: coreServices.rootConfig,
            organizations: portalActiveOrganizationServiceRef,
          },
          factory: ({ config, organizations }) =>
            new PortalEntitlements(config, organizations),
        }),
      ),
  });
