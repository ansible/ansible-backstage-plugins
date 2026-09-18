# WP-009 — PostgreSQL content schema

| Field      | Value                                                                     |
| ---------- | ------------------------------------------------------------------------- |
| Phase      | 3 — Durable state                                                         |
| Depends on | WP-003                                                                    |
| Target     | `content-primitives-backend` repositories via Backstage `DatabaseService` |
| Outcome    | Durable canonical content/job/event state safe for restart and replicas   |

## Human summary

**Why this matters:** Canonical content and job state must survive backend restarts and remain consistent when multiple replicas run. Process memory alone cannot provide that durability.

**What will change:** PostgreSQL migrations and repository interfaces will store sources, observations, mutable references, manifests, evidence, reconciliation runs, jobs, events, deduplication keys, and retention metadata through Backstage's database service.

**PR scope:** Finalize the approved persistence details, implement transactional repositories and migrations, backfill existing Open Container Initiative (OCI) observations safely, switch reads to durable storage with a controlled fallback, and add operational readiness information.

**Not in this PR:** Visible catalog entities will not change, and process-local indexes will no longer be treated as authoritative storage. Schema ownership, data layout, retention, evidence storage, and backup behavior will not be chosen without the approved Architecture Decision Record (ADR).

**Success looks like:** Content and jobs remain consistent across restarts and replicas, backfills can resume without duplication, digest-owned records remain immutable, and documented rollback or restore procedures preserve all pre-migration data.

## Scope and changes

Define migrations and repository interfaces for sources, observations, mutable references, manifests, primitive/evidence records, reconciliation runs, jobs, outbox events, idempotency keys, and retention metadata. Backfill current OCI observations without changing visible entities. Process-local indexes become caches only.

The persistence ADR approved by WP-002 is required input evidence under the global execution protocol, not an additional dependency-register edge.

```sql
-- Illustrative only; names and types require the persistence ADR.
CREATE TABLE content_observation (
  id uuid PRIMARY KEY,
  content_key text NOT NULL,
  digest text NOT NULL,
  source_id uuid NOT NULL,
  observed_ref text,
  payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  UNIQUE (source_id, content_key, digest)
);
```

## Implementation slices

1. Approve ownership, transaction, retention, and downgrade ADR details.
2. Add repository interfaces and migration harness.
3. Implement PostgreSQL repositories and transaction boundaries.
4. Backfill existing observations with checksums and resumability.
5. Switch reads to durable repositories with a temporary controlled fallback.
6. Add migration, queue/projector lag, and last-reconcile readiness details.

## Ordered PR series

1. **Repository contracts and migration harness:** approve the persistence ADR, publish repository interfaces, and add empty/populated upgrade and restore fixtures without changing active reads.
2. **Canonical persistence:** add transactional PostgreSQL implementations for each record family and verify concurrency, identity, and backup behavior while the legacy index remains active.
3. **Resumable backfill:** migrate existing observations with checksums, restartability, and comparison reports; do not switch reads on mismatch.
4. **Guarded read cutover:** enable durable reads by record family with a controlled fallback and rollback telemetry.
5. **Operational certification:** remove authoritative in-memory assumptions only after restart/multi-replica tests and readiness/restore runbooks pass; compatibility removal remains separately gated.

Each PR must pass its applicable database and restore tests, preserve the pre-migration snapshot, and remain revertible without deleting canonical records written by later slices.

## Required tests

- **Database:** upgrade on empty/populated DB, constraints, concurrent writers, downgrade/restore, and migration restart.
- **Integration:** write/read every record family and preserve current REST fixtures.
- **Resilience:** backend restart and multiple replicas preserve content/jobs; failed backfill resumes safely.
- **Identity:** tag history is retained and digest-owned records are immutable.
- **Security:** tenant/resource access does not rely on caller-supplied SQL identifiers; sensitive evidence is appropriately separated/redacted.

### Acceptance criteria

- Given a backend restart or second replica, canonical content and job state remains consistent.
- Given a populated legacy index, backfill is repeatable and visible Catalog entities do not change.
- Given duplicate canonical input, constraints/repositories return the existing identity rather than duplicating state.
- Given rollback, documented restore/downgrade procedures preserve all pre-migration data.

## Decisions and completion

The ADR must decide schema ownership, JSON versus normalized columns, evidence/object storage, retention, migration compatibility, and backup/restore. Do not implement these by assumption. Done means the in-memory index is cache-only and multi-replica/migration tests pass.
