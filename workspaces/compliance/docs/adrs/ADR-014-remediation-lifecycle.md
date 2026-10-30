---
title: "ADR-014: Remediation Lifecycle Architecture"
description: "Remediations are stateless"
type: adr
status: accepted
date: 2026-05-31
product: "AAP Compliance Dashboard"
---
# ADR-014: Remediation Lifecycle Architecture

**Status:** Accepted  
**Date:** 2026-05-31  
**Accepted:** 2026-06-10 (Phase 1 merged, deployed, stable for 9 days)  
**Deciders:** Massimo Ferrari  

## Context

Remediations are stateless. The `compliance_remediation_profiles` table stores rule selections but has no execution history, no lifecycle states, and no verification linkage. Five concrete failures drove this work:

1. **Wrong findings scoping.** A STIG remediation launched against CIS findings because CIS scanned more recently, sending the job to localhost instead of the compliance inventory.
2. **Ghost scan records.** Every remediation creates a `compliance_scans` row with `scanner='remediation'`, polluting scan history and losing multi-group `allJobIds`.
3. **No execution history.** Users cannot answer "when was this last run?" or "what happened?"
4. **Orphan profiles.** Auto-save creates a new profile on every browser session with no uniqueness constraint or cleanup.
5. **No verification linkage.** The "Run Verification Scan" button launches a scan with zero linkage back to the remediation.

Competitive analysis across 8 platforms (Red Hat Insights, Rapid7 InsightVM, Qualys, Drata, Vanta, Chef Automate, Puppet Comply, CIS-CAT Pro) shows every platform with discrete remediation actions provides execution history, lifecycle states, and verification linkage.

### Architectural principle: Controller is the source of truth

Every remediation executes via AAP Controller — that is the product's value proposition. The plugin stores lightweight pointers (job IDs, timestamps, rule/host counts) for UX purposes, but Controller is the authority for execution state, task events, host results, and job logs. The plugin never duplicates what Controller already tracks. Drill-down always fetches live from Controller.

This applies to scans as well — scan execution is outsourced to Controller/OpenSCAP. The plugin stores normalized findings for local querying, but the raw scan data lives in Controller.

## Decision

### 1. Add an execution history table

A new `compliance_remediation_executions` table stores one row per remediation launch. Each row captures:

- Which profile was applied (`remediation_profile_id`)
- Which assessment scan informed the host targeting (`informing_scan_id`)
- All Controller job IDs (`primary_job_id` + `all_job_ids` JSON array)
- Outcome summary (`status`, `rules_applied`, `hosts_targeted`, `elapsed_seconds`)
- Verification linkage (`verification_scan_id`)
- The remediation plan that was executed (`plan_summary` JSON)

This follows the "summary + link to Controller" pattern used by Chef Automate (convergence summaries + link to detailed run report). No per-host findings are duplicated — drill-down fetches task events live from Controller via `GET /jobs/{id}/job_events/`.

### 2. States live on executions, not on profiles

Profile states: `draft | saved | archived`. User-controlled lifecycle stages.

Execution states: `pending | running | succeeded | failed | cancelled`. System-derived from Controller job status.

The profile's "latest execution status" is computed at query time by joining to the most recent execution record. This avoids dual-write synchronization where the profile state could diverge from the actual execution outcome.

### 3. Remediation scan records for Recent Activity

~~Stop creating `compliance_scans` rows with `scanner='remediation'`.~~ **Amended 2026-06-26:** Remediation scan records are retained for the Overview tab's Recent Activity widget. `getRecentScans` reads from `compliance_scans`, not from `compliance_remediation_executions`. Without a scan record, remediations are invisible on the Overview.

The execution table remains authoritative for lifecycle state (status, timing, plan). The scan record is a lightweight projection for dashboard visibility only — it carries `scanner='remediation'`, `scanType='remediation'`, and the `workflowJobId`. No findings are ingested against it. When the execution transitions to a terminal state, the scan record's status is updated to match.

Posture calculations, baseline scoring, and authoritative scan resolution all filter on `scanner !== 'remediation'`, so the record does not affect compliance scores.

### 4. Verification linkage is explicit

When the user clicks "Run Verification Scan" after a remediation, the execution ID is passed through the scan launch flow. The backend updates `verification_scan_id` on the execution record. This is the InsightVM pattern (validation scans transition solution status).

### 5. Auto-save produces drafts with upsert semantics

Auto-save creates/updates a profile with `status='draft'`. Explicit "Save" transitions to `saved`. Name uniqueness enforced per `(name, compliance_profile_id)`. Auto-save uses upsert: if a draft exists for the same `(compliance_profile_id, name)`, update it instead of creating a new row.

