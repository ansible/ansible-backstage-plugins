# WP-027 — AAP operation registrations

| Field      | Value                                                                         |
| ---------- | ----------------------------------------------------------------------------- |
| Phase      | 8 — Typed operations                                                          |
| Depends on | WP-012, WP-013, WP-026, and WP-044                                            |
| Targets    | `aap-backend-module-content-operations` and AAP action wrappers               |
| Outcome    | Current AAP automation capabilities exposed as typed, permissioned operations |

## Human summary

**Why this matters:** Existing Ansible Automation Platform (AAP) capabilities need to remain available through the new typed operation system without bypassing portal permissions or delegated AAP authorization.

**What will change:** AAP operation-specific data contracts and client methods will be added to the WP-044 packages, while Catalog providers, Scaffolder wrappers, frontend features, and a content-operation registration module move to explicit owners. Approved identity sync, job-template sync, user creation, project creation, execution-environment creation, job-template creation and launch, cleanup, and other frozen AAP operations will be registered with typed schemas.

**PR scope:** Deliver the work as the ordered PR series below: freeze operation ownership and legacy mappings, add only operation-specific DTOs and typed client methods to the WP-044 packages, extract Catalog and Scaffolder packages, register typed operations, extract the frontend, and finally dual-run and migrate. Compatibility entry points remain usable until their replacement passes parity.

**Not in this PR:** Automation Hub synchronization, execution-environment and Git content operations, and generic portal actions remain with their assigned work packages. Operation handlers will not access Controller directly, resolve execution credentials, or fall back to service credentials.

**Success looks like:** Existing compatibility action IDs retain equivalent behavior, denied delegated authorization causes no AAP mutation, and launched jobs keep their upstream correlation and audit trail. Removing the AAP plugin leaves generic content and non-AAP operations healthy, and all Controller traffic remains owned by the standalone AAP backend.

## Scope and changes

Consume the WP-044-owned `aap-common`, `aap-node`, plugin ID `aap`, and auth-provider boundary, then add only operation-specific portable Controller/Hub DTOs, AAP permissions/annotations/API refs, typed client methods, and AAP-operation source-control-management (SCM) contracts needed by Catalog, Scaffolder, frontend, and operation handlers. This WP never creates another AAP backend, credential resolver, delegation contract, or Controller transport. `catalog-backend-module-aap` owns organization/team/user/job-template providers and their projection/sync; `scaffolder-backend-module-aap` owns `aap-api-cloud` plus the five `rhaap:*` wrappers; and `aap-frontend` exclusively owns `/ansible`, its overview/favourites/learning links, AAP resource fields/cards/routes, and AAP auth/logout integration.

Register `aap.sync.identities`, `aap.sync.job-templates`, `aap.catalog.create-user`, and other AAP-only operations frozen by WP-001. The five legacy Scaffolder action IDs map exactly as follows: `rhaap:create-project` → `aap.project.create`; `rhaap:create-execution-environment` → `aap.execution-environment.create`; `rhaap:create-job-template` → `aap.job-template.create`; `rhaap:launch-job-template` → `aap.job-template.launch`; and `rhaap:clean-up` → `aap.resource.cleanup`. The `rhaap:*` names remain compatibility action IDs and are not operation descriptor IDs. Automation Hub source sync remains WP-041-owned; EE and Git/content operations remain WP-008/WP-015-owned. `ansible:create:ee-definition` remains with the EE type/core Scaffolder owner. Generic `ansible:content:create` and `ansible:prepare:publish` remain owned by `scaffolder-backend-module-portal`.

The operation backend module ID is `aap`, targeting plugin ID `content-primitives`. Its handlers call standalone plugin ID `aap` only through the authenticated typed `aap-node` REST client, carrying the Backstage caller credential and correlation ID. `aap-backend` alone resolves execution credentials and talks to Controller; operation handlers never import `aap-backend`, resolve `ansibleServiceRef`/`IAAPService`, construct a Controller client, or fall back to a service credential.

```ts
registry.register({
  descriptor: {
    id: 'aap.job-template.launch',
    version: '1.0.0',
    requiredPermissions: ['aap.job-template.launch'],
    execution: 'job',
    inputSchema: launchSchema,
    outputSchema: launchResultSchema,
  },
  handler: createAapLaunchHandler({ aapClient, authorizer }),
});
```

## Implementation slices

1. Inventory all AAP package exports, providers, routes, fields, auth integration, sync behavior, `aap-api-cloud`, and AAP-owned actions/operations; assert Portal/EE/Git/Automation Hub-owned capabilities are excluded.
2. Approve per-operation delegation and permission policy under WP-044.
3. Implement backend registrations over the authenticated typed `aap-node` client to plugin ID `aap`.
4. Extract the AAP catalog/scaffolder/frontend packages and preserve `/ansible`, provider/entity, sync, field/provider, action, favourite, link, and auth/logout parity.
5. Dual-run provider sync and representative operations in non-production and publish migration guidance.

## Ordered PR series

1. **Ownership ledger:** freeze AAP exports, routes, providers, actions, fields, authentication behavior, and exclusions with golden fixtures only.
2. **Operation contracts and client additions:** consume the WP-044-owned packages and add only the operation-specific `aap-common` DTOs/permissions plus authenticated `aap-node` client methods needed by the mapped consumers; plugin ID `aap` remains the already established sole credential-resolution and Controller-traffic owner.
3. **Catalog and Scaffolder extraction:** move providers and existing wrapper actions into their dedicated modules without enabling new operation registrations.
4. **Typed operations:** add `aap-backend-module-content-operations` through WP-012/WP-013 and delegate compatibility action IDs after delegation-policy tests pass.
5. **Frontend extraction:** publish `aap-frontend` and move `/ansible`, fields, favourites, links, and authentication/logout composition while retaining the old mount handoff.
6. **Migration and cleanup gate:** dual-run representative sync/operation paths, publish evidence and rollback guidance, and enable the new owners; removal of compatibility code remains WP-039-governed.

Each PR must pass its applicable tests below, preserve a releasable old or compatibility path, and be revertible without crossing credential-ownership boundaries.

## Required tests

- Schema and error parity for each mapped action/operation.
- Portal/Scaffolder permission and delegated AAP authorization, including stale/denied identity.
- Idempotency, cancellation, timeout, upstream failure, and job correlation.
- No arbitrary controller URL/token/header reaches a handler.
- Architecture tests reject imports of `aap-backend`, `ansibleServiceRef`, `IAAPService`, or Controller clients from the operation module.
- Audit links portal principal, content subject, operation, AAP request/job, and result safely.
- Catalog provider/entity/location ownership, sync conflict/status, `/ansible` static/dynamic route/menu/icon/listener, favourites/links, AAP fields, `aap-api-cloud`, and AAP OAuth/logout integration pass WP-001 fixtures.

### Acceptance criteria

- Given an existing supported action, its compatibility ID invokes the registered operation with equivalent behavior.
- Given portal permission but denied delegated AAP authorization, no AAP mutation occurs.
- Given an AAP job launch, normalized job state retains the upstream job correlation.
- Given AAP plugin removal, generic content and non-AAP operations remain healthy.
- Given runtime inspection, module ID `aap` targets `content-primitives` and all Controller traffic is owned by plugin ID `aap`.

## Rollback and completion

Disable registrations and route compatibility wrappers to the existing actions if still supported. Done means all approved AAP operations pass parity, delegation, idempotency, and audit tests.
