---
title: "ADR-012: Dashboard UX — Competitive Alignment"
description: "The compliance dashboard had a "PostureOverviewCard" showing "X of Y profiles above 80% target" — a metric with no compe"
type: adr
status: accepted
date: 2026-05-31
product: "AAP Compliance Dashboard"
---
# ADR-012: Dashboard UX — Competitive Alignment

**Status:** Accepted  
**Date:** 2026-05-31  
**Deciders:** Massimo Ferrari  

## Context

The compliance dashboard had a "PostureOverviewCard" showing "X of Y profiles above 80% target" — a metric with no competitive precedent that duplicated information already visible in the per-profile gauges. A competitive analysis across 6 platforms (Drata, Vanta, CIS-CAT Pro, Chef InSpec/Automate, Qualys Policy Compliance, Puppet Comply) revealed that no competitor uses this pattern.

The analysis also identified a gap in our stat cards: competitors (specifically Drata) show trend deltas on key operational metrics to answer "are we getting better or worse?"

## Decision

1. **Remove PostureOverviewCard.** No competitor uses a "profiles above threshold" counter. The per-profile gauges already convey individual compliance rates.

2. **Add Drata-style trend deltas** to Critical (CAT I) and Pending Remediation stat cards only. Drata is the only competitor with period-over-period deltas on the homepage; all others show trends as separate charts (which we already have via PostureTrendChart). Applied selectively to the two metrics where "better or worse" is actionable — not to Hosts Scanned or Active Profiles (config counts, not trends).

3. **Inventory view gauges must be clickable** and navigate to the contributing scan's results, matching the profile view gauge behavior (clickable with popover).

4. **Dashboard posture queries the latest scan per (profileId × inventoryId)** with no arbitrary row limit, so profiles don't disappear when remediation noise fills the recent-scans window.

## Competitive Evidence

| Product | Homepage KPIs | Trend on Cards? |
|---------|--------------|----------------|
| Drata | Framework readiness %, failing tests + % change vs 7 days | YES — only one |
| Vanta | Evidence/control completion %, issues report | LIMITED |
| CIS-CAT | Homepage IS a trend graph | N/A |
| Chef Automate | Node pass/fail/skip counts + severity bar | No — separate chart |
| Qualys PC | KPI tiles + bar charts, optional trend toggle | Configurable |
| Puppet Comply | Dual compliance scores, clickable tiles | Separate chart |

## Consequences

- Dashboard is cleaner with fewer redundant elements
- Trend deltas provide at-a-glance direction without requiring users to read the trend chart
- The `postureStatus` field remains on `DashboardStats` for backward compatibility (used by `InventoryPostureView`)
- `PostureOverviewCard.tsx` deleted; `ProfilePostureStatus` type retained
- The dashboard query (`getLatestScanPerProfileInventory`) uses a self-join; should be monitored for performance on large datasets

## Related

- ADR-003: Single assessment JT (affects how scans populate dashboard data)
- Competitive analysis: `prototypes/compliance-pipelines/context/ux-assessment-vs-analysis.md`
- Roadmap: Dashboard items in P2b
