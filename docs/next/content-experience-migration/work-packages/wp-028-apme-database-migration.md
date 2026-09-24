# WP-028 — APME database migration

| Field         | Value                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ |
| Phase         | 9 — APME modularization                                                                    |
| Depends on    | WP-009                                                                                     |
| Source/target | Portal-local APME state → Backstage `DatabaseService` repositories                         |
| Outcome       | Durable portal-owned APME settings, outcomes, and scheduler state with resumable migration |

## Human summary

**Why this matters:** The portal's existing Ansible Policy & Modernization Engine (APME) scan and analysis settings, outcomes, and scheduler progress need to survive restarts and work consistently when multiple portal instances are running.

**What will change:** Portal-owned file-backed APME state and process-local scheduler state will move into PostgreSQL through Backstage's database service. Existing identifiers, timestamps, statuses, ordering, and visible behavior will be preserved.

**PR scope:** Add the database schema and repositories, a restartable migration with dry-run and progress reporting, comparison and cutover support, and operational guidance for backup, restore, retention, and downgrade.

**Not in this PR:** APME Gateway-owned projects, scans, and findings will not be copied into portal tables. Generic content storage also remains separate from APME-owned tables.

**Success looks like:** Migration can be interrupted and safely resumed without losing or duplicating data, including in a multi-instance deployment. The portal continues to read current scan and finding data from APME Gateway.

## Scope and changes

Inventory APME state and migrate only portal-owned local settings and overrides, local activity outcomes, and the scheduler cursor identified by WP-001 to PostgreSQL owned by the APME backend plugin. Preserve IDs, timestamps, status semantics, ordering, and REST-visible behavior. APME projects, scans, and findings remain authoritative in APME Gateway-owned storage and must not be copied into portal canonical tables. Keep APME tables separate from generic content schema except documented foreign identifiers/events.

```sql
-- Illustrative; final tables follow the accepted ownership ADR.
CREATE TABLE apme_activity_outcome (
  id uuid PRIMARY KEY,
  gateway_operation_id text NOT NULL,
  outcome jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
```

## Implementation slices

1. Freeze current state/REST/browser fixtures and schema ownership.
2. Add migrations, repositories, constraints, and transactional boundaries.
3. Build checksumed, restartable backfill with dry-run and progress reporting.
4. Dual-read/compare, then cut writes and reads to PostgreSQL.
5. Add backup/restore, downgrade, retention, readiness, and migration runbooks.

## Required tests

- Empty/populated upgrade, resume after interruption, duplicate rows, constraints, and rollback/restore.
- Old/new REST/SSE and UI fixtures remain equivalent.
- Restart/multi-replica persistence and concurrent update conflicts.
- Cross-plugin identifier integrity without cross-schema writes.
- Sensitive settings/activity outcomes are protected and migration logs are redacted/audited.
- Gateway-owned projects/scans/findings are never imported into or served authoritatively from portal tables.

### Acceptance criteria

- Given baseline state, migration preserves counts, IDs, checksums, timestamps, and visible ordering.
- Given interruption, rerun resumes safely without duplicate or lost state.
- Given rollback, documented restore returns to a supported version with pre-migration data intact.
- Given multiple replicas, state and job ownership remain consistent.
- Given a Gateway scan or finding changes, the portal reads Gateway-owned state rather than a local canonical copy.

## Decisions and completion

Resolve source-store format, schema ownership, dual-write duration, sensitive-field encryption, retention, and downgrade limits by ADR. Done means APME has no authoritative process-local persistence.
