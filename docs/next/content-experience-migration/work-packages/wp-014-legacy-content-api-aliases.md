# WP-014 — Legacy content API aliases

| Field      | Value                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Phase      | 4 — Read/write API                                                                                          |
| Depends on | WP-011                                                                                                      |
| Targets    | Compatibility layers in `content-primitives-backend` plus delegated legacy owners named by the route ledger |
| Outcome    | Existing PoC consumers continue operating while usage is measured and retired                               |

## Human summary

**Why this matters:** Existing proof-of-concept and Red Hat Ansible Automation Platform (RHAAP) Catalog clients must keep working while the new normalized services are introduced.

**What will change:** Compatibility aliases will cover all 33 routes recorded in the two existing route ledgers. Content routes will use WP-011 directly, while routes whose normalized owners are not ready will continue through explicitly named compatibility ports.

**PR scope:** Generate route coverage from the ledgers, add request and response translators, preserve asynchronous and cancellation behavior, create golden compatibility tests, measure route usage, and document retirement gates.

**Not in this PR:** No Hypertext Transfer Protocol (HTTP) routes absent from the ledgers will be added, and the aliases will not create separate persistence or orchestration. Existing route ownership remains unchanged, including the Catalog module's `GET /health` route.

**Success looks like:** Legacy clients continue unchanged, normalized and legacy responses reflect one source of truth, and aliases cannot be removed until measured zero usage and rollback requirements are satisfied.

## Scope and changes

Coordinate every declaration in both content compatibility families recorded by WP-001: the exact 20-route proof-of-concept automation content router and the 13-route current RHAAP Catalog router. The 20-route ledger is implemented by the `content-primitives-backend` compatibility layer and covers health, registries, synchronization/polling, content, execution environments, collections, content items/plugins, requirements resolution, and configuration export/validation; it does **not** contain scan, job, or SSE declarations. For the 13-route RHAAP ledger, this WP supplies the shared compatibility adapters/fixtures but preserves each row's canonical runtime owner. In particular, `GET /health` remains owned by `catalog-backend-module-aap` at its existing module mount and delegates to module readiness; it must never be mounted by `content-primitives-backend`. Preserve each family's exact mount, methods, paths, statuses, bodies, headers, errors, authorization, limits/concurrency, pagination, and cancellation unless an approved security fix is documented. Do not fork persistence or orchestration.

At this WP's completion, content/detail aliases call WP-011 normalized query services. Other rows delegate through explicitly named compatibility ports to the existing implementation until their normalized owners land: AAP identity/job-template sync and onboarding (WP-027/WP-044), EE operations (WP-008), Git source/file/CI/sync operations (WP-015), Automation Hub sync (WP-041), source administration/status (WP-042), and requirements resolution (WP-035). Each owner replaces only its port binding without changing the legacy route. A row may not falsely claim normalized delegation before its target exists.

```ts
router.get('/legacy/content/:id', async (req, res) => {
  legacyUsage.record(req, 'legacy-content-detail');
  const normalized = await service.getContent(
    mapLegacyId(req.params.id),
    caller(req),
  );
  res.json(toLegacyContentResponse(normalized));
});
```

## Implementation slices

1. Generate alias coverage from all 33 rows across the two WP-001 ledgers; classify each row as preserved, delegated, or approved for retirement and record its exact normalized owner.
2. Add request/response/error translators and golden tests.
3. Add cancellation and partial-result translation for applicable sync/poll routes; do not add routes absent from the ledger.
4. Add route-level usage/deprecation telemetry without sensitive cardinality.
5. Publish removal criteria and migrate known consumers.

## Ordered PR series

1. **Generated route manifest:** freeze all 33 ledger rows, exact owners, mounts, methods, translators, and expected fixtures; no routing changes.
2. **Automation-content aliases:** add the 20-route proof-of-concept family behind its own flag, delegating each row to WP-011 or its explicitly named compatibility port.
3. **RHAAP compatibility family:** add shared adapters/fixtures for the 13-route family in its existing owners, preserving the Catalog-owned health route and independently flagging each owner.
4. **Telemetry and migration:** add privacy-safe usage, consumer classification, notices, and per-family removal/rollback gates; actual removal remains WP-039-owned.

Each PR must preserve exact golden behavior for its family, remain independently deployable, and roll back through that family's flag without restoring duplicate persistence.

## Required tests

- **Golden compatibility:** baseline and alias responses/status/headers are equivalent.
- **Async compatibility:** cancellation, `200`/`207` sync behavior, `202` source sync, and retained-previous behavior remain compatible where applicable.
- **Architecture:** aliases call normalized services and create no separate state.
- **Security:** current authorization is preserved or strengthened only through an approved exception.
- **Telemetry:** known consumer, unknown consumer, and zero-usage windows are measurable.

### Acceptance criteria

- Given every row in both route ledgers, an automated fixture exercises its compatibility alias or records an approved removal.
- Given canonical data changes, normalized and legacy responses update from one source of truth.
- Given alias usage, metrics identify route and approved caller class without secrets or user-sensitive labels.
- Given a retirement window, aliases cannot be removed until the documented zero-usage and rollback gates pass.

## Rollback and completion

Aliases have an independent flag; rollback re-enables them without restoring old persistence. Done means all legacy clients pass unchanged against the alias layer and retirement evidence is available.