### 6. Concurrent execution guard (inventory-level mutex)

**Decision:** Hard reject any remediation launch when a remediation execution with `status='running'` already exists for the same `inventory_id`, regardless of which remediation profile is being launched.

**Rationale:** Unlike scans (where RBAC visibility gaps may cause parallel launches from different users unaware of each other), running the same or overlapping remediation rules on the same hosts concurrently causes real failures:

- **Package manager locks:** `yum`/`dnf` hold `/var/run/yum.pid`; a concurrent run gets "Another app is currently holding the yum lock"
- **Config file races:** Two playbooks writing `sshd_config` or `audit.conf` create last-write-wins corruption
- **Service restart races:** One playbook restarts a service while another is mid-configuration
- **Idempotency breaks:** Ansible modules check state then act; concurrent changes between check and act violate assumptions

**Controller gap:** `allow_simultaneous=False` (default) prevents the *same* Job Template from running twice, but provides **no mutex across different Job Templates targeting the same inventory**. A STIG remediation and a CIS remediation on the same hosts will run in parallel. The plugin must enforce the guard at the application level.

**Industry precedent:**

| Platform | Mechanism | Behavior on conflict |
|----------|-----------|---------------------|
| Chef Infra | `flock()` on `chef-client-running.pid` | Block & wait (configurable: `run_lock_timeout=0` for immediate reject) |
| Puppet | PID lockfile `agent_catalog_run.lock` | Hard reject, error surfaced in PE console |
| AWX Controller | `allow_simultaneous` flag per JT | Queue (same JT only; no cross-JT guard) |
| **This plugin** | Query `compliance_remediation_executions` | **Hard reject** (Puppet pattern) |

**Implementation:** Use a partial unique index on `(inventory_id) WHERE status IN ('pending', 'running')` to enforce the mutex at the database level. The launch flow wraps the guard check and execution record creation in a single transaction: INSERT the execution with `status='pending'`, relying on the partial unique index to reject concurrent launches (UNIQUE constraint violation → HTTP 409). This eliminates the TOCTOU race inherent in a SELECT-then-INSERT pattern. The HTTP 409 response names the running remediation profile and its launch time. The UI disables the launch button and shows which remediation is in progress.

**Stale record recovery:** If the backend crashes or the user closes the browser mid-remediation, execution records can be left in `running` state indefinitely, permanently blocking that inventory. On `GET /remediation-profiles` (list page load), the backend checks for executions in `running` state with `started_at` older than 30 minutes. For each stale record, it queries Controller for the actual job status and updates accordingly. If the Controller job is terminal, the execution is marked `failed` with `error: 'recovered from stale state'`. This piggybacks on existing traffic rather than requiring a background job.

**Scope:**
- Same profile + same inventory + running → **blocked**
- Different profile + same inventory + running → **blocked** (cross-JT gap)
- Same profile + different inventory → **allowed** (no conflict)
- Any profile + any inventory + no running execution → **allowed**

### 7. Remediation profiles as inventory-independent baselines with golden standard binding

**Decision:** Remediation profiles are inventory-independent policy templates — a named, curated rule set under a compliance profile. The inventory is selected at launch time. A separate, explicit "pin as golden standard" action binds a remediation profile to a specific inventory, enabling dual-layer dashboard reporting.

**Rationale:** There are two distinct compliance measurements:

- **Standard posture:** "How do I score against the full STIG?" (150/200 = 75%). The auditor-facing number.
- **Baseline posture:** "How close am I to the best I can achieve?" (175/180 = 97%). The operational number. The 20 excluded rules have documented justification and are not failures — they're acknowledged constraints of the workload or infrastructure.

Without this, customers who can't reach 100% of a standard have two bad options: stare at a permanently-bad dashboard number, or create a whole new compliance profile with XCCDF tailoring — heavy, duplicates scanner infrastructure, and loses reference to the original standard.

**Industry patterns:**

| Pattern | Platforms | Mechanism |
|---------|-----------|-----------|
| **Shrink the denominator** | Insights, Qualys, Drata, Vanta | Excluded rules removed from total. Single score against in-scope rules only. No reference to full standard. |
| **Separate bucket** | Chef Automate | Waived controls are a 4th status. Excluded from pass/fail %. Visible but separate. |
| **Dual score** | Puppet Comply | Two scores side-by-side: "with exceptions" and "without exceptions". Only platform with native dual-layer. |

