---
title: "ADR-036: Stable Profile Identity via Slug"
description: "Migration 021 added `UNIQUE(framework)` to prevent duplicate profiles on disconnect→re-add cycles"
type: adr
status: accepted
date: 2026-06-30
product: "AAP Compliance Dashboard"
---
# ADR-036: Stable Profile Identity via Slug

**Status:** Accepted (Implemented 2026-06-30)  
**Date:** 2026-06-30  
**Deciders:** Massimo Ferrari  

## Context

Migration 021 added `UNIQUE(framework)` to prevent duplicate profiles on disconnect→re-add cycles. This broke CIS L1 and CIS L2 because both share `framework: 'CIS'`. Migration 022 widened to `UNIQUE(framework, display_name)` as a hotfix, but display names are fragile user-typed strings — a different spelling on re-add creates a new profile, orphaning historical data.

Three scenarios need a proper identity model:
1. Disconnect→reconnect same profile — seamlessly pick up existing scans
2. Profile version upgrade (V1→V2) — old scans stay version-pinned
3. Custom profile replacing OOB — separate by default

### Competitive Research

Industry consensus (Qualys, Tenable, CIS-CAT, DISA):
- Scans are version-pinned — no platform migrates results to a new benchmark version
- V1 and V2 coexist — user decides when to stop scanning the old version
- DISA STIG Viewer is the only tool with a transfer mechanism (VulnID-based)
- Custom profiles are standalone — no parent-child lineage (except Chef InSpec)

## Decision

### §1 — Stable profile slug as identity key

Add `profile_slug VARCHAR(128) UNIQUE` to `compliance_profile_registry`. The slug is the reconnect key — two profiles with the same `framework` but different slugs are independent.

**Tier 1 profiles** declare slug in `compliance-profile.yml`:
```yaml
profile:
  slug: "rhel9-cis-l1"
  name: "CIS Benchmark RHEL 9 Level 1 - Server"
  framework: "CIS"
```

**Tier 2 / Settings form**: Slug is an explicit field, auto-derived from display name as fallback. When disconnected profiles exist with the same framework, the form shows a reconnect picker.

Slugs: `rhel9-stig`, `rhel9-cis-l1`, `rhel9-cis-l2`, `supply-chain`.

### §2 — Version-pinned scans

Add `profile_version VARCHAR(64)` to `compliance_scans`. Populated at scan creation from the profile's current `version` field. This enables:
- Trend chart version boundary markers
- Audit queries filtered by assessment version
- Version upgrades without corrupting historical comparisons

### §3 — Slug-based reconnect and disconnect

- `saveProfile()`: matches by `profile_slug` (not framework + display_name)
- `connectProfile()`: searches by slug first, then framework + displayName fallback
- `POST /compliance-profiles/disconnect` accepts `slug` parameter
- `POST /compliance-profiles/disconnect` with `framework` only is deprecated (logged)
- Install/uninstall playbooks pass `profile_slug` in extra_vars

### §4 — Scenario handling

**Disconnect→reconnect**: Same slug → `saveProfile` finds disconnected row → reconnects with same UUID. All scans, remediations, trend lines preserved.

**Version upgrade**: Same slug, new version → updates version field, pushes old to `version_history`. Scans carry `profile_version` at creation. For full separation, install V2 with a different slug.

**Custom replacing OOB**: Different slug → independent. Scan history transfer deferred to P2.

## Implementation Notes

- Migration 023: `profile_slug` column, backfill via JS `slugify()`, `UNIQUE(profile_slug)` added before `UNIQUE(framework, display_name)` dropped, `profile_version` on scans
- `ProfileFormDialog`: slug field auto-derived from name, immutable on edit, auto-populated from JT extra_vars
- `ProfileSettings`: shows slug in monospace under profile name
- All 4 `compliance-profile.yml` + `install.yml` updated with `slug` field

## Related

- ADR-014: Remediation Lifecycle Architecture (baseline targets reference profile_id)
- ADR-035: Vulnerability-Free Rate Score Fix (scan_metadata per-host data)
