---
title: "ADR-017: Architect Review — Hardening Backlog"
description: "Post-MVP architect review of the compliance plugin codebase"
type: adr
status: accepted
date: 2026-06-03
product: "AAP Compliance Dashboard"
---
# ADR-017: Architect Review — Hardening Backlog

**Status:** Accepted  
**Date:** 2026-06-03  
**Review scope:** Full codebase at commit `fea903b` (main), backend v0.13.3, frontend v0.10.5

## Context

Post-MVP architect review of the compliance plugin codebase. The plugin is deployed to Netrunner staging and has shipped 16 ADRs, 13 migrations, 304 tests across 12 suites. This ADR captures findings and prioritizes them for future work.

**Overall grade: B+ (production-ready MVP)**

## Positive Findings

- All SQL queries use Knex query builder — no injection risk
- Per-scan ingest tokens (ADR-010) prevent unauthorized data injection
- CORS delegated to Backstage httpRouter (correct pattern)
- Permission checks use Backstage framework (`catalogEntityCreatePermission`)
- AAP tokens passed via header, never query params
- No `eval()` or `Function()` constructors
- `.env` files properly gitignored
- Clean separation of concerns (backend/frontend/common)
- 16 ADRs documenting all architectural decisions
- Migration ordering is correct, no gaps

## HIGH Severity Findings

### H1: SQL Interpolation Risk in Migration 011 Backfill
- **File:** `migrations/20260601_011_remediation_lifecycle.ts:63-109`
- **Issue:** Backfill INSERT uses values from old scan records without parameterization
- **Risk:** Low (migration runs once, data is internal), but pattern should not be copied
- **Fix:** Use Knex query builder for the INSERT

### H2: No Rate Limiting on `/findings/ingest`
- **File:** `router.ts:754`
- **Issue:** Direct POST endpoint accepts up to 50MB, no rate limit
- **Risk:** Low in current deployment (internal network, Portal auth required)
- **Fix:** Add `express-rate-limit` (10 req/min) when moving to production
- **Backlog priority:** P3 (pre-production)

### H3: No Size Validation on Evidence Field
- **File:** `router.ts:776-783`
- **Issue:** Evidence field from findings not size-limited
- **Risk:** Low (ingest requires valid token, data comes from OpenSCAP)
- **Fix:** Add 10KB limit on evidence field at ingest

### H4: Unsafe `Number()` Coercion in Route Handlers
- **File:** `router.ts:276, 342, 390`
- **Issue:** `Number()` returns NaN for invalid input, passes to DB query
- **Fix:** Replace with `parseInt(value, 10)` + `Number.isNaN()` check
- **Backlog priority:** P2 (quick fix)

### H5: Concurrent Execution Guard — Silent Collision
- **File:** `ComplianceDatabase.ts:717-760`
- **Issue:** UNIQUE constraint collision returns `null` without logging
- **Fix:** Add `logger.warn()` on collision for observability
- **Backlog priority:** P2 (quick fix)

### H6: No Timeout on Controller API Calls
- **File:** `ControllerClient.ts` (all fetch calls)
- **Issue:** No abort signal / timeout on outbound HTTP
- **Risk:** Hung requests if Controller is slow
- **Fix:** Add `AbortSignal.timeout(30000)` to fetch options
- **Backlog priority:** P2

### H7: Ingest Token Not Deleted After Use
- **File:** `router.ts:796-838`
- **Issue:** Token validated but never invalidated after successful ingest
- **Risk:** Low (tokens are per-scan, scan transitions to completed)
- **Fix:** Delete token row after successful ingest
- **Backlog priority:** P3

### H8: Missing Index on `compliance_findings.finding_state`
- **File:** Migration gap
- **Issue:** `finding_state` used in WHERE clause filters, no index
- **Fix:** Add index in migration 014
- **Backlog priority:** P2 (quick fix)

## MEDIUM Severity Findings

### M1: Inconsistent Error Response Format
- **Issue:** Some routes return `{ error: string }`, others `{ error: { name, message, detail } }`
- **Fix:** Standardize on structured `{ error: { code, message, details? } }`
- **Backlog priority:** P3

### M2: No Pagination on `/findings` Endpoint
- **File:** `router.ts:632`
- **Issue:** Returns all findings for a scan without limit
- **Risk:** Low at current scale (~200 rules), risk grows with multi-host scans
- **Fix:** Add `offset`/`limit` query params, default limit 1000
- **Backlog priority:** P3

