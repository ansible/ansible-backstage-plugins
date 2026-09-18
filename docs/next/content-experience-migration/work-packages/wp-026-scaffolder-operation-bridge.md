# WP-026 — Scaffolder operation bridge

| Field      | Value                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| Phase      | 8 — Typed operations                                                                                                 |
| Depends on | WP-012 and WP-013                                                                                                    |
| Targets    | `portal-scaffolder-frontend`, `scaffolder-backend-module-portal`, and `scaffolder-backend-module-content-operations` |
| Outcome    | Approved WP-012 operations are safely invokable from Scaffolder tasks                                                |

## Human summary

**Why this matters:** Backstage Scaffolder tasks need a safe, consistent way to invoke approved content operations without accepting arbitrary network targets, credentials, or unvalidated payloads.

**What will change:** Generic Scaffolder frontend and backend behavior will move into dedicated packages, while a separate bridge will discover approved operations, render their schemas, enforce authorization, and map results, jobs, and errors into task outputs. Partner guidance will also cover safe declarative template registration, allowlisted source code management (SCM) fetching, publication, Catalog registration, and rollback.

**PR scope:** Deliver the work as the ordered PR series below: freeze inventories, extract the generic frontend, extract the generic backend, add the operation bridge, and publish partner fixtures and guidance. Compatibility IDs remain active throughout, and each PR is independently reviewable and reversible.

**Not in this PR:** The bridge will not define operations, own domain handlers, create another registry, reimplement job handling, or permit arbitrary Uniform Resource Locators (URLs), methods, headers, or credentials. Ansible Automation Platform (AAP) wrappers, execution-environment actions, and other domain-specific handlers remain with their assigned packages.

**Success looks like:** Portal and Scaffolder forms enforce identical schemas, permissions, requests, and errors, duplicate submissions cause only one external effect, and removed operations stop being advertised without losing job history. A partner can add a declarative template without host changes, while code-backed actions must follow the reviewed and verified dynamic-plugin path.

## Scope and changes

Extract `portal-scaffolder-frontend` and `scaffolder-backend-module-portal`, then implement the operation bridge in the separate leaf package `scaffolder-backend-module-content-operations` over WP-012 discovery/invocation and WP-013 authorization/audit. The frontend package owns generic template browse/details, forms, task history, safe OAuth restoration, and the complete frozen generic field-extension inventory. `scaffolder-backend-module-portal` owns `ansible:content:create`, `ansible:prepare:publish`, existing generic template filters, and other WP-001-classified generic actions; it retains exact IDs/schemas/outputs but does not own the generic operation bridge. `scaffolder-backend-module-content-operations` owns only the registered-operation invocation action/field boundary and no domain handlers. `ansible:create:ee-definition` is owned by WP-008's EE package/core Scaffolder integration. The AAP `rhaap:*` wrappers and `aap-api-cloud` provider remain WP-027-owned.

The generic bridge renders approved operation schemas, propagates task identity/correlation/idempotency, invokes by stable operation ID, and maps typed results/jobs/errors into task outputs. It does not define operation descriptors, own domain handlers, create a registry, or reimplement jobs/idempotency. It must reject arbitrary target URLs, method names, credentials, or undeclared payload forwarding.

This WP also owns partner enablement for declarative templates and the contribution guide: document and validate partner-owned SCM template registration, allowlisted remote skeleton fetching, publication, Catalog registration, permission/secret boundaries, and failure/rollback behavior. Standard Backstage `Template` entities remain declarative. Code-backed partner actions are not accepted through arbitrary template configuration; they require reviewed, signed/verified dynamic backend plugins and then invoke approved typed operations through this bridge where applicable.

```ts
await operationClient.invoke({
  operationId: ctx.input.operationId,
  version: ctx.input.version,
  subject: ctx.input.subject,
  input: ctx.input.parameters,
  idempotencyKey: ctx.task.id,
  correlationId: ctx.task.id,
});
```

## Implementation slices

1. Freeze the separate static-app, self-service-renderer, and RHDH-dynamic field inventories, all action/filter/provider IDs, template/task UX, safe OAuth restoration, and intentional differences from WP-001.
2. Extract `portal-scaffolder-frontend` and `scaffolder-backend-module-portal`, preserving generic action/filter/field behavior and IDs.
3. Create `scaffolder-backend-module-content-operations`; map eligible domain actions to approved WP-012 operation IDs and implement the bridge there against WP-012/WP-013.
4. Map synchronous results and durable job handles/errors into redacted task outputs.
5. Add schema-driven fields only for operations with `exposure.scaffolder` and supported schemas, then add compatibility adapters/telemetry.
6. Publish executable partner template and custom-action contribution examples, validation commands, review gates, and rollback instructions.

## Ordered PR series

1. **Baseline contracts:** freeze field/action/filter/provider inventories and add parity fixtures without moving ownership.
2. **Generic Scaffolder extraction:** publish `portal-scaffolder-frontend` and `scaffolder-backend-module-portal`, preserving IDs and behavior through compatibility exports.
3. **Operation bridge:** add `scaffolder-backend-module-content-operations`, synchronous/job result mapping, authorization/audit propagation, and security tests behind an exposure gate.
4. **Schema-driven fields and migration:** enable eligible operations, compatibility delegation, and telemetry while retaining named legacy actions.
5. **Partner enablement:** add executable template/action fixtures, validation commands, review gates, and rollback documentation without changing runtime ownership.

Each PR must pass its applicable tests below, preserve a releasable compatibility path, and avoid requiring a partial extraction from a later PR.

## Required tests

- Discovery/schema rendering, applicability, version mismatch, permission denial, and typed handler failure propagated from WP-012.
- Sync/job invocation, cancellation, timeout, restart, idempotency propagation, and WP-013 audit correlation.
- SSRF tests prove URL/method/header injection is impossible.
- Scaffolder and portal forms produce identical typed requests and errors.
- Logs and task outputs redact credentials/sensitive fields.
- Architecture tests prove `scaffolder-backend-module-content-operations` owns the bridge without Portal/AAP/domain handlers and `scaffolder-backend-module-portal` does not register it.
- Golden static/self-service/dynamic field lists preserve approved differences; generic action/filter IDs and outputs remain exact.
- Template browse/details/forms/task history and safe OAuth restoration pass route, reload, failure, accessibility, and browser-state tests.
- Partner fixtures cover local/remote declarative templates, skeleton fetch allowlist and SSRF denial, publication/Catalog registration, secret redaction, unavailable SCM, rollback, and rejection of unreviewed code-backed actions.

### Acceptance criteria

- Given an unregistered operation or arbitrary URL, invocation is rejected before network access.
- Given a registered operation, both UI and Scaffolder enforce the same schema, permissions, and output contract.
- Given duplicate submission, one external effect occurs under the operation’s idempotency contract.
- Given operation removal, the Scaffolder bridge no longer advertises it and existing job history remains readable through WP-012.
- Given the partner guide and sample repository, a partner can register, fetch, publish, and Catalog-register a declarative template without host source changes; any code-backed action follows the reviewed dynamic-plugin path.

## Rollback and completion

Retain named legacy actions while they delegate to the bridge; never restore arbitrary URL execution. Done means one representative operation works from both surfaces with security and audit tests green and the partner template/action contribution workflow passes end to end.
