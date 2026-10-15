import {
  createApiFactory,
  createApiRef,
  discoveryApiRef,
  fetchApiRef,
  type DiscoveryApi,
  type FetchApi,
} from '@backstage/core-plugin-api';

import type { EntitlementDecision } from '@ansible/portal-extension-common';

export type { EntitlementDecision } from '@ansible/portal-extension-common';

/** Organization and grants are resolved by the host backend, never by a plugin. */
export interface PortalEntitlementsApi {
  check(entitlementId: string, entityRef: string): Promise<EntitlementDecision>;
}

export const portalEntitlementsApiRef = createApiRef<PortalEntitlementsApi>({
  id: 'portal.entitlements',
});

export class PortalEntitlementsClient implements PortalEntitlementsApi {
  constructor(
    private readonly discovery: DiscoveryApi,
    private readonly fetchApi: FetchApi,
  ) {}
  async check(
    entitlementId: string,
    entityRef: string,
  ): Promise<EntitlementDecision> {
    const baseUrl = await this.discovery.getBaseUrl('portal-operations');
    const params = new URLSearchParams({ entityRef });
    const response = await this.fetchApi.fetch(
      `${baseUrl}/entitlements/${encodeURIComponent(entitlementId)}?${params}`,
    );
    if (!response.ok)
      throw new Error(`Entitlement check failed (HTTP ${response.status})`);
    const decision = await response.json();
    if (
      !decision ||
      typeof decision !== 'object' ||
      typeof decision.allowed !== 'boolean' ||
      (decision.scope !== undefined &&
        !['global', 'organization'].includes(decision.scope)) ||
      (decision.organizationId !== undefined &&
        typeof decision.organizationId !== 'string') ||
      (decision.organizationIds !== undefined &&
        (!Array.isArray(decision.organizationIds) ||
          decision.organizationIds.some(
            (id: unknown) => typeof id !== 'string' || !id.trim(),
          )))
    )
      throw new Error('Invalid entitlement decision');
    return decision;
  }
}

export const portalEntitlementsApiFactory = createApiFactory({
  api: portalEntitlementsApiRef,
  deps: { discovery: discoveryApiRef, fetchApi: fetchApiRef },
  factory: ({ discovery, fetchApi }) =>
    new PortalEntitlementsClient(discovery, fetchApi),
});
