# WP-010 — Reconcile/outbox/idempotency

| Field      | Value                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| Phase      | 3 — Durable state                                                                           |
| Depends on | WP-009                                                                                      |
| Target     | `content-primitives-backend`                                                                |
| Outcome    | Crash-safe reconciliation and asynchronous projection with deterministic delivery semantics |

## Human summary

**Why this matters:** Content updates must survive crashes and retries without leaving the system in an inconsistent state or creating duplicate visible records.

**What will change:** Canonical content changes and their outgoing events will be saved in one PostgreSQL transaction. Bounded workers will use leases, retries, deduplication, checkpoints, and dead-letter storage to process those events safely.

**PR scope:** Add the persistence repositories, transactional writes, dispatcher, idempotent-consumer helpers, authenticated replay operations, metrics, readiness details, runbooks, and fault-focused tests.

**Not in this PR:** This does not promise exactly-once delivery. Events may be delivered more than once, so consumers must process duplicates safely.

**Success looks like:** Multiple replicas converge on the same result after duplicate delivery, outages, crashes, and restarts. Failed events can be inspected and replayed with authorization, redaction, and a complete audit trail.

## Scope and changes

Persist reconciliation runs, canonical mutations, outbox rows, idempotency keys, leases, retries, dead letters, and projector checkpoints. Canonical state and outbox events commit in one PostgreSQL transaction. Document and implement the accepted delivery contract—normally at-least-once with idempotent consumers—rather than promising exactly-once behavior.

```sql
-- Illustrative atomic write.
BEGIN;
INSERT INTO primitive_record (...) VALUES (...) ON CONFLICT (...) DO UPDATE ...;
INSERT INTO outbox_event (id, topic, aggregate_id, payload, available_at)
VALUES (:event_id, :topic, :aggregate_id, :payload, now());
COMMIT;
```

Consumers derive stable deduplication keys from event ID plus projector version. Leases use database time and guarded ownership updates. Dead-letter replay is an authenticated, audited operation.

## Implementation slices

1. Add run/outbox/idempotency/lease/dead-letter repositories and constraints.
2. Wrap canonical mutations and event creation in one transaction.
3. Add a bounded, cancellable dispatcher with retry/backoff and lease recovery.
4. Add projector checkpoint and idempotent-consumer helpers.
5. Add replay/inspection operations, metrics, readiness details, and runbooks.

## Required tests

- **Database:** rollback leaves neither state nor event; commit leaves both.
- **Concurrency:** multiple replicas cannot process a lease concurrently; expired lease is recoverable.
- **Resilience:** crash before/after publish, duplicate delivery, poison event, database outage, and restart.
- **Operations/security:** dead-letter inspection/replay authorization, redaction, audit, queue depth, age, retry, and lag metrics.

### Acceptance criteria

- Given duplicate event delivery, every projector converges without duplicate visible records.
- Given a worker dies with a lease, another worker resumes after expiry without manual database edits.
- Given retry exhaustion, the event is quarantined with safe diagnostics and prior canonical data remains available.
- Given replay, authorization and audit identify principal, event, reason, and result.

## Rollback and completion

Disable dispatchers before schema rollback; preserve outbox/dead-letter rows for replay. Done means restart and multi-replica fault tests prove the accepted delivery contract and operational alerts are defined.
