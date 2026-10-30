---
title: "ADR-003: Single Assessment JT with 2 Plays (Not 2-Node Workflow)"
description: "The original assessment architecture used a 2-node workflow: Node 1 (`compliance-gather-facts`) ran the scan on targets,"
type: adr
status: accepted
date: 2026-05-26
product: "AAP Compliance Dashboard"
---
# ADR-003: Single Assessment JT with 2 Plays (Not 2-Node Workflow)

**Status:** Accepted
**Date:** 2026-05-26 (decided during PR #7 deployment)
**Deciders:** M. Ferrari

## Context

The original assessment architecture used a 2-node workflow: Node 1 (`compliance-gather-facts`) ran the scan on targets, Node 2 (`compliance-evaluate` / `normalize`) processed results on localhost. During the oscap migration (PR #4-#7), we discovered that AAP workflow nodes run in **separate containers**. The scan play in Node 1 fetches XCCDF XML files from targets to the execution node, but Node 2 cannot access those files because it runs in a different container.

This is a fundamental AAP architecture constraint, not a configuration issue.

## Decision

Use a **single job template** (`compliance-run-oscap`) running `run_oscap.yml` with **two plays**:

- **Play 1** (scan): Runs on target hosts -- installs oscap ephemerally, copies SCAP datastream from EE, runs `oscap xccdf eval`, fetches XCCDF XML results back, cleans up
- **Play 2** (normalize): Runs on localhost (same container) -- `normalize_xccdf` module parses XML, strips XCCDF prefix from rule IDs (match CaC tags), extracts metadata from datastream, outputs CFF JSON

Both plays run in the **same container**, so fetched files from Play 1 are available to Play 2. No workflow is needed for Tier 1 assessment.

Remediation remains a **separate, standalone JT** -- never combined with assessment. The gap between assess and remediate is where intelligence lives (human review, EDA policy, AI agent).

## Consequences

- **Positive:** Eliminates the cross-container file sharing problem entirely.
- **Positive:** Simpler Controller resource configuration -- one JT instead of a multi-node workflow for assessment.
- **Positive:** `normalize.yml` is retained as a standalone utility for debugging and Tier 2 reuse.
- **Negative:** Tier 2 scanners (API-based) do not have this problem because they fetch results via API on localhost. Multi-node workflows remain valid for Tier 2/3 profiles, creating two different patterns.
- **Negative:** The legacy workflow (`compliance-pipeline-rhel9-stig`, id=36) and old JTs (`compliance-gather-facts`, `compliance-evaluate`) remain in Controller but are no longer used.
