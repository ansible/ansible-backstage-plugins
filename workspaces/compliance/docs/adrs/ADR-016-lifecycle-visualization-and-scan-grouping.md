---
title: "ADR-016: Lifecycle Visualization and Scan History Grouping"
description: "Phase 1 of the remediation lifecycle (ADR-014) introduced execution history tracking"
type: adr
status: accepted
date: 2026-06-01
product: "AAP Compliance Dashboard"
---
# ADR-016: Lifecycle Visualization and Scan History Grouping

**Status:** Accepted — All Layers Implemented  
**Date:** 2026-06-01  
**Deciders:** Massimo Ferrari  

### Implementation Status

| Layer | Status | Shipped | Key Commits |
|-------|--------|---------|-------------|
| Layer 1 — Grouped scan history + diff reports | Implemented | 2026-06-02 | `b3c1fda` (merged to main) |
| Layer 2 — Finding-level state tracking | Implemented | 2026-06-03 | `claude/finding-level-states` branch |
| Layer 3 — Explicit chain view | Implemented | 2026-06-08 | `1da6ad2` (merged to main in `85da00b`) |

## Context

Phase 1 of the remediation lifecycle (ADR-014) introduced execution history tracking. During testing, the scan history page showed all scans across all profiles in a flat chronological list, making it impossible to follow the scan → remediate → verify sequence for a specific compliance standard and inventory. A STIG scan appeared between CIS scan and CIS remediation, creating the visual impression of cross-profile contamination even though the execution was correct.

### Competitive Research (2026-06-01)

Deep research across 8 platforms yielded a key finding: **no platform provides an explicit, linked scan-remediate-verify chain visualization.** Instead, three implicit patterns exist:

| Pattern | Platforms | Mechanism |
|---------|-----------|-----------|
| **State machine** | Tenable (New/Active/Fixed/Resurfaced), Qualys (Open/Resolved/Closed) | Successive scan results auto-transition finding states. Verification is implicit — if a finding changes from Fail to Pass, it's "Fixed." |
| **Before/after diff report** | CIS-CAT Pro (Difference Report) | User manually selects two assessments of the same target/benchmark and sees what changed. Not linked to remediation actions. |
| **Embedded lifecycle** | Chef Compliance Phase, Puppet corrective changes | Remediation + verification happen in the same execution run. No cross-run chain. |

CIS-CAT Pro groups assessments by `(target system × benchmark × profile)` chronologically, with drill-down from monthly averages to individual timestamps. The Difference Report compares a selected result to either the immediate previous result or any arbitrary result, highlighting rules that changed status.

Tenable's `Resurfaced` state is notable — it encodes regression detection into the state model. A finding that was Fixed and reappears in a later scan transitions to Resurfaced, creating an implicit verification failure signal.

## Decisions

### 1. Three-layer visualization strategy: B (diff reports) + A (state machine) + C (chain view)

**Layer 1 — Foundation: Grouped scan history with difference reports (CIS-CAT pattern)**

Redesign the scan history page from a flat chronological list to groups by `(compliance_profile × inventory)`. Each group shows its scans in chronological order with the latest scan prominent. Users can select any two scans within a group for a difference report showing rules that changed status (pass → fail, fail → pass, new, removed).

This is proven UX (CIS-CAT, Qualys) and immediately solves the interleaving confusion.

**Layer 2 — Data: Finding-level state tracking (Tenable pattern)**

On the data layer, track finding state transitions across scans. Each finding gains a lifecycle state: `new` (first seen failing), `active` (still failing in subsequent scans), `fixed` (was failing, now passing), `resurfaced` (was fixed, now failing again). State transitions are computed by comparing consecutive scans for the same `(profile × inventory × rule × host)`.

This enables trend analysis ("how many findings were fixed this month?"), regression detection (Resurfaced alerts), and SLA tracking (time-in-state) without an explicit chain view.

**Layer 3 — Enhancement: Explicit chain view (our differentiator, future)**

Once Layers 1-2 are stable, add an optional chain view that uses `informing_scan_id` and `verification_scan_id` from the execution records to render an explicit timeline: Assessment #N → Remediation → Verification #M, with before/after delta. This would be unique in the market but builds on proven data (the execution records already capture the linkage).

**Rationale:** Starting with the diff report + state machine gives immediate value with proven UX. The chain view is aspirational — no competitor has it, and the UX is unproven. Layering lets us ship value incrementally.

### 2. Assessment vs Verification scan distinction — under review

The current model distinguishes between "assessment" scans (discovery) and "verification" scans (post-remediation confirmation). Research shows this distinction is **not standard** across the industry:

- **Tenable, Qualys:** All scans are identical. State transitions are inferred from results, not scan intent. A "verification scan" is just the next regular scan.
- **CIS-CAT:** No scan type distinction. The Difference Report compares any two assessments.
- **Chef:** The Compliance Phase runs the same scan every convergence. No "verification" concept.
- **Puppet Comply:** "Ensure you re-scan after creating exceptions" — but the scan is identical to any other.
- **InsightVM:** Has an explicit "validation scan" concept, but it's just a targeted re-scan of the same scope.

The only place scan type matters is in the `informing_scan_id` linkage on execution records — and that's about provenance (which scan informed the remediation), not about the scan itself being different.

**Decision:** Keep `scanType` on the scan record for provenance tracking, but all scans execute identically regardless of type. The difference report and state machine operate on scan results, not scan type. The "Run Verification Scan" button is a convenience shortcut that launches a scan with the same profile and inventory as the just-completed remediation — functionally identical to launching from the scan page. The `verification_scan_id` on the execution record links the result for UX purposes (showing the "Verified" badge), but the scan itself is not special.

This means we can simplify Phase 2: instead of building special verification scan handling, we focus on the difference report and finding-level state tracking, which provide the same "did the remediation work?" answer in a more standard way.

### 3. Scan history page redesign

The scan history page changes from a flat chronological list to:

**Primary view: Grouped by (profile × inventory)**
```
CIS Benchmark RHEL 9 Level 1 × compliance-rhel9-inventory
├── Scan #3417  01/06 21:14  257 findings  97 failing  ← latest (authoritative)
│   └── [Compare with previous]
├── Remediation #3415  01/06 21:06  2 rules, 16 hosts, succeeded
├── Scan #3392  01/06 20:02  257 findings  99 failing
│   └── [Compare with #3417: 2 rules fixed]
└── [Launch New Scan]

DISA STIG × compliance-rhel9-inventory  
├── Scan #3404  01/06 20:19  435 findings  263 failing  ← latest
└── [Launch New Scan]
```

**Features:**
- Each group shows the compliance profile name and inventory name
- Latest scan is highlighted as authoritative
- Remediation executions appear inline between the scans they sit between chronologically
- "Compare" link opens a difference report between any two scans in the group
- Collapse/expand per group
- Cross-profile filtering from ADR-015 applies here: when navigating from a specific profile context, only that group is shown

**Secondary view: Flat chronological (toggle)**
The existing flat list remains available as a toggle for users who want the global timeline.

### 4. Remediation executions appear in scan history context

Remediation executions (from ADR-014) are shown inline in the scan history group, positioned chronologically between scans. They are not scans — they appear as a different visual element (e.g., indented, different icon) that shows: profile name, rule count, host count, status, duration.

This connects the "what happened" (remediation) with the "what changed" (scan comparison) without requiring an explicit chain view. The user sees the remediation between two scans and can compare the scans to see the impact.

## Implementation Phases

| Phase | Scope | Effort |
|-------|-------|--------|
| **P2a: Grouped scan history** | Group by (profile × inventory), inline executions, cross-profile filtering, collapse/expand | 2-3 days |
| **P2a: Difference report** | Select two scans in a group, show rules that changed status | 1-2 days |
| **P2b: Finding-level states** | Track New/Active/Fixed/Resurfaced per finding across scans, store state transitions | 2-3 days |
| **P3: Chain view** | Explicit timeline using informing_scan_id + verification_scan_id, "Verified" badge | 1-2 days |

## Consequences

- Scan history becomes immediately useful for compliance tracking (grouped, comparable)
- The interleaving confusion from mixed profiles is eliminated
- Finding-level states enable trend analysis and regression detection
- Assessment vs verification distinction is simplified — all scans are equal, context comes from the group timeline
- Phase 2 scope shifts from "verification scan plumbing" to "grouped history + diff report" — more value, less plumbing
- The chain view remains possible as a future enhancement using existing execution record fields

## Amendment: Findings Deduplication (2026-06-06)

Layer 2 (finding-level state tracking) depends on unique `(scan_id, rule_id, host)` tuples for correct state computation. Migration 016 adds a UNIQUE constraint on `compliance_findings(scan_id, rule_id, host)` to enforce this at the database level. Prior to this constraint, duplicate rows could arise from retry scenarios (e.g., Direct POST retry after transient network failure) or race conditions between the Direct POST and event fallback paths. The deduplication migration cleans existing data by keeping the first-inserted row (`MIN(id)`) per group before adding the constraint. The `groupFindingsByRule` function in `FindingsParser` also deduplicates hosts via a `seenHosts` Set as a defense-in-depth measure. See ADR-018 for the full deduplication decision.

## Related

- ADR-014: Remediation lifecycle architecture (execution records, informing_scan_id, verification_scan_id)
- ADR-015: Authoritative scan, mandatory scan-before-remediation, host scoping
- ADR-012: Dashboard UX competitive alignment
- ADR-018: Findings deduplication