Our approach achieves the same practical effect as Drata/Vanta's "out of scope" pattern — rules outside the golden standard are acknowledged rather than counted as failures — but through AAP's natural execution model rather than a compliance-specific exception mechanism. The remediation profile already captures which rules to enforce and why; pinning it as the golden standard simply enables the dashboard to report against that curated set alongside the full standard.

**Design:**

1. **Remediation profiles are inventory-independent.** A profile is a curated rule set: "STIG Baseline — 180 of 200 rules, with exclusion rationale." It can be launched against any inventory.

2. **Golden standard binding is an explicit user action.** No auto-pinning. A user with authority consciously pins a remediation profile as the target for a specific inventory. This creates a `compliance_baseline_targets` record:

   ```
   compliance_baseline_targets
   ├── remediation_profile_id   → which rule set
   ├── inventory_id             → which hosts
   ├── pinned_at                → when
   └── pinned_by                → who decided
   ```

3. **Dual-layer dashboard reporting.** Once pinned, the dashboard shows both layers:

   ```
   DISA STIG V2R8 — prod-web-servers
   ├── Standard posture:    150 / 200  (75%)    ← full standard
   └── Baseline posture:    175 / 180  (97%)    ← golden standard
                             ↑ 5 rules to go
   ```

   If no golden standard is pinned for an inventory, only standard posture is shown.

4. **Exclusion rationale lives on the remediation profile**, not per-inventory. The profile documents why each rule is excluded. Different inventories can pin different profiles if their constraints differ (DMZ vs internal), but the justification is authored once per profile.

5. **Re-run is natural.** Since profiles are reusable and inventory-independent, re-launching a completed remediation with the same selections is just "launch this profile against the same inventory again." No special re-run mechanism needed — the profile persists, the user picks an inventory at launch time.

**Differentiator over Insights:** Insights Compliance has no dual-layer reporting. The tailored policy IS the target, with no reference to the full unmodified profile. No built-in justification for exclusions. Our approach shows both numbers and documents why the gap exists.

### 8. Local data management with two-group retention

**Decision:** All local data defaults to indefinite retention. A new Settings > Data Management section provides configurable retention with two groups to avoid cascade conflicts:

| Retention Group | Tables | Cascade behavior |
|----------------|--------|-----------------|
| **Assessment data** | `compliance_scans` → `compliance_findings` + `compliance_posture_snapshots` | Purging a scan deletes its findings and snapshots |
| **Remediation data** | `compliance_remediation_executions` | Independent. Graceful degradation when `verification_scan_id` references purged assessment data |

Options per group: Indefinite (default), 30 days, 60 days, 90 days, 6 months, 1 year.

**Rationale:** Individual retention settings per data type (scans, findings, snapshots, executions) create cascade conflicts — e.g., indefinite findings retention with 90-day scan retention orphans findings whose parent scan was purged. Two groups eliminate all conflicts: assessment data cascades from scans, remediation data is independent.

**Why indefinite by default:** Our model stores metadata + pointers, not full execution payloads. At ~555 KB/year for executions and ~115 MB/year for findings, storage costs are negligible for SQLite. Controller retains all job history, task events, and logs regardless. Platforms in the same architectural camp (Insights, Qualys, Drata, Vanta) keep records indefinitely because audit trails are the value proposition.

**Contextual help:** The Data Management section includes a help popover (MUI `IconButton` + `Popover`, matching the downstream `HelpButton` pattern from ansible-hub-ui) explaining:
1. This manages the plugin's local database only
2. Automation Controller remains the source of truth for all execution details, logs, and job history
3. Assessment data includes scan results, per-host findings, and posture snapshots — purging a scan removes its associated data
4. Remediation history includes execution summaries and Controller job references, managed independently
5. Historical data beyond the retention window can be retrieved from Controller via Audit Export (P3)

**Audit Export (P3):** A dedicated export feature for pulling historical compliance data for auditors. Date range + profile/inventory filters, with the option to hydrate from Controller API for data beyond the local retention window. Export formats: CSV bundle, JSON. Addresses the primary scenario where purged data is needed: audit evidence collection.

**Implementation:** P2b for Data Management settings + purge job. P3 for Audit Export.

## Known Limitations

1. **No SLA tracking.** Severity-based due dates deferred to Phase 4.
2. **No auto-close on scan.** Automatic status transition when a subsequent scan shows findings resolved is deferred — requires careful design around partial remediation.
3. **Execution summary is static.** Counts are written at completion and do not update if a subsequent scan shows regression.
4. **No ITSM integration.** Bidirectional ticket sync with Jira/ServiceNow is out of scope.
5. **No exception expiration or approval workflow.** Drata/Vanta require justification per exclusion with audit trail. Puppet Comply tracks approver, reason, expiration, and ticket number per exception. Our exclusion rationale is free-text on the profile — structured approval workflows deferred.

