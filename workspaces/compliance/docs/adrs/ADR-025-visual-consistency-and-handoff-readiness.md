---
title: "ADR-025: Visual Consistency and Handoff Readiness"
description: "An architect review compared our compliance plugin against the downstream `ansible-backstage-plugins` reference implemen"
type: adr
status: accepted
date: 2026-04-23
product: "AAP Compliance Dashboard"
---
# ADR-025: Visual Consistency and Handoff Readiness

**Status**: Accepted  
**Date**: 2026-06-11  
**Author**: Claude (Architect review)

## Context

An architect review compared our compliance plugin against the downstream `ansible-backstage-plugins` reference implementation to assess handoff readiness. Three categories of issues were identified: visual inconsistency across tabs, incomplete color constant migration (mixed inline hex + shared constants), and wrong palette values (MUI colors instead of PatternFly).

## Decision

1. **Centralize ALL semantic colors** in `shared/colors.ts`. Zero inline hex colors for semantic values (success/error/warning/info/neutral/severity). UI chrome colors (`#fff`, `#e0e0e0`, `#F5F5F5`) remain inline.

2. **Use filled chip style** (solid background, white text) as the canonical pattern — aligned with the Results tab and downstream Portal plugins. Pastel bg/fg chips removed.

3. **Standardize table treatment** via `shared/chipStyles.ts` (`TABLE_STYLES.header`, `TABLE_STYLES.cell`). All three data tabs (Results, Remediations, Inventories) use `TableContainer component={Paper} variant="outlined"` with consistent 0.75rem bold headers.

4. **Use 3-tier score thresholds** (90% green, 70% amber, <70% red) via `scoreColor()`. Replaces the previous mix of 3-tier and 4-tier scales.

5. **Remove debug endpoints** (`/dashboard/debug`, `/inventory/debug`) — unauthenticated, leak internal state.

## Consequences

- Every component importing colors gets them from one source — a developer seeing `colors.ts` knows that's the single authority
- Downstream team can adopt or replace the constants file — it's a clean extension of Backstage patterns, not a proprietary framework
- The 4-tier gauge scale (90/75/50) is gone — scores 50-69% are now all red instead of orange. This is a minor UX regression but simplifies the codebase.
