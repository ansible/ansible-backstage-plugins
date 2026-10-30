---
title: "ADR-023: Inventory-Centric Compliance View"
description: "The plugin's navigation is profile-centric: everything flows from "which compliance standard are you checking?" (Overvie"
type: adr
status: accepted
date: 2026-06-09
product: "AAP Compliance Dashboard"
---
# ADR-023: Inventory-Centric Compliance View

**Status:** Accepted (design validated via mockup 2026-06-11)  
**Date:** 2026-06-09 (updated 2026-06-11)  
**Deciders:** Massimo Ferrari  

## Context

The plugin's navigation is profile-centric: everything flows from "which compliance standard are you checking?" (Overview → Profiles → Scan → Results → Remediations → Settings). Operational users think inventory-first: "what's the compliance status of this set of hosts?" There is no way to see per-host compliance state within an inventory, identify outlier machines, or understand which hosts deviate from the group norm.

Current inventory representation:
- Dashboard `InventoryPostureView` shows per-inventory gauges grouped by profile
- Scan history groups by `(profile × inventory)` (ADR-016)
- Inventory is a parameter, not an entity — no dedicated view or tab

### Competitive Research (2026-06-11)

Research across 6 platforms (Red Hat Insights, Puppet Comply, CIS-CAT Pro, Qualys VMDR, Tenable.io, Chef Automate) found:
- **All platforms use tables** as the primary per-host display, with summary charts above
- **Puppet Comply** has a "5 least compliant nodes" widget for outlier surfacing
- **CIS-CAT Pro** fires "Low Score Alert" when results fall below threshold
- **Red Hat Insights** uses 4-color chart sections: compliant / non-compliant / unsupported / never reported
- **No platform** provides a visual that immediately shows host distribution and outlier clustering

The UX research identified **dot strip plots** as the optimal visualization for showing "17/20 hosts at 95%, but 3 at 40%" — outliers are visually isolated from the cluster. This was validated through interactive mockup iteration.

## Decisions

### §1 — Inventories Tab + Drill-Down (replaces original "drill-down only" decision)

Add an "Inventories" tab (position: after Remediations, before Settings) with two views:
1. **Inventories list**: table of all inventories with compliance summary
2. **Inventory detail**: `/compliance/inventories/:inventoryId` drill-down page

Additionally, all inventory chips/names across the app link to the inventory detail page.

**Rationale:** User explicitly requested a tab for inventory navigation. The list view provides at-a-glance comparison across inventories before drilling in. Links from other pages provide contextual navigation.

### §2 — Host-Centric Primary View with Three-Level Zoom

The inventory detail page is fundamentally a **host-centric compliance view**, not a dashboard with a host table appended. The primary question it answers: "which machines don't look like the others?"

**Three-level zoom visualization:**

| Hosts | View | Interaction |
|-------|------|-------------|
| 200+ | **Strip plot** — one dot per host on a 0–100% compliance axis, clusters auto-detected with labeled regions | Click dot → host side drawer. Click cluster label → zoom into cluster. |
| 50–200 | **Zoomed strip** — same strip on a subset, re-clustered recursively. If cluster can't split further, goes to chips. | Same interactions. Breadcrumb trail for zoom navigation. |
| ≤50 | **Chip matrix** — individual host chips sorted: red outliers → yellow (CAT I findings) → green (compliant) | Click chip → host side drawer. |

**Cluster detection**: hosts sorted by compliance %, grouped when gaps exceed 5 percentage points. Outlier clusters identified as groups <15% the size of the main cluster.

**OS filter**: OS chips in the summary bar are clickable toggles. Clicking an OS version filters all views to hosts with that OS. Supports mixed-OS inventories.

**Rationale:** Validated through 4 rounds of mockup iteration. The strip plot makes outliers visually obvious at scale. The chip matrix (reusing the `HostChips` pattern from remediation results) provides the familiar detailed view. Recursive zoom handles arbitrary inventory sizes without pagination.

### §3 — Inventories List Table

| Column | Source | Interaction |
|--------|--------|-------------|
| Inventory name | Controller API | Click → inventory detail |
| Host count | Controller API (`total_hosts`) | — |
| Scanned Against | Profile chips from `DashboardStats.byInventory[].profileScores` | — |
| Baseline | Pinned baseline profile name, or "—" | — |
| Compliance | Per-profile compliance score (worst highlighted) | — |

No new API call — data from existing `DashboardStats.byInventory[]`.

### §4 — Host Detail Side Drawer

MUI `Drawer` anchor="right" (420px). Content:
- Header: hostname, OS (from Controller host facts)
- Score cards: compliance %, failing rules count
- Severity chips: CAT I/II/III with exact colors from `FindingRow` (CAT I: `#C9190B`, CAT II: `#F0AB00`, CAT III: `#0066CC`)
- Outlier warning card (when host deviates >1.5σ from inventory mean)
- Failing rules list (reuses `FindingRow` visual patterns)
- "View all N failing rules →" navigates to ResultsViewer filtered to that host

Visually consistent with scan results — same fonts, chip styles, severity colors, monospace for rule IDs.

### §5 — No New Data Storage

Per-host compliance scores computed from existing `compliance_findings` table:
```sql
SELECT host, COUNT(CASE WHEN status='pass' THEN 1 END) as pass_count, ...
FROM compliance_findings WHERE scan_id = ? GROUP BY host
```

One new backend endpoint: `GET /inventory/:inventoryId/host-posture?profileId=X`
- Resolves authoritative scan via existing `getAuthoritativeScan()`
- Aggregates per-host pass/fail/severity from existing findings
- Enriches with OS facts from Controller via existing `getInventoryHostFacts()`

No new tables, no new migrations, no cached host data. Controller remains source of truth for inventory metadata (ADR-001 §2).

### §6 — No Composite Cross-Framework Score

When multiple profiles have been scanned against the same inventory, the detail page shows **per-framework sections** (one strip plot per profile). No composite aggregate.

**Rationale:** No industry standard for combining STIG and CIS scores. A composite number creates false confidence.

## Consequences

- New "Inventories" tab in navigation (6 tabs total)
- New route `/compliance/inventories/:inventoryId` with multi-component detail page
- New backend endpoint for per-host posture aggregation (pure query, no storage)
- Recharts `ScatterChart` reused from trend chart feature for strip plot
- `HostChips` visual pattern reused from `RemediationExecution` for chip matrix
- All inventory chips across the app become clickable navigation links
- Mockup component (`HostPostureMockup.tsx`) removed after implementation

## Related

- ADR-016: Lifecycle visualization (grouped scan history — reusable pattern)
- ADR-014: Remediation lifecycle (execution records shown inline on inventory page)
- ADR-015: Authoritative scan (used to resolve which scan's findings to display per-host)
- ADR-012: Dashboard UX (InventoryPostureView — gains click-through to inventory detail)
