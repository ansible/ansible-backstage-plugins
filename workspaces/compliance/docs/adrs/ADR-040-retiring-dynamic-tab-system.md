---
title: 'ADR-040: Retiring the Dynamic Tab System (ADR-027)'
status: Accepted
date: 2026-11-02
deciders: Architecture alignment review (Content Experience Architecture conformance)
---

# ADR-040: Retiring the Dynamic Tab System (ADR-027)

## Status

Accepted — 2026-11-02

## Context

ADR-027 gave compliance profiles two ways to extend the dashboard with
custom, per-profile UI without plugin code changes:

- **Tier 1** — a declarative `display.tab.layout` in `compliance-profile.yml`,
  composed by `DynamicProfileTab` from a fixed vocabulary of widgets
  (`summary_card`, `severity_breakdown`, `findings_table`, `trend_chart`,
  `gauge`, `host_breakdown`, plus later additions `score_grid`,
  `action_table`, `host_risk_heatmap`).
- **Tier 2** — a profile-supplied JavaScript bundle, uploaded to
  `PUT /compliance-profiles/:id/bundle`, served back by
  `GET /compliance-profiles/:id/bundle`, and (per the ADR) loaded by the
  frontend via dynamic `import()`.

Compliance registers as a host-owned experience with a declarative
`PluginManifest` (`complianceManifest.ts`, `EXPERIENCE_IDS.COMPLIANCE`). That
manifest model and ADR-027's bundle mechanism are two different answers to the
same underlying question —
"how does a plugin declare a UI surface without the host hardcoding it?" —
and they do not compose: the host's `ContributionRegistry` validates
capabilities declared at plugin-registration time against a known schema; a
bundle fetched per-profile at runtime, executed with full React context
access, bypasses that validation entirely and reintroduces exactly the kind
of out-of-band extension point the manifest model exists to replace.

### What Tier 2 actually was

Auditing the current codebase (not just the ADR text) found:

- The three backend endpoints (`PUT`/`GET`/`DELETE
/compliance-profiles/:id/bundle`) and their three
  `ComplianceDatabase` methods (`saveProfileBundle`, `getProfileBundle`,
  `deleteProfileBundle`) exist and are tested.
- **No frontend code ever called `import()` on a bundle, or referenced
  these endpoints.** `CustomComponentRef`/`custom_component` exist as types
  on `TabConfig` but nothing reads `custom_component` to decide what to
  render. Tier 2 was wired on the backend and never connected on the
  frontend.

This means retiring Tier 2 removes dead write/read paths, not a feature in
active use. The security and version-skew risks ADR-027 itself flagged
("Profiles must be trusted content sources"; "no formal plugin API contract
yet") are being resolved by never having shipped the consuming half, not by
a migration of live data.

### What Tier 1 is

Tier 1's widgets are real, rendered via `DynamicProfileTab`, and used by at
least the supply-chain and PQC-readiness profiles referenced in ADR-027.
Tier 1 is not being deleted — the _surface_ that renders it (the
profile-declared dynamic tab, mounted at `/compliance/profile-tab/:profileId`
by `ComplianceRouter`) is being re-expressed as a `CapabilityEntryPoint` on
`complianceManifest.ts`'s `compliance.scan-and-assess` capability, alongside
Overview/New Scan/Results. This is a profile-specific assessment view, not
a settings surface. The individual widget vocabulary
(`summary_card`, `severity_breakdown`, `findings_table`, `trend_chart`,
`gauge`, `host_breakdown`, `score_grid`, `action_table`,
`host_risk_heatmap` — `WidgetType` in `compliance-common`'s `display.ts`)
remains a data contract read from `compliance-profile.yml`, not a set of
separate entry points — a widget does not independently "launch" anywhere,
it is a layout primitive composed within the one dynamic-tab entry point.

## Decision

1. **Tier 2 (custom JS bundle) is retired.** The three bundle endpoints in
   `compliance-backend/src/routes/profiles.ts` and the three
   `ComplianceDatabase` bundle methods are removed. The `bundle_data` /
   `bundle_metadata` columns on `compliance_profile_registry` are left in
   place — migrations are immutable history — but are no longer read or
   written by any code path.
2. **`CustomComponentRef` and `TabConfig.custom_component` are removed**
   from `compliance-common`'s `display.ts` types, since nothing produced
   or consumed them.
3. **Tier 1 (widget-based layout) is retained** as the one supported way
   for a profile to customize its dashboard surface, and is the basis for
   re-expressing compliance's dashboard tabs as manifest-declared
   `CapabilityEntryPoint`s rather than a separate profile-metadata-driven
   mechanism.
4. **ADR-027 is marked Superseded**, pointing to this ADR.
   It is retained for historical context on why the dynamic-tab problem
   existed in the first place.

## Consequences

- **Positive:** Removes a code path with no consumer and the security
  surface ADR-027 itself called out (arbitrary JS execution in the
  dashboard's React context from profile-supplied content).
- **Positive:** Compliance's extensibility story becomes singular — a
  plugin declares what it can render via its manifest, validated by the
  host — rather than two parallel mechanisms (manifest capabilities and
  profile-declared custom tabs) that could drift out of sync.
- **Neutral:** `compliance-profile.yml`'s `display.tab.layout` (Tier 1)
  continues to work unchanged for existing profiles; only
  `display.tab.custom_component` (Tier 2, never consumed) is removed.
- **Negative:** Any profile collection that _did_ ship a
  `backstage/dist/bundle.js` and relied on uploading it via the now-removed
  endpoints will need to migrate to Tier 1 widgets or wait for the
  manifest-based re-expression of Tier 1. Given Tier 2 had no frontend
  consumer, this is expected to affect zero in-use profiles, but is called
  out here in case an out-of-tree profile collection assumed otherwise.

## Related

- Supersedes ADR-027 (`ADR-027-dynamic-tab-system.md`).
- See `.sdlc/research/compliance-experience-alignment/detailed-gap-analysis.md`
  for the Content Experience alignment handover (manifest, operations, and
  Tier 1 re-expression as `compliance.scan-and-assess.profile-tab`).