## Alternatives Considered

1. **States on the profile (Qualys ticket model).** Rejected: dual-write synchronization, profiles are reusable templates not one-shot tickets.
2. **Infer verification from scan history.** Rejected: ambiguous with multiple scans, InsightVM uses explicit linkage.
3. **Store per-host execution findings.** Rejected: Controller is the source of truth for task events, no duplication needed, team preferred summary + link approach.
4. **Keep remediation-as-scan records permanently.** ~~Rejected~~ Partially reinstated (2026-06-26): lightweight scan records retained for Recent Activity visibility. The execution table is authoritative; the scan record is a dashboard projection only.
5. **Remediation profiles tied to inventory.** Rejected: same rule set often applies across multiple inventories. Tying to inventory forces duplication and prevents reuse. Industry consensus (Chef policyfiles, Puppet profiles, Insights policies) is that the policy is separate from the target.
6. **Shrink-the-denominator only (Insights/Drata model).** Rejected as the sole approach: loses reference to the full standard. An auditor asking "where do you stand against STIG?" can't see the answer if the denominator was silently reduced. Dual-layer preserves both views.
7. **Auto-pin first remediation profile run against an inventory.** Rejected: golden standard must be a conscious choice by someone with authority. Automatic pinning could set an unintentional baseline.

## Consequences

- Remediations gain a complete audit trail with Controller as source of truth for details
- Multi-group job IDs (ADR-013) are fully persisted and queryable
- Remediation scan records are lightweight dashboard projections for Recent Activity only — the execution table is authoritative (amended 2026-06-26, see §3)
- Auto-save orphans eliminated by draft status + name uniqueness + cleanup
- Database growth is negligible: ~555 KB/year at 10 profiles × 2 runs/week
- Remediation profiles become reusable across inventories, reducing duplication
- Golden standard binding enables dual-layer reporting — a differentiator over Insights
- Re-run is a natural operation, not a special feature — profiles persist and are launched against an inventory at execution time
- `scan_id` → `creation_scan_id` rename eliminates naming ambiguity across profile and execution tables
- Two-group data management provides configurable retention without cascade conflicts
- Audit Export (P3) enables compliance evidence collection for auditors even after local data is purged
- Remediation failure details are fetched live from Controller with four-tier fallback (result_traceback → runner_on_failed → job_explanation → stdout ERROR/FATAL extraction), providing actionable error messages without duplicating Controller's job event storage
- Stale execution recovery runs every 30 minutes (lowered from 4 hours) to minimize inventory lock duration when processes crash mid-remediation

## Implementation Notes (2026-06-05)

**§7 Baseline UX evolution:** The golden standard pin management was initially a modal dialog (`ManageBaselinePinsDialog`). This has been replaced with an inline section inside the expanded remediation profile row — the profile row now supports double expansion showing both execution history and baseline inventories. Each pinned inventory shows its current pass rate via a new `GET /baseline-scores` endpoint. The compact "N pinned" chip replaced the verbose "Baseline for N inventories: inv1, inv2" text.

**Baseline aggregate fix:** The dashboard baseline rate now averages per-inventory rates (weighted equally). The previous formula summed host-level pass counts and divided by rule count, mixing units and producing rates >100% with multiple inventories.

**Remediation host scoping fix:** `getFindings()` is now scoped to the target inventory when launching remediation. Previously, the query found the latest scan for a compliance profile across all inventories, causing host pattern mismatches when multiple inventories share a profile.

**Failed remediation status:** Rules that never execute (e.g. host pattern mismatch before any tasks run) now show "Not run" with a 0% progress bar instead of "Compliant" with 100%.

## Amendment: Service Decomposition (2026-06-06)

The remediation plan builder logic has been extracted from `ComplianceService.ts` into a dedicated `RemediationPlanBuilder` class (ADR-019). The `buildRemediationPlan` method -- which groups rules by target host set for batched Ansible runs -- is now in `service/RemediationPlanBuilder.ts`. This narrows the surface area for changes to remediation plan logic and eliminates coupling with dashboard aggregation and findings parsing, both of which were also extracted.

## Related

- ADR-009: CaC remediation via direct JT
- ADR-013: Multi-group remediation with per-host scoping (Known Limitation #1 resolved)
- ADR-019: ComplianceService decomposition
- Feature spec: `specs/compliance-pipelines/features/feature-remediation-lifecycle.md`
- Gap analysis: `specs/compliance-pipelines/features/remediation-lifecycle-gap-analysis.md`
