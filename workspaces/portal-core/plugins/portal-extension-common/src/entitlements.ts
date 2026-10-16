/** Host authorization result, shared by backend transport and frontend client. */
export interface EntitlementDecision {
  allowed: boolean;
  /** Explicit global decisions do not select an organization. */
  scope?: 'global' | 'organization';
  organizationId?: string;
  /** Granted memberships for shared-resource availability; not resource ownership. */
  organizationIds?: readonly string[];
}
