# WP-029 — APME backend plugin and operation module

| Field      | Value                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| Phase      | 9 — APME modularization                                                                                         |
| Depends on | WP-004, WP-005, WP-010, WP-012, WP-013, WP-019, and WP-028                                                      |
| Target     | APME backend plugin plus backend operation and processor modules                                                |
| Frozen IDs | Plugin `apme`; module `apme` and processor module `apme-processors`, both targeting plugin `content-primitives` |
| Outcome    | APME REST capability and operations have explicit independently packaged owners                                 |

## Human summary

**Why this matters:** Ansible Policy & Modernization Engine (APME) needs clear ownership boundaries so its application programming interfaces (APIs), operations, and scan-processing logic can be packaged and maintained independently without reaching into generic content storage.

**What will change:** A dedicated APME backend will own its routes, services, jobs, configuration, permissions, and Server-Sent Events (SSE). Separate modules will expose typed operations and convert authenticated scan events into standard quality and dependency records through the content-owned processing pipeline.

**PR scope:** Deliver the work as the ordered PR series below: freeze the 36-route capability map, publish wire contracts and client, extract the backend, register operations, add event-driven processors, and then dual-run and cut over. Every PR preserves a compatibility path and keeps generic persistence behind public contracts.

**Not in this PR:** APME will not directly access generic content databases or repositories, and detailed reports will remain APME-owned rather than being copied into generic records. The separate automation-content proof of concept and Red Hat Ansible Automation Platform (RHAAP) route families are also excluded.

**Success looks like:** Every existing APME route has one documented owner, old and new behavior matches, and module boundaries prevent duplicated clients or persistence. Replayed, superseded, deleted, or unresolved scan results are handled safely and produce traceable records.

## Scope and changes

Extract APME route handlers, services, repositories, jobs, SSE, permissions, and configuration into backend plugin `apme`. Publish `apme-common` wire schemas and authenticated APME scan-result event schemas plus a typed `apme-client` that depends only on those schemas and Backstage discovery/identity interfaces. Add backend module `apme` that targets `content-primitives`, registers APME-owned typed operations through WP-012, and invokes plugin ID `apme` only through `apme-client`. Add the separate backend module package `apme-backend-module-content-processors`, module ID `apme-processors` targeting `content-primitives`, which consumes authenticated `apme.scan.completed`/superseded/deleted events and registers processors through the public WP-004 processor contract. Those processors return versioned `quality` and `dependency` primitive results to the content-owned WP-019 execution/persistence pipeline; the APME module never calls a primitive repository or persists primitive records itself. Quality records retain rule/scanner/profile and evidence provenance, while dependency edges resolve canonical subjects and emit standard `dependsOn`/`dependencyOf` relations (or an explicit unresolved external reference). Detailed APME reports remain APME-owned and are linked, not copied wholesale into generic records. The plugin uses `content-primitives-client` over normalized REST for generic content and does not access its repositories/database. Preserve all **36 current APME Catalog router declarations** from the WP-001 ledger through an explicit capability mapping and compatibility owner. This scope does not include the separate 20-route automation-content PoC router or 13-route RHAAP router owned by WP-014.

```ts
export const apmeOperationModule = createBackendModule({
  pluginId: 'content-primitives',
  moduleId: 'apme',
  register(env) {
    /* register APME operation handlers */
  },
});
```

## Implementation slices

1. Map each of the 36 APME Catalog route declarations/services/operations to plugin, operation module, generic service, or compatibility layer.
2. Extract plugin/service/repository boundaries plus `apme-common` schemas and `apme-client` with minimal behavior change.
3. Register typed APME operations in the frozen operation-module identity; handlers use only `apme-client` and own descriptor validation/result mapping.
4. Replace direct generic-content access with the shared REST client.
5. Create `apme-backend-module-content-processors`; publish authenticated scan-result event schemas/outbox delivery and register idempotent quality/dependency processors, including scan-version supersession, deleted/stale results, unresolved targets, and replay. Implement against the WP-004 public processor harness and frozen WP-019 result fixtures; execute end-to-end persistence tests against the already established Phase 6 runtime.
6. Add auth/config/lifecycle/observability, dual-run comparison, and disable old handlers.

## Ordered PR series

1. **Capability ledger and contracts:** freeze all 36 route/SSE/job capabilities and publish `apme-common` wire and event schemas with golden fixtures; no routing changes.
2. **Client and backend extraction:** publish `apme-client` and plugin ID `apme`, initially reached through compatibility handlers, with auth/config/lifecycle/observability and persistence-boundary tests.
3. **Operation module:** register the frozen module ID `apme` through WP-012 and route handlers only through `apme-client`, initially behind registration gates.
4. **Processor module:** add module ID `apme-processors`, authenticated scan events, quality/dependency normalization, and end-to-end WP-019 persistence fixtures without changing route ownership.
5. **Parity and cutover:** dual-run old/new handlers and processor outputs, enable the new route/operation owners after parity passes, and retain rollback handlers; compatibility removal remains WP-039-governed.

Each PR must pass its applicable tests below, leave the repository releasable, and remain independently reversible without combining backend, operation, and processor ownership in one review.

## Required tests

- Full route/SSE/error/job golden fixtures and explicit capability mapping coverage.
- Operation discovery/invocation/schema/idempotency/permission/audit behavior.
- Architecture: no generic content repository/database import and no duplicated source client.
- Architecture: the operation module imports neither APME backend implementations nor persistence and reaches plugin ID `apme` only through `apme-client`.
- Architecture: the processor module owns no router/database/scheduler, consumes only authenticated typed APME events/clients, and returns records only through the content-owned processor result contract.
- Static/dynamic runtime ID/target registration and duplicate-owner failure.
- Restart, multi-replica, dependency outage, cancellation, redaction, and rate/resource limits.
- Quality/dependency primitive schemas, canonical dependency resolution, standard inverse relations, unresolved/external targets, duplicate/replayed scans, supersession/deletion, evidence authorization, and old/new semantic parity.
- Scheduled/manual scan-to-outbox-event-to-processor-to-primitive persistence fixtures, including event authentication, duplicate delivery, ordering, restart, dead letter, and replay.

### Acceptance criteria

- Given any of the 36 APME Catalog routes, the mapping identifies its new owner and compatibility behavior without claiming either non-APME route family.
- Given module registration, ID is `apme`, target is `content-primitives`, and no second owner exists.
- Given content service outage, APME fails safely without corrupting its state.
- Given old handlers are disabled, plugin routes and registered operations retain baseline behavior.
- Given client inspection, `apme-client` depends only on `apme-common` wire schemas and Backstage discovery/identity interfaces.
- Given an APME scan result, generic quality/dependency records retain the source report/version and semantic state, resolved dependency edges use standard relations in both directions, and unknown targets never become false internal content links.
- Given inspection of module boundaries, operation handlers remain descriptor/validation/result mappers while the `apme-processors` module alone performs APME-to-primitive normalization through the content-owned processor pipeline.

## Rollback and completion

Route traffic to compatibility handlers and disable module registrations while retaining migrated PostgreSQL state. Done means frozen identities, route mapping, REST boundary, operations, and parity tests pass, and `apme-processors` has proven authenticated scan-event intake; quality/dependency normalization; unresolved-target handling; replay, supersession, and deletion; and end-to-end WP-019 persistence fixtures.
