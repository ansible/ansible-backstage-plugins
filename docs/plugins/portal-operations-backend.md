# @ansible/portal-operations-backend

Backend plugin for authorized Portal operation dispatch and entitlement
decisions. Source: `workspaces/portal-core/plugins/portal-operations-backend`.

## Integration

The `./alpha` backend feature loader installs the host-owned operation,
entitlement, and health services once, then loads the backend plugin:

```ts
backend.add(import('@ansible/portal-operations-backend/alpha'));
```

Contributor backends register operations through `portalOperationsServiceRef`.
The host dispatches operation IDs with authenticated context and current subjects,
not contributor-supplied handler URLs.

## Organization and entitlement policy

The AAP adapter verifies authenticated identity and resolves current direct
organization and team memberships, restricted to configured Portal organizations.
Entitlement grants under `portal.entitlements.grants` use the adapter's canonical
lowercase organization names or `'*'`. A missing grant denies entitlement; a
grant does not prove membership or replace RBAC. Existing AAP superuser access
to configured organizations does not bypass grants or permissions.

The same injected resolver supplies operation contexts and entitlement decisions.
The dispatcher rejects missing or inconsistent membership context and enforces
every backend descriptor's `requiredEntitlements` before invoking its handler.
APME scanning declares `apme.scanning`. Registration and deregistration remain
available without that scanning entitlement, subject to their own permissions.

For a shared operation (`organizationScope: 'shared'`), any membership granted
the required entitlement enables availability. A user in Engineering and Finance
can use a shared capability granted only to Engineering, subject to operation
and resource permissions. `organizations: ['*']` covers the caller's configured
memberships; it does not grant membership in other organizations.

Descriptors default to `organizationScope: 'organization'`. Those handlers need
one validated `organizationId`, and organization-scoped entitlements must grant
that organization. `organizationIds` can contain multiple memberships, but the
dispatcher does not choose the first. There is no organization selector in this
flow. Shared Git repository operations do not choose a storage tenant for
organization-specific plugin state.

### Minimal AAP policy

With Engineering already configured in the AAP provider:

```yaml
portal:
  entitlements:
    grants:
      - id: apme.scanning
        organizations: [engineering]
```

### Multi-organization AAP policy

Keep your existing AAP connection configuration and configure organization scope
and grants as follows:

```yaml
catalog:
  providers:
    rhaap:
      development:
        orgs: [Engineering, Finance]
        multiOrgEnabled: true
portal:
  entitlements:
    grants:
      - id: apme.scanning
        organizations: [engineering, finance]
```

With `multiOrgEnabled: true`, AAP user identities use `user:default/aap-user-<id>`;
organization groups use ID-based names and namespaces. Authentication, scheduled
catalog sync and the extracted user provisioner use the same naming contract.
With the flag off, legacy usernames remain supported; the resolver performs an
unambiguous AAP username lookup. A failed identity or membership lookup denies
access rather than falling back to `default` or all organizations. Changing the
identity flag changes affected catalog references; synchronize the catalog and
sign in again after changing it.

### Generic host fallback

Hosts without the AAP adapter can use the generic configured resolver:

```yaml
portal:
  organization:
    id: default
  entitlements:
    grants:
      - id: apme.scanning
        organizations: [default]
```

This is a trusted deployment context, not an AAP membership resolver. When the
AAP adapter is installed, it uses the configured AAP organizations and verified
memberships instead of `portal.organization.id`.

### Shared repository identity

Git repositories do not require an AAP organization owner. New manual entries
use catalog namespace `default`; catalog namespace and SCM organization do not
determine AAP memberships. Repository access still requires resource RBAC and
the handler's repository type, URL/branch, provenance and tracking checks.

Remove obsolete `portal.organization.catalogMappings` configuration. The former
mapping policy and `ansible.io/portal-organization` ownership checks are no longer
used. Existing persisted entries and annotations are not renamed, backfilled or
deleted by this change.

### Frontend context endpoint

`GET /api/portal-operations/context` requires user authentication and returns
`userEntityRef`, `userId`, and either one `organizationId` or multiple
`organizationIds`. The frontend SDK normalizes these into a membership list for
display. No active organization is selected for multiple memberships. Operation
requests do not accept client-supplied organization context; the dispatcher
independently resolves it.

### Interactive workflow boundaries

APME operation submission, approval, state/events, and remediation submission
authorize trusted memberships, scanning entitlement, and catalog repository
before forwarding gateway requests or resolving SCM credentials. Mutating
requests additionally require the scan operation permission. Read-only
state/event requests do not require that mutation permission.

This does not migrate every legacy settings route, change automatic scan policy,
partition gateway storage, or revoke running jobs when a grant changes.

### Troubleshooting

**Operation denied although the action is visible:** check backend descriptor
requirements, registered entitlement definitions, grants for the caller's
resolved memberships, operation permission, and the handler's resource checks.

**User with several memberships cannot invoke an organization-specific operation:**
the handler requires one validated organization, not an arbitrary first member.
Use shared scope only when the resource and operation are genuinely shared.

**Shared repository denied:** check verified AAP memberships, configured grants,
operation and catalog read permissions, repository identity and tracking state.
Do not add a namespace mapping or bypass resource authorization. Re-export
affected dynamic consumers and restart the backend after changing contracts or
policy configuration.

See [NFS composition](../next/portal-sdk-nfs-composition.md) for frontend checks
and [portal-plugin-node](portal-plugin-node.md) for service contracts.