### M3: `staleScanThrottle` Map Never Cleared
- **File:** `router.ts:169`
- **Issue:** Map grows unbounded; entries not removed when scans complete
- **Fix:** Clear entry when scan reaches terminal state
- **Backlog priority:** P2

### M4: `parseInProgress` Set — No Timeout Guard
- **File:** `router.ts:173`
- **Issue:** If parsing fails before `finally` block, scan ID stays in set forever
- **Fix:** Add 5-minute timeout cleanup as safety net
- **Backlog priority:** P2

### M5: `recentRemediations` Cleanup Interval Never Cleared
- **File:** `router.ts:151-156`
- **Issue:** `setInterval` runs forever, not cleaned up on router disposal
- **Fix:** Return cleanup function from `createRouter`
- **Backlog priority:** P3

### M6: Nullable Returns Without Null Checks
- **Issue:** `getScanById` returns `T | null` but callers sometimes assume non-null
- **Fix:** Add explicit null checks or non-null assertions with comments
- **Backlog priority:** P3

### M7: No Validation on `extra_vars` JSON
- **Issue:** Job template extra_vars accepted without schema validation
- **Fix:** Add JSON.parse try/catch + known-field validation
- **Backlog priority:** P4

### M8: Migration 010 Missing Index Drops in `down()`
- **File:** `migrations/20260530_010_posture_inventory_scan.ts`
- **Issue:** `down()` drops columns but not their indexes first
- **Fix:** Add explicit `table.dropIndex()` calls before column drops
- **Backlog priority:** P4

### M9: No Content-Type Validation on Ingest
- **File:** `router.ts:755`
- **Fix:** Check `Content-Type: application/json` header
- **Backlog priority:** P4

### M10: Frontend API Client Swallows Errors
- **File:** `ComplianceBackendClient.ts:170-172, 254-258`
- **Issue:** Catch blocks return `null` without logging
- **Fix:** Add `console.error()` for debugging
- **Backlog priority:** P3

### M11: Rule Metadata Upsert Failure is Silent
- **File:** `router.ts:810-816`
- **Issue:** Upsert errors logged as warning, not surfaced to user
- **Fix:** Return partial success indicator
- **Backlog priority:** P4

### M12: Missing Index on `compliance_scans.inventory_id`
- **Fix:** Add index in migration 014 (bundle with H8)
- **Backlog priority:** P2

### M13: Timestamp Type Inconsistency
- **Issue:** Some migrations use `timestamp()`, others `string()` for date columns
- **Risk:** Low (SQLite treats both as text), would matter for PostgreSQL
- **Fix:** Standardize on string ISO8601 when adding PostgreSQL support
- **Backlog priority:** P4

## Recommended Fix Bundles

### Bundle 1: Quick Hardening (1-2 hours)
- H4: parseInt + NaN check (3 locations)
- H5: Add collision logging
- H8 + M12: Migration 014 with two indexes
- M3: Clear staleScanThrottle on terminal state
- M4: Add timeout guard on parseInProgress

### Bundle 2: Security Hardening (pre-production)
- H2: Rate limiting on ingest
- H3: Evidence field size limit
- H6: Controller API timeouts
- H7: Delete ingest token after use
- M9: Content-Type validation

### Bundle 3: Code Quality (tech debt sprint)
- M1: Standardize error format
- M2: Pagination on /findings
- M5: Interval cleanup
- M6: Null check audit
- M10: Frontend error logging

## Decision

All findings are accepted and prioritized. Bundle 1 is the next PR. Bundle 2 is pre-production. Bundle 3 is tech debt.

No architectural changes required — the plugin structure, patterns, and security baseline are sound for an MVP.

## Amendment: Findings Resolved (2026-06-06)

The following items have been partially or fully addressed by today's changes:

- **M11 (Rule Metadata Upsert)**: `upsertRuleMetadata` now correctly writes `aap_impact` and `aap_impact_reason` fields. The YAML fallback path that was masking upsert failures has been removed entirely -- the DB is the sole runtime cache (ADR-019). Silent failure of the upsert itself remains; the warning-level logging is retained as sufficient for an MVP since ingest tokens already restrict who can submit data.
- **Code quality**: The monolithic `ComplianceService.ts` (flagged informally as a maintainability concern) has been decomposed into three focused modules: `FindingsParser`, `RemediationPlanBuilder`, and `DashboardAggregator` (ADR-019). This reduces the blast radius of changes and improves testability.
