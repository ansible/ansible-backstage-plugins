# WP-019 — Primitive processor framework

| Field      | Value                                                                         |
| ---------- | ----------------------------------------------------------------------------- |
| Phase      | 6 — Projection and processors                                                 |
| Depends on | WP-004, WP-009, and WP-010                                                    |
| Target     | `content-primitives-node` and `content-primitives-backend`                    |
| Outcome    | Versioned, idempotent, replayable processor execution over immutable subjects |

## Human summary

**Why this matters:** Content checks need a reliable way to run repeatedly without duplicating results, losing history, or allowing one failed check to stop unrelated work.

**What will change:** A processor framework will register and select checks, schedule bounded work, store results and evidence atomically, and support retries, cancellation, replay, and backfills. Results will clearly distinguish unknown, not scanned, partial, and failed states.

**PR scope:** Finalize and implement against the WP-004 processor contracts, adding the registry, dependency validation, durable execution, idempotency, persistence, update events, operational controls, and representative built-in and external processors.

**Not in this PR:** The full trust, quality, and intent processor suites are separate work packages, as are the application programming interface and user-interface surfaces that later consume these records.

**Success looks like:** Replaying unchanged input produces no duplicate semantic records, while changed inputs or processor versions create traceable superseding results. Execution converges after crashes or restarts, and independent processors continue when one fails.

## Scope and changes

Implement processor registration, matching, scheduling, execution, persistence, retry, cancellation, and replay. A processor declares ID/version, supported content and primitive namespaces, required capabilities, deterministic input digest, resource limits, and sensitivity. Results use semantic states (`known`, `unknown`, `not_scanned`, `partial`, `failed`) and never collapse operational failure into negative evidence.

```ts
interface PrimitiveProcessor<I, O> {
  readonly id: string;
  readonly version: string;
  matches(subject: ContentSubject, context: ProcessorContext): boolean;
  inputDigest(input: I): Promise<string>;
  process(
    input: I,
    context: ProcessorContext,
    signal: AbortSignal,
  ): Promise<PrimitiveResult<O>>;
}
```

## Implementation slices

1. Freeze processor/result/version contracts and registration rules.
2. Add registry, directed acyclic graph (DAG)/cycle validation, matching, and idempotency keys.
3. Add bounded worker execution using durable jobs/outbox.
4. Persist records/evidence/provenance atomically and emit update events.
5. Add replay/backfill operations, quotas, audit, metrics, and runbooks.

## Required tests

- Registry conflicts, cycles, ordering, matching, timeouts, cancellation, retries, and version changes.
- Duplicate execution produces one semantic record per idempotency key.
- Unknown/not-scanned/partial/failed remain distinguishable in storage and in published REST/Catalog/UI contract fixtures. WP-011, WP-018, WP-025, and WP-038 consume those fixtures when their surfaces exist; they are not completion prerequisites here.
- Malicious output cannot inject secrets, unbounded evidence, or cross-content records.
- Crash/restart and multi-replica execution converge.

### Acceptance criteria

- Given unchanged processor/version/input digest, replay does not duplicate records.
- Given a version or input change, a new result supersedes rather than mutates historical provenance.
- Given one processor fails, independent processors continue and failure is visible.
- Given cancellation, execution terminates and committed state accurately reflects completion.

## Rollback and completion

Disable processor IDs without deleting records; restore a prior package version and replay if needed. Done means the framework supports one representative built-in and external processor with deterministic restart behavior.
