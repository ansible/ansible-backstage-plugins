# WP-042 — Source settings administration

| Field      | Value                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| Phase      | 5 — Source expansion                                                                     |
| Depends on | WP-005, WP-006, WP-009, WP-010, WP-012, WP-013, WP-015, WP-017, and WP-041               |
| Targets    | Backend source service/API and administration frontend                                   |
| Outcome    | Durable, audited source lifecycle with frozen role-based access control (RBAC) contracts |

## Frozen contracts

- Resource type: `ansible-content-source`
- Source kinds: `git`, `oci`, `automation-hub`, `filesystem`
- Source IDs: lowercase RFC 4122 UUIDs
- Conditional rule: `FOR_SOURCE(sourceKind, sourceId)`
- `ansible.content-sources.view` — action `read`
- `ansible.content-sources.create` — action `create`
- `ansible.content-sources.edit` — action `update`
- `ansible.content-sources.credentials.bind` — action `update`
- `ansible.content-sources.validate` — action `update`
- `ansible.content-sources.sync` — action `update`
- `ansible.content-sources.delete` — action `delete`
- Permission/resource/rule package: `content-primitives-permissions`
- `RESOURCE_TYPE_ANSIBLE_CONTENT_SOURCE = 'ansible-content-source'`
- `CONTENT_SOURCE_KINDS = ['git', 'oci', 'automation-hub', 'filesystem'] as const`

`ContentSourceResource` is `{ id: string; sourceKind: ContentSourceKind }`; `ContentSourceFilter` is `{ id?: { $eq: string }; sourceKind?: { $eq: ContentSourceKind } }`; request `resourceRef` is the immutable source UUID. `contentSourceResourceRef` is exactly `createPermissionResourceRef<ContentSourceResource, ContentSourceFilter>().with({ pluginId: 'content-primitives', resourceType: RESOURCE_TYPE_ANSIBLE_CONTENT_SOURCE })`. `FOR_SOURCE` accepts `{ sourceKind, sourceId }`, where `sourceId` is a canonical UUID or `'*'`. `apply` matches source kind and exact/wildcard ID. `toQuery` always filters `sourceKind` and adds `id.$eq` unless wildcarded.

Source UUIDs are allocated once and never derived from mutable names or URLs. Imports preserve exported IDs; migration persists an old-key-to-UUID map. Create allocates the UUID, validates the proposed resource, and applies any conditional authorization decision before persistence; denial creates neither source nor secret binding. Other operations resolve by UUID before authorization and use the approved non-leaking not-found policy for inaccessible resources.

`content-primitives-permissions` exports all seven Backstage permission objects, the constants above, `ContentSourceKind`, `ContentSourceResource`, `ContentSourceFilter`, `contentSourceResourceRef`, and the `FOR_SOURCE` rule factory. `contentSourceResourceRef` is created for plugin ID `content-primitives` and the frozen resource type; the content backend registers that resource and rule. These Backstage runtime objects must not be moved into a runtime-neutral DTO/common package.

## Human summary

**Why this matters:** Administrators need a safe, durable way to manage Git, container registry, Automation Hub, and filesystem content sources. Permissions must apply to the exact source and action, while credentials remain outside configuration, responses, logs, and browser state.

**What will change:** The backend and administration interface will support source creation, viewing, updates, deletion, enablement, credential-reference binding, validation, synchronization, drift checks, import and export, status, history, diagnostics, and audit records. Each source will receive an immutable lowercase universally unique identifier (UUID).

**PR scope:** Deliver the work as the ordered PR series below: permission contracts, durable persistence/OpenAPI, typed lifecycle operations, schema-driven interface, migration/compatibility, and operational certification. Each PR consumes the named prerequisites, keeps existing source configuration usable, and is independently reversible.

**Not in this PR:** Secret values will not be stored or returned; only approved references to them will be retained. Existing `ansible.*.view` grants will never imply source creation, editing, credential binding, validation, synchronization, or deletion.

**Success looks like:** A principal can act only on sources matching the permitted kind, identifier, and action, with direct application programming interface (API) denial matching what the interface hides. Invalid identifiers, unauthorized creation, credential leakage, concurrency errors, and unsafe deletion are rejected without unintended side effects.

## Scope and changes

