# @ansible/portal-plugin-node

Node library for Portal contributor backends. Source:
`workspaces/portal-core/plugins/portal-plugin-node`.

## Backend infrastructure

- `createPortalPlugin`: scoped health and audit helpers.
- `portalOperationsServiceRef`: shared operation registration and execution.
- `portalEntitlementsServiceRef` and `portalActiveOrganizationServiceRef`:
  host entitlement and trusted organization-membership decisions.
- `portalHealthServiceRef`: shared push-based health reporting.
- Identity middleware, audit emission, and `withOrganization` helpers.
- `resolvePortalContext`: authenticated user identity plus trusted memberships,
  independent of user namespace. `organizationId` is optional; multiple
  memberships are carried in `organizationIds` without choosing an active org.
- `resolveOrganizationMemberships`: validates and normalizes the injected
  resolver's membership set. Existing single-organization resolvers remain
  supported through `resolve`; membership-aware adapters provide `resolveAll`.

## Operation and context requirements

Inject `portalOperationsServiceRef` instead of constructing a private dispatcher.
Its service dependencies include the active-organization resolver and entitlement
service. For isolated tests, `new PortalOperations(logger, organizations,
entitlements)` requires both dependencies; there is no permissive fallback.

Backend operation descriptors declare `requiredEntitlements` separately from
frontend presentation requirements. The dispatcher verifies organization context,
operation permission, and every declared entitlement before running the handler.
Handlers still own resource permissions, supported content checks, and domain
authorization.

Descriptors default to `organizationScope: 'organization'` and require one
validated organization before invocation. Use `organizationScope: 'shared'` for
shared resources such as Git repositories: any granted membership enables the
required capability, subject to RBAC. Do not use shared scope to choose a tenant
for organization-specific persistence.

Identity middleware requires `organizations`, injected from
`portalActiveOrganizationServiceRef`. The deprecated `defaultOrgId` option is
ignored. If identity or organization resolution fails, the middleware clears
`portalContext`; protected routes must reject a missing context.

## Usage boundaries

Inject host services into backend modules rather than creating independent
registries in each dynamically loaded package. Presentation belongs to frontend
contributions; registered operations can serve multiple UI surfaces.

The AAP adapter validates current direct/team memberships against configured
organizations. The generic `ConfiguredOrganizationResolver` instead supplies a
server-configured single organization for hosts without the AAP adapter.
Neither adapter treats catalog namespace or SCM owner as membership. Shared
repository access requires no AAP ownership annotation or catalog mapping.

Membership context is not an organization selector. Organization-specific
handlers reject ambiguous multi-membership context rather than selecting the
first membership.
Audit emission does not imply a durable external audit store.

See [operations backend](portal-operations-backend.md),
[health backend](portal-health-backend.md), and the
[implementation guide](../next/portal-plugin-factory-implementation-guide.md).
