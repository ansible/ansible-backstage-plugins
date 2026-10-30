---
title: "ADR-022: Baseline-Triggered Auto-Remediation"
description: "The compliance plugin's remediation lifecycle (ADR-014) is human-in-the-loop by design: a user scans, reviews findings, "
type: adr
status: proposed
date: 2026-06-09
product: "AAP Compliance Dashboard"
---
# ADR-022: Baseline-Triggered Auto-Remediation

**Status:** Proposed (design phase)  
**Date:** 2026-06-09  
**Deciders:** Massimo Ferrari  

## Context

The compliance plugin's remediation lifecycle (ADR-014) is human-in-the-loop by design: a user scans, reviews findings, builds a remediation profile, launches it, then optionally verifies. Baseline pinning (ADR-014 §7) lets users designate a remediation profile as the "golden standard" for an inventory+profile combination.

User testing on 2026-06-09 surfaced a clear demand for closed-loop automation: when a baseline is pinned, scanning should automatically trigger the full assess → remediate → verify pipeline without human intervention. This would make the plugin the first compliance tool to offer scan-remediate-verify as a single automated operation.

### Current State

- The "Evaluate Only" toggle in `ScanLauncher` passes `evaluate_only` to Controller extra_vars, but no scan playbook consumes this variable — it is cosmetic. The scan always only evaluates. This is a correctness issue.
- Baseline pinning stores `(remediation_profile_id, compliance_profile_id, inventory_id)` in `compliance_baseline_targets`. No automated action is triggered by the pin.
- ADR-015 mandates scan-before-remediation. Auto-remediation inverts this: remediation becomes a side-effect of scanning.
- ADR-016 L3 (chain view) visualizes the assess → remediate → verify journey. This ADR makes that journey executable.

### Competitive Landscape

No competitor offers closed-loop scan → remediate → verify:
- **Puppet Comply/Enforce:** Convergence model (drift correction), but no structured verification scan
- **Chef InSpec + Automate:** Detect-correct-detect possible, but manual wiring
- **Red Hat Insights:** Auto-remediation via playbooks, but no structured post-remediation verification
- **Drata/Vanta:** SaaS-only, no remediation capability

## Decision

### §1 — Remove "Evaluate Only" Toggle

The `ScanLauncher` "Evaluate Only" toggle is misleading and must be removed. Replace with:
- **Default scan mode:** Assessment only (current behavior, no toggle needed)
- **Auto-remediate checkbox:** Visible only when a baseline is pinned for the selected profile+inventory. Checked = full pipeline; unchecked = assessment only.

### §2 — Chained Pipeline Architecture

When auto-remediation is triggered, the backend orchestrates a three-phase pipeline:

1. **Assessment:** Launch scan JT, wait for completion, ingest findings via Direct POST (ADR-007)
2. **Remediation:** Build remediation plan from the pinned baseline profile's rule selections against the latest findings. Launch remediation JT with `job_tags` for enabled rules. Wait for completion.
3. **Verification:** Launch verification scan against the same inventory. Ingest findings. Compute delta (ADR-016 L3).

Each phase creates its own record (scan, execution, verification scan). The execution record gets `trigger_source = 'auto-baseline'` to distinguish from manual launches.

**Orchestration approach:** Backend polling loop (not EDA). The plugin backend watches for scan completion via its existing reconciliation mechanism, then triggers the next phase. EDA integration (§6) is a future enhancement that replaces polling with event-driven triggers.

### §3 — Auto-Remediate Opt-In

Auto-remediation requires explicit opt-in per baseline target. Add `auto_remediate BOOLEAN DEFAULT FALSE` to `compliance_baseline_targets`. The pin dialog gains a checkbox: "Automatically remediate when scanning this inventory."

Auto-remediation is **only** available when:
- A baseline is pinned for the `(compliance_profile_id, inventory_id)` pair
- The pinned remediation profile has `status = 'saved'`
- `auto_remediate = true` on the baseline target

### §4 — Safety Guardrails

Auto-remediation without human review is the most dangerous operation in the plugin. Required guardrails:

| Guardrail | Mechanism |
|-----------|-----------|
| **Baseline-only** | Only pinned remediation profiles can be auto-applied (curated, reviewed rule set) |
| **Disruption gate** | Skip rules with `disruption = 'high'` in auto mode (configurable) |
| **Rate limiting** | Max 1 auto-remediation per inventory per 24h (prevents runaway loops) |
| **Dry-run default** | First auto-remediation for a new baseline target runs in dry-run mode (log-only) |
| **Circuit breaker** | If post-remediation pass rate drops below pre-remediation pass rate, halt and alert |
| **Audit trail** | `trigger_source = 'auto-baseline'` on execution records + "Auto-Remediated" label in UI |

### §5 — UI Indicators

- **Scan results tagged "Auto-Remediated":** Chip on scan history and results page
- **Execution records:** Show "Triggered by baseline scan" instead of profile name
- **Dashboard:** Auto-remediation activity in Recent Activity with distinct icon
- **Chain view:** Full pipeline visualized with "auto" badge on each step

### §6 — EDA Integration Path (Future)

The natural evolution is to replace the backend polling loop with an EDA rulebook activation:
- Event source: Controller job completion webhook
- Condition: `event.status == 'successful' AND baseline_pinned(event.inventory_id, event.profile_id)`
- Action: Launch remediation JT + verification scan

This aligns with the EDA value proposition and creates a compelling cross-component story. Deferred to a future sprint.

## Consequences

- Removes the misleading "Evaluate Only" toggle
- Adds `auto_remediate` column to `compliance_baseline_targets` (migration required)
- Backend needs a pipeline orchestrator for chained phases
- Product positioning shifts from "compliance visibility" to "autonomous compliance enforcement"
- Support model changes: "your tool broke my server" becomes a possible failure mode
- EDA integration becomes a natural next step

## Risks

- **Production impact:** Auto-remediation can break systems. Guardrails (§4) mitigate but don't eliminate this risk.
- **Complexity:** Pipeline orchestration adds significant backend complexity. Error handling for partial pipeline failures (scan succeeds, remediation fails) needs careful design.
- **Scope creep:** "Auto" features attract feature requests (scheduled scans, escalation policies, approval workflows). Draw boundaries early.
