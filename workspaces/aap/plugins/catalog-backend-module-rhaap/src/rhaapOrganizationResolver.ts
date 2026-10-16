import {
  coreServices,
  createServiceFactory,
  type BackstageCredentials,
} from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import {
  AAPClient,
  resolveActiveOrganizations,
  toUserEntityName,
  type IAAPService,
} from '@ansible/backstage-rhaap-common';
import {
  portalActiveOrganizationServiceRef,
  type ActiveOrganizationResolver,
} from '@ansible/portal-plugin-node';

type MembershipClient = Pick<
  IAAPService,
  | 'executeGetRequest'
  | 'getUserInfoById'
  | 'getOrgsByUserId'
  | 'getTeamsByUserId'
>;

/** AAP-specific identity/membership adapter. Catalog namespace is never tenancy. */
export class RhaapOrganizationResolver implements ActiveOrganizationResolver {
  constructor(
    private readonly config: Config,
    private readonly client?: MembershipClient,
  ) {}

  async resolve(
    credentials: BackstageCredentials,
  ): Promise<string | undefined> {
    const organizations = await this.resolveAll(credentials);
    return organizations.length === 1 ? organizations[0] : undefined;
  }

  /** Resolve verified, configured AAP memberships; unavailable identity fails closed. */
  async resolveAll(
    credentials: BackstageCredentials,
  ): Promise<readonly string[]> {
    try {
      const principal = credentials.principal;
      if (
        !principal ||
        typeof principal !== 'object' ||
        !('type' in principal) ||
        principal.type !== 'user' ||
        !('userEntityRef' in principal) ||
        typeof principal.userEntityRef !== 'string' ||
        !this.client
      )
        return [];
      const match = /^user:default\/([^/]+)$/i.exec(principal.userEntityRef);
      if (!match) return [];
      const providers = this.config.getOptionalConfig(
        'catalog.providers.rhaap',
      );
      if (!providers || providers.keys().length === 0) return [];
      const configured = new Set<string>();
      let multiOrgEnabled = false;
      for (const key of providers.keys()) {
        const provider = providers.getConfig(key);
        const raw = provider.getOptional('orgs');
        const names = typeof raw === 'string' ? raw.split(',') : raw;
        if (
          !Array.isArray(names) ||
          !names.length ||
          names.some(name => typeof name !== 'string' || !name.trim())
        )
          return [];
        resolveActiveOrganizations(provider).forEach(name =>
          configured.add(name),
        );
        multiOrgEnabled ||=
          provider.getOptionalBoolean('multiOrgEnabled') === true;
      }
      let userId: number;
      if (multiOrgEnabled) {
        const id = /^aap-user-([1-9]\d*)$/.exec(match[1]);
        if (!id) return [];
        userId = Number(id[1]);
      } else {
        const query = new URLSearchParams({
          username__iexact: match[1],
          page_size: '2',
        });
        const response = await this.client.executeGetRequest(
          `api/gateway/v1/users/?${query}`,
          this.config.getOptionalString('ansible.rhaap.token') ?? null,
        );
        const page = await response.json();
        if (
          !Array.isArray(page.results) ||
          page.results.length !== 1 ||
          page.next ||
          (typeof page.count === 'number' && page.count !== 1)
        )
          return [];
        userId = page.results[0].id;
      }
      if (!Number.isSafeInteger(userId) || userId < 1) return [];
      const user = await this.client.getUserInfoById(userId);
      if (
        user.id !== userId ||
        toUserEntityName(user.username, user.id, {
          multiOrgEnabled,
        }).toLowerCase() !== match[1].toLowerCase()
      )
        return [];
      // Match Portal's existing AAP superuser access policy; grants/RBAC still apply.
      if (user.is_superuser === true)
        return [...configured].sort((a, b) => a.localeCompare(b));
      const [direct, teams] = await Promise.all([
        this.client.getOrgsByUserId(userId, [...configured]),
        this.client.getTeamsByUserId(userId),
      ]);
      const memberships = [
        ...direct.map(org => org.name),
        ...teams.map(team => team.orgName),
      ].map(name => name.trim().toLowerCase());
      return [
        ...new Set(memberships.filter(name => configured.has(name))),
      ].sort((a, b) => a.localeCompare(b));
    } catch {
      // Failed identity lookup or membership fetch must never become an all-org grant.
      return [];
    }
  }
}

export const rhaapOrganizationServiceFactory = createServiceFactory({
  service: portalActiveOrganizationServiceRef,
  deps: { config: coreServices.rootConfig, logger: coreServices.rootLogger },
  factory: ({ config, logger }) =>
    new RhaapOrganizationResolver(
      config,
      new AAPClient({ rootConfig: config, logger }),
    ),
});
