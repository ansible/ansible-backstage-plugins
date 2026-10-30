---
title: "ADR-018: Findings Deduplication via Unique Constraint"
description: "Duplicate findings rows were observed in the `compliance_findings` table under several scenarios:"
type: adr
status: accepted
date: 2026-06-06
product: "AAP Compliance Dashboard"
---
# ADR-018: Findings Deduplication via Unique Constraint

**Status:** Accepted (implemented 2026-06-06)  
**Date:** 2026-06-06  
**Deciders:** Massimo Ferrari  

## Context

Duplicate findings rows were observed in the `compliance_findings` table under several scenarios:

1. **Direct POST retry.** The playbook's `uri` task retries after a transient network failure, sending the same findings batch twice. Since the ingest token is scoped to the scan (not single-use per POST -- see ADR-010 notes on relaxation), both POSTs succeed.

2. **Dual-channel overlap.** When `backstage_api_url` is set, findings arrive via Direct POST (ADR-007). If the event fallback path also runs (e.g., the normalize play emits facts that the backend parses), the same findings are inserted twice.

3. **Multi-host scans with host overlap.** If the `normalize_xccdf` module processes the same host's results from multiple XCCDF files (e.g., a re-scan that produces both old and new result files), duplicate `(scan_id, rule_id, host)` tuples are inserted.

Duplicates caused three downstream problems:

- **Inflated finding counts.** Dashboard pass/fail totals doubled for affected rules, misrepresenting compliance posture.
- **Incorrect state transitions.** Layer 2 state tracking (ADR-016) computes `new/active/fixed/resurfaced` by comparing consecutive scans per `(rule_id, host)`. Duplicate rows caused a single host-rule to appear multiple times in the comparison, producing spurious state transitions.
- **Incorrect host grouping.** `groupFindingsByRule` (used by the remediation plan builder) listed the same host twice under a rule, inflating host counts in remediation plans.

## Decision

Enforce uniqueness at the database level with a UNIQUE constraint on `compliance_findings(scan_id, rule_id, host)`, and use `onConflict(...).merge()` semantics in all write paths.

### Migration 016

1. Clean existing duplicates by keeping the first-inserted row (`MIN(id)`) per `(scan_id, rule_id, host)` group.
2. Add `UNIQUE(scan_id, rule_id, host)` constraint.

### Write path changes

- **`saveFindingsForScan`** (batch insert from event parsing): uses `onConflict('scan_id', 'rule_id', 'host').merge()` to update mutable columns (status, severity, evidence, actual_value, expected_value, finding_state) on collision.
- **`saveScanResults`** (Direct POST ingest path): same onConflict merge pattern.
- **`groupFindingsByRule`** (FindingsParser): defense-in-depth `seenHosts` Set skips duplicate hosts even if duplicates somehow survive the DB layer.

### Merge strategy

On conflict, the later-arriving row wins for all mutable columns. This is correct because:
- A retry sends the same data (idempotent merge).
- The event fallback path produces the same data as Direct POST (same normalizer output).
- If data differs (e.g., a re-scan of the same host within the same scan_id, which should not happen), the latest status is the most accurate.

## Consequences

- Duplicate findings are prevented at the database level -- no application-level dedup needed.
- Dashboard counts, state transitions, and remediation host grouping are correct by construction.
- The `onConflict.merge()` pattern makes Direct POST retries idempotent, improving resilience in unreliable network environments.
- The UNIQUE constraint adds ~2% overhead to batch INSERT operations (index maintenance). At the current scale (~400 findings per scan per host), this is negligible.
- Existing data is cleaned during migration 016 -- the first-inserted row is preserved, which may not always be the "best" row, but since both rows should contain identical data (same normalizer run), this is safe.

## Alternatives Considered

1. **Application-level dedup before INSERT.** Rejected: does not prevent races between the two ingest channels (Direct POST vs event parsing), and adds complexity to every write path.
2. **Delete-and-reinsert per scan.** Rejected: loses finding_state values computed by Layer 2, and creates a window where concurrent reads see incomplete data.
3. **Ignore duplicates (`onConflict.ignore()`).** Rejected: if the second arrival has corrected data (e.g., a retry after a partial POST where some findings were truncated), the correction would be silently dropped.

## Related

- ADR-007: Direct POST findings (amended with dedup notes)
- ADR-010: Per-scan ingest token (token reuse enables retries)
- ADR-016: Lifecycle visualization (amended with dedup dependency)
- Migration: `20260606_016_findings_unique_index.ts`
