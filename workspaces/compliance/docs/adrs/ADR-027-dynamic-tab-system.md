---
title: "ADR-027: Dynamic Tab System"
description: "The compliance dashboard has a fixed set of tabs: Overview, New Scan, Results, Remediations, Inventories, and Settings"
type: adr
status: accepted
date: 2026-06-25
product: "AAP Compliance Dashboard"
---
# ADR-027: Dynamic Tab System

**Status:** Accepted
**Date:** 2026-06-25
**Deciders:** M. Ferrari, architect review

## Context

The compliance dashboard has a fixed set of tabs: Overview, New Scan, Results, Remediations, Inventories, and Settings. Each tab is hardcoded in `ComplianceRouter.tsx`. Profiles like supply chain vulnerability scanning or post-quantum cryptography (PQC) assessment may want dedicated views with profile-specific widgets or layouts. Hardcoding tabs per framework would require frontend code changes for each new profile and does not scale.

Two approaches:

1. **Fixed tab set with conditional rendering:** Keep the existing six tabs and use `if (profile.framework === 'X')` conditionals to show framework-specific content within Results or Overview. Requires code changes for each new framework.
2. **Dynamic tab system:** Allow profiles to declare custom tabs in their metadata. The dashboard injects these tabs dynamically at runtime, either by composing predefined widgets (Tier 1) or by loading a pre-built JavaScript bundle (Tier 2). No plugin code changes needed for new frameworks.

## Decision

**Profiles can declare custom tabs.** The system supports two tiers of extensibility:

### Tier 1: Widget-Based Layout

A profile declares a `display.tab.layout` configuration in `compliance-profile.yml`. This configuration specifies which widgets to render and in what order. The `DynamicProfileTab` component composes the view from a predefined vocabulary of widgets:

- `summary_card` — Key metrics (total findings, compliance rate, last scan timestamp)
- `severity_breakdown` — Pie chart or bar chart showing distribution by severity
- `findings_table` — Paginated table of findings with filtering and sorting
- `trend_chart` — Line chart showing compliance trends over time
- `gauge` — Circular gauge showing compliance percentage
- `host_breakdown` — Table of hosts with per-host compliance rates

Widget configurations are declarative JSON that maps to React components. The frontend reads the layout config from `profile.display_config.tab.layout` and renders the widgets in the specified order.

### Tier 2: Custom JavaScript Bundle

A profile ships a pre-built JavaScript bundle at `backstage/dist/bundle.js` within the profile collection. The backend serves this bundle via `GET /compliance-profiles/:id/bundle`. The frontend loads it via dynamic import and renders the exported default component.

This enables full React customization: a profile can ship its own charts, tables, and interactive widgets using any dependencies bundled into the JavaScript module. The bundle is uploaded to the backend via `PUT /compliance-profiles/:id/bundle` and deleted via `DELETE /compliance-profiles/:id/bundle`.

### Rendering Priority

1. If a Tier 2 bundle exists for the profile, use it.
2. Otherwise, if a Tier 1 widget layout is configured, render the `DynamicProfileTab` with the configured widgets.
3. Otherwise, no custom tab is shown (fallback to the standard six tabs).

### Tab Injection

Dynamic tabs are injected into `ComplianceRouter` before the Settings tab. The `allTabs` array is constructed by merging:

1. Core tabs (Overview, New Scan, Results, Remediations, Inventories)
2. Dynamic tabs from active profiles (if they have `display.tab` configuration)
3. Settings tab (always last)

The `DynamicTabRefreshContext` broadcasts profile save/delete events, causing the tab list to refresh instantly without a page reload. Routes are registered dynamically for each profile's custom tab using the pattern `/compliance/:profileId`.

## Consequences

- **Positive:** New compliance frameworks can add custom dashboard views without modifying plugin code. This enables true profile self-containment (extends ADR-006 and ADR-026).
- **Positive:** The Tier 1 widget vocabulary provides a low-effort path for common layouts (summary + table + chart). Most profiles will not need custom JavaScript.
- **Positive:** Tier 2 enables full React customization for profiles with specialized visualization needs (e.g., PQC quantum threat timelines, supply chain SBOM dependency graphs). The JavaScript bundle can use any npm dependencies and custom logic.
- **Positive:** Tab list updates instantly on profile changes via `DynamicTabRefreshContext`, providing a seamless user experience (no manual browser refresh needed).
- **Negative:** Tier 1 widget capabilities are limited to the predefined vocabulary. Adding a new widget type requires a plugin code change (though existing widgets cover most common use cases).
- **Negative:** Tab rendering depends on `display_config` being set correctly in the profile metadata. If the config is missing or malformed, the dynamic tab will not appear (fallback to core tabs only).
- **Negative:** Tier 2 bundles introduce security and version skew risks: the JavaScript bundle is executed in the browser with full access to the React context. Profiles must be trusted content sources. Additionally, the bundle may become incompatible with future plugin versions if internal APIs change (no formal plugin API contract yet).

## Related Files

- `DynamicProfileTab`: `compliance/src/components/DynamicProfileTab/DynamicProfileTab.tsx` (Tier 1 renderer)
- Widgets: `compliance/src/components/DynamicProfileTab/widgets.tsx` (6 predefined widget components)
- Router: `compliance/src/components/ComplianceRouter.tsx` (DynamicTabRefreshContext, allTabs construction, dynamic route registration)
- Bundle endpoints: `compliance-backend/src/routes/profiles.ts` (PUT, GET, DELETE `/compliance-profiles/:id/bundle`)
- Types: `compliance-common/src/types/display.ts` (TabConfig, TabWidget, CustomComponentRef)
- Profile manifest: `profiles/*/meta/compliance-profile.yml` (display.tab block)
