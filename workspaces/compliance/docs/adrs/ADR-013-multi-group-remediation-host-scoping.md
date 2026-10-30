---
title: "ADR-013: Multi-Group Remediation with Per-Host Scoping"
description: "When a user selects multiple rules for remediation and those rules fail on different subsets of hosts, the original impl"
type: adr
status: accepted
date: 2026-05-31
product: "AAP Compliance Dashboard"
---
# ADR-013: Multi-Group Remediation with Per-Host Scoping

**Status:** Accepted  
**Date:** 2026-05-31  
**Deciders:** Massimo Ferrari  

## Context

When a user selects multiple rules for remediation and those rules fail on different subsets of hosts, the original implementation unioned all failed hosts into a single JT launch with all rule tags. This caused every host to be remediated for every rule, even rules it already passed. CaC tasks are idempotent so this was safe but wasteful and confusing in the execution view.

## Decision

**Launch one JT per host-group.** The `buildRemediationPlan()` function groups rules by their sorted failed-host set. Rules that fail on the same hosts share a group. Each group is launched as a separate JT with its own `limit` and `job_tags`.

Example: Rule A fails on hosts 1-6, Rule B fails on hosts 1-12.
- Group 1: `job_tags=B`, `limit=1,2,...,12` (12 hosts)
- Group 2: `job_tags=A`, `limit=1,2,...,6` (6 hosts)

The frontend polls **all job IDs** returned in `LaunchRemediationResponse.allJobIds[]` via a single `setInterval`, merges task events from all jobs with `Promise.all`, and derives overall status from the aggregate (all successful = complete, any failed + all terminal = failed, any in-progress = running).

## Controller Requirements

Remediate JTs must have:
- `become_enabled: true` — CaC playbooks assume root
- `ask_limit_on_launch: true` — without this, Controller silently ignores the `limit` parameter
- `ask_tags_on_launch: true` — for rule-level scoping
- `ask_inventory_on_launch: true` — for inventory override

## Known Limitations

1. **View Last Run** only shows the first group's tasks because scan records store a single `workflowJobId`. The `allJobIds` array is not persisted. Fix: Phase 2 of the remediation lifecycle redesign (execution history table).

2. **Sequential execution.** Controller may queue groups sequentially (one slot on the execution node). The frontend handles this by treating `pending` as in-progress and waiting for all jobs to reach terminal state.

3. **Server-side dedup.** A 60-second time-based guard prevents duplicate launches from multi-browser access. Page refresh re-launches are now prevented at the frontend layer: after a successful launch, `window.history.replaceState` switches the URL from `/execute/` to `/remediation-result/`, so refresh enters view mode instead of re-executing.

## Task Grouping

CaC remediation playbooks produce many setup tasks per rule (e.g., "Declare list of syscalls", "Check existence of...") whose names don't match rule titles. The frontend groups tasks positionally: title-prefixed "anchor" tasks set the current rule, and all subsequent tasks inherit that rule until the next anchor is found. A word-overlap fallback converts rule IDs to words (e.g., `kernel_module_atm_disabled` → "kernel module atm disabled") when findings titles are unavailable. Note: CaC monolithic playbooks never populate `event_data.role` or `event_data.task_tags`.

## Alternatives Considered

1. **Single JT with unioned hosts** — simpler but over-scopes remediation. CaC tasks are idempotent so it's safe, but users see unnecessary "already compliant" results. Rejected because it doesn't match user intent ("remediate failed hosts only").

2. **Track all groups in frontend** (chosen) — more complex polling but accurate host scoping and correct execution view.

3. **Hybrid: split only when host sets differ by >50%** — rejected as brittle and hard to explain to users.

## Consequences

- Remediation is precise: hosts only get remediated for rules they actually failed
- Frontend complexity increased (multi-job polling, event merging)
- Backend launches multiple JTs sequentially — network latency scales linearly with group count
- The common case (all rules fail on the same hosts) still produces a single JT launch

## Related

- ADR-009: CaC remediation via direct JT (not workflow)
- Remediation lifecycle gap analysis: `specs/compliance-pipelines/features/remediation-lifecycle-gap-analysis.md`
