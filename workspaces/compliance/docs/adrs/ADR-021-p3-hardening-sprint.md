---
title: "ADR-021: P3 Hardening Sprint — Router Decomposition, Security, and UX"
description: "ADR-017 identified a B+ production readiness grade with 8 HIGH and 13 MEDIUM findings"
type: adr
status: accepted
date: 2026-04-23
product: "AAP Compliance Dashboard"
---
# ADR-021: P3 Hardening Sprint — Router Decomposition, Security, and UX

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2026-06-08 |
| Deciders | Architecture review |
| Informed by | ADR-017 (Architect Review Hardening Backlog) |

## Context

ADR-017 identified a B+ production readiness grade with 8 HIGH and 13 MEDIUM findings. The P3 hardening sprint addresses the critical and high items from that backlog plus additional UX improvements discovered during testing.

## Decisions

### 1. Router Decomposition (P3.1)

The monolithic 1,599-line `router.ts` was the primary maintenance risk. Split into 12 focused modules under `src/routes/`:

| Module | Responsibility | Routes |
|--------|---------------|--------|
| `types.ts` | `RouterDependencies`, `SharedState`, `ScanResolution` interfaces | — |
| `validation.ts` | Input validation predicates | — |
| `permissions.ts` | `getUserAapToken`, `requirePermission`, `extractUserIdentity` | — |
| `helpers.ts` | `resolveScanId`, `savePostureFromFindings`, `fetchLiveFindings` | — |
| `health.ts` | Health check, settings, cleanup | 3 |
| `scans.ts` | Scan history, launch, stats, N/A, backfill | 11 |
| `findings.ts` | Get findings, previous findings, ingest | 3 |
| `remediation.ts` | Launch, executions, profiles, reconciliation | 10 |
| `baseline.ts` | Baseline targets and scores | 4 |
| `dashboard.ts` | Dashboard stats, posture history | 3 |
| `controller.ts` | Controller proxy (status, events, nodes, resource lookups) | 9 |
| `profiles.ts` | Compliance profile CRUD | 4 |

**Key constraint**: Route registration order must be preserved — `/scans/authoritative`, `/scans/stats`, and `/scans/:scanId/findings/na` must register before `/scans/:scanId` to prevent wildcard capture.

### 2. Rate Limiting on Ingest (P3.2)

- `express-rate-limit` applied to `POST /findings/ingest`: 30 requests/minute per IP
- Body limit: 50MB (was reduced to 10MB during P3, reverted 2026-06-18 after fix_text enrichment from ADR-020 made payloads larger — 18 hosts × 600 rules with Ansible YAML fix_text exceeded 10MB)
- Rate limiter is in-process (per-instance); documented limitation for multi-replica deployments

### 3. User Identity Tracking (P3.3)

- `extractUserIdentity(req, httpAuth)` extracts `userEntityRef` from Backstage credentials
- Wired into `POST /remediate` → `createdBy` on execution records
- Fails open (returns `undefined` in dev mode) — remediation is not blocked by identity lookup failure

### 4. N/A Type Safety and Denominator Adjustment (P3.4, ADR-015 §4)

- `MultiHostFinding.hosts[].status` expanded from `'pass' | 'fail' | 'error'` to include `'not_applicable'`
- `totalCount` now excludes N/A hosts: pass rate = `passCount / (passCount + failCount)`
- `naCount` added to `MultiHostFinding` for per-rule N/A host count
- Backfill endpoint `POST /scans/:scanId/backfill` re-ingests findings from Controller events using existing `onConflict.merge()` semantics

### 5. Dashboard Query Batching (P3.5)

- `getBaselineScoresBatch()` replaces per-baseline `getBaselineScore()` loop in `getDashboardStats()`
- Single query fetches all baseline scores grouped by scan ID
- Remediation profiles pre-fetched in parallel with `Promise.all()`

### 6. Execution Reconciliation Throttle (P3.6)

- `executionReconcileThrottle` map added to shared state
- `GET /remediation-profiles` reconciliation throttled to 30-second intervals per execution ID
- Matches the existing `staleScanThrottle` pattern for scan reconciliation

### 7. UX: Inventory Chip on Results Page

- `useScanMetadata` hook now resolves inventory name via `api.getInventories()`
- Outlined chip with list icon displayed next to certification badge
- Scan date shown in header for temporal context
- Header renders when `profileName` exists (previously gated on `profileCert`, hiding header for uncertified profiles)

### 8. UX: Clickable Comparison Stats

- "X Rules Improved", "X Rules Regressed", "X Rules Unchanged" in VerificationComparison are now clickable
- Clicking filters the findings table to show only rules in that category
- Active filter shown with subtle background highlight and a clearable filter pill
- Toggle behavior: click again to clear, or use pill × button
- `comparison` filter key added to `useFindingsFilter` hook via URL search params

### 9. Portal Wildcard Route

- Frontend dynamic route changed from `path: /compliance` to `path: /compliance/*`
- Required for Portal/RHDH to serve sub-routes (e.g., `/compliance/results/:jobId`)
- Deploy script now applies `sed` fix on each deploy to ensure wildcard persists

## Consequences

- Router files average ~150 lines each instead of one 1,599-line file
- Express-rate-limit adds ~400KB to the backend bundle (acceptable for security)
- `naCount` is a required field on `MultiHostFinding` — all constructors updated
- Dashboard with 3 profiles × 10 inventories now makes 1 batch query instead of 30
- Execution reconciliation no longer hammers Controller API on every page load
