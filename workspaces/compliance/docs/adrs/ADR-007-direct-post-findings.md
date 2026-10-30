---
title: "ADR-007: Direct POST Findings from Playbook to Plugin API"
description: "The current approach parses compliance findings from Controller job events (`runner_on_ok` / `runner_item_on_ok` events)"
type: adr
status: accepted
date: 2026-05-26
product: "AAP Compliance Dashboard"
---
# ADR-007: Direct POST Findings from Playbook to Plugin API

**Status:** Accepted (implemented in PRs #17, #19)
**Date:** 2026-05-26
**Updated:** 2026-05-27
**Deciders:** M. Ferrari, PM, architect

## Context

The current approach parses compliance findings from Controller job events (`runner_on_ok` / `runner_item_on_ok` events). This works but is fragile:

- Controller events were not designed for bulk data transfer
- Events have a ~200KB payload size limit, requiring slim findings (ADR-005)
- The backend must poll job events and parse specific task names to extract findings
- Any change in task naming or event structure breaks the pipeline

The PM and architect both recommend decoupling the data channel from Controller's event system.

## Decision

Have the playbook POST findings directly to the plugin's REST API, bypassing Controller events entirely.

Implementation (PRs #17, #19):
1. Added `/api/compliance/findings/ingest` endpoint accepting CFF JSON + scanId
2. Added `uri` task in the normalize play to POST findings to the Portal backend URL (passed as `backstage_api_url` extra_var)
3. `scan_id` passed as extra_var so playbook knows which scan to associate findings with
4. Event parsing retained as fallback when `backstage_api_url` is not set

Security (PR #19 -- see also ADR-010):
- Per-scan ingest token generated at scan launch, passed as `ingest_token` extra_var
- Token is single-use and scoped to the scan_id
- Endpoint validates token before accepting findings

Hardening (PR #19):
- Scan lifecycle fix: scans marked failed on launch error (no orphaned "running" scans)
- Variable ordering fix for extra_vars passed to Controller
- Jinja `default([])` hardening in normalize play to prevent undefined variable errors

The slim-findings-via-events approach (ADR-005) is retained as a fallback but is no longer the primary data channel.

## Consequences

- **Positive:** Decouples data channel entirely from Controller's event system.
- **Positive:** Works regardless of finding count -- no size limits.
- **Positive:** Testable in isolation (POST JSON to endpoint, verify storage).
- **Positive:** Full CFF metadata can be transmitted (no stripping needed).
- **Positive:** Per-scan ingest tokens prevent unauthorized submissions (ADR-010).
- **Negative:** Requires EE network access to Portal backend -- may not work in air-gapped environments without additional network configuration.
- **Negative:** Adds a new auth surface (mitigated by per-scan tokens, ADR-010).
- **Negative:** Two data channels during transition (events as fallback, direct POST as primary).

## Implementation Notes (PRs #17, #19)

- Endpoint: `POST /api/compliance/findings/ingest` with `{ scan_id, ingest_token, findings[] }`
- Extra vars passed to assessment JT: `scan_id`, `backstage_api_url`, `ingest_token`
- Normalize play uses `uri` module to POST findings; falls back to event-based approach if `backstage_api_url` is not set
- Scan lifecycle: backend marks scan as `failed` if Controller launch returns an error (no orphaned running scans)
- Jinja hardening: `default([])` on list variables in normalize play prevents undefined variable errors

## Amendment: Findings Deduplication (2026-06-06)

The ingest endpoint now uses `onConflict('scan_id', 'rule_id', 'host').merge()` when saving findings, backed by a unique constraint added in migration 016. This prevents duplicate rows when a playbook retries the POST after a transient failure or when findings for the same `(scan_id, rule_id, host)` tuple arrive via both Direct POST and event fallback. The merge strategy updates all mutable columns (status, severity, evidence, actual/expected values) with the latest data. See ADR-018 for full rationale.

Additionally, `upsertRuleMetadata` now writes `aap_impact` and `aap_impact_reason` fields to the rule metadata table. The `normalize_xccdf` module emits `aap_impact` from the `rules_metadata_file` parameter, and `buildMultiHostFindings` reads impact data exclusively from the DB metadata table. The YAML fallback path has been removed entirely -- the DB is the sole runtime cache for rule enrichment metadata.

## Amendment: NDJSON Content-Type Negotiation (2026-06-26)

The `/findings/ingest` endpoint now accepts both `application/json` (original) and `application/x-ndjson` (streaming). NDJSON uses a preamble line for metadata and streams findings line-by-line in batches of 500. See ADR-034 for full specification.

## Related

- ADR-005: Slim Findings for Event Storage (fallback channel)
- ADR-010: Per-Scan Ingest Token
- ADR-018: Findings Deduplication
- ADR-030: Per-Host Normalization
- ADR-033: File-Streamed API Ingestion
- ADR-034: NDJSON Content-Type Negotiation
