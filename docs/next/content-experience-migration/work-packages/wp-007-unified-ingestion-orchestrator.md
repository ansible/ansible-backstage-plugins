# WP-007 — Unified ingestion orchestrator

| Field      | Value                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| Phase      | 2 — Unified ingestion                                                                    |
| Depends on | WP-004 and WP-006                                                                        |
| Target     | `content-primitives-backend` using `content-primitives-node`                             |
| Outcome    | One source-to-observation pipeline feeding canonical state and compatibility projections |

## Human summary

**Why this matters:** Independent discovery paths can produce different identities and classifications for the same content. A single ingestion pipeline ensures the portal catalog and normalized service derive their results from one reconciliation run.

**What will change:** `ContentIngestionService` will select a source adapter, discover and resolve artifacts, run content-type processing in a defined order, apply policy, and commit one observation set for all compatibility projections.

**PR scope:** Add adapter and content-type registries, bounded and cancellable orchestration, shared legacy and normalized output, Open Container Initiative (OCI) and proof-of-concept integration, rollout flags, shadow comparison, and reconciliation telemetry.

**Not in this PR:** Durable cross-restart delivery, transactional outbox processing, leasing, and multi-replica idempotency are deferred to WP-009 and WP-010. This PR uses the existing persistence path through a temporary commit interface.

**Success looks like:** All projections from a run share the same identities, duplicate triggers within one process are coalesced, failed scopes retain prior successful data, and duplicate OCI discovery is removed or reduced to a facade over the service.

## Scope and changes

Introduce `ContentIngestionService`. It selects a configured backend adapter, discovers and resolves artifacts, invokes content-type identify/normalize/enumerate/relate hooks, applies update/integrity policy, and commits an observation set. Existing Catalog providers and the PoC index become consumers, not independent discoverers.

Until WP-009/WP-010 supply durable repositories and outbox semantics, this WP uses a temporary `ObservationCommitPort` contract implemented by the existing persistence path. This WP proves orchestration order, one-run identity, cancellation, bounded concurrency, compatibility output, and duplicate-trigger coalescing within the existing process. Cross-restart durability, transactional outbox delivery, leasing, and multi-replica idempotency are explicitly deferred to WP-009/WP-010.

```ts
// Temporary boundary implemented by the existing persistence path.
await ingestion.reconcile(sourceId, async observationSet => {
  await observationCommitPort.commit(observationSet);
});
```

WP-010 replaces this temporary port with the final transaction that commits canonical observations and their outbox event atomically.

## Implementation slices

1. Add adapter/content-type registries and deterministic selection.
2. Implement discovery through normalization with cancellation and bounded concurrency.
3. Produce legacy entities and normalized observations from one immutable run result.
4. Adapt the OCI provider and PoC index to the service.
5. Add per-source rollout flags, shadow comparison, and reconciliation telemetry.

## Required tests

- **Integration:** adapter → identify → normalize → enumerate → relate ordering and errors.
- **Convergence:** REST and Catalog derive identical digests/classifications from one run.
- **Resilience:** partial source/repository failure retains prior successful data; duplicate in-process triggers coalesce. Restart and durable duplicate-delivery guarantees are deferred to WP-009/WP-010.
- **Identity:** mutable ref drift creates a new digest observation without overwriting old governance records.
- **Architecture:** providers do not call protocol clients directly.

### Acceptance criteria

- Given one successful reconciliation, all projections reference the same run/observation IDs.
- Given duplicate triggers in one running instance, the temporary commit port prevents duplicate observations and compatibility events; WP-010 later proves restart/multi-replica idempotency.
- Given a failed scope, prior successful projection remains and failure status is visible.
- Given two matching full reconciliations and drift polls, legacy scheduling can be disabled per source.

## Rollback and completion

Select legacy or unified ingestion per configured source; never let both own the same provider/location key. Done means duplicate OCI discovery is removed or reduced to façades over this service.
