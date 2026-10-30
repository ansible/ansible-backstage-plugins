---
title: "ADR-024: Compliance Score Trend Chart Redesign"
description: "The original compliance score trend chart was a hand-rolled SVG component (160 lines inline in `ComplianceDashboard"
type: adr
status: accepted
date: 2026-06-11
product: "AAP Compliance Dashboard"
---
# ADR-024: Compliance Score Trend Chart Redesign

**Status:** Accepted (Implemented 2026-06-11)  
**Date:** 2026-06-11  
**Deciders:** Massimo Ferrari  

## Context

The original compliance score trend chart was a hand-rolled SVG component (160 lines inline in `ComplianceDashboard.tsx`) that showed a single aggregate compliance line. It had no scope selector, no event highlighting, and only 3 date labels. Users couldn't distinguish per-profile or per-inventory trends, and couldn't see whether a score change was a regression or improvement.

### Competitive Research (2026-06-11)

Research across 11 platforms (Drata, Vanta, Qualys, Tenable, Wiz, Datadog, Grafana, SonarQube, Snyk, CIS-CAT Pro, Puppet Comply) found:
- **Every platform** scopes trends per-standard with a selector, not a single blended line
- **CIS-CAT Pro**: each selected benchmark gets its own line on the graph
- **Datadog/Grafana**: event annotations (vertical lines) mark deployments/incidents on the timeline
- **Drata**: 7-day change baseline with red dots for new failures
- **SonarQube**: event markers for quality gate changes, profile changes, version releases

## Decisions

### §1 — Recharts replaces hand-rolled SVG

Use Recharts library for the trend chart. Provides custom dots, reference lines, tooltips, responsive containers, and monotone curve interpolation out of the box.

### §2 — Chip-based multi-select filters (updated 2026-06-17)

~~Three-level scope selector~~ Replaced with chip-based multi-select filters:

**Default state**: all profiles and all inventories visible (one line per profile).

**Filter controls**: Two `MultiFilterGroup` chip groups (Profiles, Inventories) with expandable child chips. Active filter pills row shows selected items with dismiss buttons (X) and a "Clear all" chip. Follows the same chip pattern as the ResultsViewer findings filter.

**Supported combinations**:
- Multiple profiles, no inventory filter → one line per selected profile
- One profile, no inventory filter → single-line with regression/improvement event markers
- One or more profiles + one or more inventories → one line per profile×inventory combination, with composite labels (e.g., "DISA STIG — Production")
- Empty selection = show all (inclusive default)

**Data strategy**: Client-side filtering from the initial 90-day dataset (`initialData` already fetched by `ComplianceDashboard`). No per-scope API calls — reduces latency and network traffic. `buildFilteredSeries()` in `trendUtils.ts` handles composite `profileId:inventoryId` grouping with the same timestamp-merge + forward-fill algorithm as `buildMultiProfileSeries()`.

Filter options populated from existing `DashboardStats.frameworkScores` and `DashboardStats.byInventory` — no new API calls for scope metadata.

### §3 — Event highlighting with shape redundancy

- **Regression**: red downward triangle (`#C9190B`), triggered when score drops ≥3 percentage points
- **Improvement**: green upward triangle (`#3E8635`), triggered when score improves ≥5 percentage points
- **Normal**: small blue circle (`#0066CC`)
- **Remediation events**: gray dashed vertical reference lines (`#6A6E73`) at completion timestamps

Shape redundancy (triangles vs circles) ensures colorblind accessibility alongside red/green coloring.

### §4 — Event detection is client-side

Compare consecutive `PostureSnapshot` points to detect regressions/improvements. No new database columns. Remediation events fetched via new `GET /posture/events` endpoint (lightweight query on existing `compliance_remediation_executions` table).

### §5 — Backend additions

- `GET /posture` gains `inventoryId` query parameter (filters `compliance_posture_snapshots` by `inventory_id`)
- `GET /posture/events` returns `RemediationEvent[]` (completed executions in time range)
- Posture history LEFT JOINs `compliance_scans` to include `workflowJobId` for numeric scan navigation (not UUID)
- Input validation via `parseInventoryId()` in validation module

## Implementation Notes (2026-06-11, updated 2026-06-17)

Fully implemented and merged:
- `PostureTrendChart.tsx` — Recharts component with chip-based multi-select filters
- `TrendFilterBar.tsx` — filter bar with `MultiFilterGroup` components and active filter pills
- `MultiFilterGroup.tsx` — reusable multi-select chip filter in `shared/` (extends `FilterOption` from `FilterGroup`)
- `trendUtils.ts` — event detection (`detectEvents`), multi-profile series (`buildMultiProfileSeries`), filtered series with composite keys (`buildFilteredSeries`)
- `trendUtils.test.ts` — 22 unit tests for detection thresholds, multi-profile grouping, and filtered series
- Architect review completed: H1 (input validation), H2 (type safety), H3 (null guards) fixed
- Second architect review (2026-06-17): remediation events filtered by profile, `SURFACE_COLORS.onDark` replaces hardcoded `#fff`
- `type="monotone"` for smooth curve interpolation
- Old inline SVG chart removed from `ComplianceDashboard.tsx` (160 lines deleted)
- Old scope selector (ButtonGroup + Select dropdowns) replaced with `TrendFilterBar`

## Related

- ADR-012: Dashboard UX competitive alignment (original chart design)
- ADR-023: Inventory-centric view (uses the inventory filter from this chart)
