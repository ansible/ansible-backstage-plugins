---
title: "ADR-005: Slim Findings for Controller Event Storage"
description: "The backend parses compliance findings from Controller job events (`runner_on_ok` or `runner_item_on_ok` events containi"
type: adr
status: accepted
date: 2026-05-26
product: "AAP Compliance Dashboard"
---
# ADR-005: Slim Findings for Controller Event Storage

**Status:** Accepted
**Date:** 2026-05-26 (PRs #10-#11)
**Deciders:** M. Ferrari, architect review

## Context

The backend parses compliance findings from Controller job events (`runner_on_ok` or `runner_item_on_ok` events containing `res.findings`). Controller truncates the `res` field when module output is too large. With oscap producing 366 findings per host, even per-host processing (one host at a time in a loop) resulted in empty `res` in events.

The old `compliance_evaluate` module worked because it produced only 20 findings per host, well within Controller's event payload limits.

Controller's event data truncation limit is approximately 200KB per event payload.

## Decision

**Strip findings to essential fields only** (~120 bytes per finding, ~44KB per host with 366 rules):

- Keep: `rule_id`, `title`, `status`, `severity`, `stig_id`, `category`
- Strip: `description`, `check_text`, `fix_text`, `evidence.raw_output`, `parameters`, `remediation`

The plugin already stores the full CFF metadata from the datastream in the compliance profile. The slim findings contain enough data for the dashboard (status, severity, category) and remediation builder (rule_id matches CaC tags).

Additionally, fetch `runner_item_on_ok` events (from Ansible loops) instead of only `runner_on_ok` events, since the normalize play processes hosts in a loop.

## Consequences

- **Positive:** ~44KB per host fits comfortably within Controller's ~200KB event limit.
- **Positive:** Works for inventories up to at least 4 hosts per event batch (4 x 44KB = 176KB).
- **Negative:** Full rule metadata (description, check_text, fix_text) is not available in job events -- the plugin must have it from another source (the compliance profile or a future direct POST).
- **Negative:** This is a workaround for a fundamental limitation -- Controller events were not designed for bulk data transfer. The long-term solution, Direct POST to the plugin backend, has been implemented in [ADR-007](ADR-007-direct-post-findings.md) (PRs #17-#19). With Direct POST, the normalize play sends findings directly to the `/findings/ingest` endpoint, bypassing Controller event storage entirely. The slim findings format is retained as a fallback when `backstage_api_url` is not configured.