Implement source create/read/update/delete, enable/disable, credential-reference binding, connection validation, capability probe, configuration export/import/validate, manual sync, cheap poll/drift check, status/history, diagnostics, and audit APIs plus an admin UI. Expose per-source and aggregate status, last success/failure, discovered/delta counts, retained-previous indication, scheduler state, and restart-required versus live-reload state. Persist non-secret configuration durably; store only approved secret references/handles. Enforce permission and `FOR_SOURCE` conditions in backend services, not merely UI.

```json
{
  "id": "018f2f6a-7b45-7b6a-91a1-2ac81234abcd",
  "sourceKind": "oci",
  "displayName": "Production Hub",
  "configuration": { "registry": "registry.example.com" },
  "credentialRef": "secret:content/prod-hub"
}
```

## Implementation slices

1. Implement the exact permission names/actions, exported constants/types, resource ref, and rule factory in `content-primitives-permissions`; register them in the content backend.
2. Add source/config/credential-reference/status/audit repositories and OpenAPI, including export/import/validate and non-secret diagnostics.
3. Implement backend authorization, capability/connection validation, optimistic concurrency, sync/poll/drift linkage, scheduler/reload state, and retained-previous behavior.
4. Build adapter-schema-driven, permission-aware admin UI with aggregate status and explicit destructive/credential confirmations.
5. Add migration/import validation, audit retention, operational metrics, and documentation.
6. Publish and test the rollout compatibility matrix for existing `ansible.*.view` grants: any approved mapping is read-only source visibility and never implies create, edit, credential binding, validation, sync, or delete.

## Ordered PR series

1. **Permission/resource contracts:** publish and register the seven permissions, resource reference, source kinds, and `FOR_SOURCE` rule with contract tests; no routes or UI change.
2. **Persistence and OpenAPI:** add WP-009 repositories and non-secret source/status/history/audit contracts, with WP-010 transactional lifecycle events and migration fixtures; existing configuration remains the active read path.
3. **Typed lifecycle operations:** register WP-012 create/edit/bind/validate/sync/delete operations through WP-013 authorization and audit, initially gated and without UI cutover.
4. **Administration interface:** add the adapter-schema-driven UI over the normalized client with direct-route and confirmation tests.
5. **Migration and compatibility:** import existing configurations, preserve UUID mappings, apply the read-only grant matrix, and enable the new read/write paths with rollback flags.
6. **Operational certification:** add aggregate status, poll/drift/replay behavior, metrics, runbooks, retention evidence, and final failure/restart/concurrency tests.

Each PR must pass its applicable tests below, record prerequisite exit evidence, leave a releasable compatibility path, and avoid combining contract, persistence, operation, and UI ownership in one review.

## Required tests

- Contract tests for source kinds, lowercase UUIDs, all exported permission objects/constants/types, `contentSourceResourceRef`, backend registration, and `FOR_SOURCE` apply/toQuery evaluation.
- Compatibility-matrix tests prove existing `ansible.*.view` behavior is either explicitly unmapped or approved read-only visibility, never a write/network/destructive grant.
- CRUD/enable-disable/validation/capability probe/export/import/sync/poll/status/history/diagnostics with allowed, denied, condition-matched, and condition-mismatched principals.
- Aggregate/per-source status, discovered/delta counts, retained-previous, scheduler state, and restart/live-reload semantics.
- Credential value never appears in REST, database config, UI state, logs, metrics, or audit.
- Concurrency, deletion with active jobs, invalid config, dependency outage, and audit immutability.
- Direct-route/API denial matches UI hiding.
- Migration/import tests preserve valid exported UUIDs, persist old-key mappings, and prove names/URLs never determine identity.
- Create-denial tests prove no source/credential side effect; existing-resource tests prove resolve-before-authorization and non-leaking not-found behavior.

### Acceptance criteria

- Given source-scoped access, a principal can act only on matching `sourceKind`/ID and permission/action.
- Given credential replacement, only a reference is stored and audit records actor/source/change/result without secret value.
- Given deletion, historical canonical observations follow retention policy and active work is handled explicitly.
- Given any noncanonical source kind or uppercase/non-RFC UUID, validation rejects it.

## Rollback and completion

Disable admin UI/write routes while retaining read/sync from existing configuration. Done means security approves all seven permissions, conditional rule behavior, credential handling, export/import, poll/drift, diagnostics, status, and audit evidence.
