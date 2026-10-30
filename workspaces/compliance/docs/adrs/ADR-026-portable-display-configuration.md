---
title: "ADR-026: Portable Display Configuration"
description: "The dashboard previously hardcoded column labels ("Rule ID", "STIG ID"), severity labels ("CAT I", "CAT II", "CAT III"),"
type: adr
status: accepted
date: 2026-06-25
product: "AAP Compliance Dashboard"
---
# ADR-026: Portable Display Configuration

**Status:** Accepted
**Date:** 2026-06-25
**Deciders:** M. Ferrari, architect review

## Context

The dashboard previously hardcoded column labels ("Rule ID", "STIG ID"), severity labels ("CAT I", "CAT II", "CAT III"), and gauge text ("compliance rate") for all profiles. Adding a non-STIG profile (like supply chain vulnerability scanning or PQC cryptography assessment) would require `if (framework === 'X')` conditionals scattered throughout the frontend. This does not scale.

Two approaches:

1. **Framework-specific conditionals:** Add switch statements or conditional blocks in every rendering component that needs framework-specific terminology. Requires frontend code changes and redeployment for each new framework.
2. **Declarative display configuration:** Profiles declare how their data should render via a `display:` block in `compliance-profile.yml`. The frontend reads this configuration dynamically and adapts rendering at runtime. No code changes needed for new frameworks.

## Decision

**Profiles declare their display configuration.** Each profile's `compliance-profile.yml` includes an optional `display:` block that specifies gauge labels, column headers, severity terminology, and other rendering hints. The frontend reads this configuration dynamically via the `useDisplayConfig` hook and adapts rendering accordingly. When no display config is present, the system falls back to STIG-compatible defaults.

Key display configuration fields:

- `gauge_label`: Text above the compliance gauge (e.g., "compliance rate", "vulnerability-free rate")
- `gauge_unit`: Unit for the gauge percentage (e.g., "%", "% compliant", "% clean")
- `columns`: Array of field-to-label mappings for the findings table (e.g., `{field: "rule_id", label: "Rule ID"}`, `{field: "cve_id", label: "CVE"}`)
- `severity_map`: Custom labels for severity levels (e.g., `{CAT_I: "CAT I", CAT_II: "CAT II", CAT_III: "CAT III"}` for STIG, `{HIGH: "High Risk", MEDIUM: "Medium Risk", LOW: "Low Risk"}` for vulnerabilities)
- `remediation_verb`: Action word for remediation buttons (e.g., "Remediate", "Patch", "Fix")

The configuration flows through the system as follows:

1. Profile author adds `display:` block to `profiles/*/meta/compliance-profile.yml`
2. Assessment JT passes the display config in `extra_vars` (auto-populated in the Settings form)
3. SaveProfileRequest includes `display_config` field
4. Backend stores it in the `compliance_profiles.display_config` JSONB column (migration 018)
5. Frontend reads it via `useDisplayConfig` hook in rendering components

## Consequences

- **Positive:** No framework-specific conditionals needed in the UI code. Adding a new compliance framework requires only authoring the profile manifest -- no plugin code changes.
- **Positive:** Profiles are truly self-contained (extends ADR-006). Display configuration is part of the profile content, versioned alongside the collection.
- **Positive:** Fallback to STIG defaults ensures backward compatibility with existing profiles that do not declare display configuration.
- **Positive:** The `display_config` JSONB column allows future extensibility without schema migrations (can add new display hints without altering the table structure).
- **Negative:** Display configuration must be set in JT `extra_vars` or manually configured via the Settings UI. There is no auto-detection from collection files at runtime -- if the profile author forgets to include the display config, the dashboard falls back to STIG terminology (which may be confusing for non-STIG frameworks).
- **Negative:** The frontend rendering components must handle both the configured values and fallback values, increasing complexity slightly in `useDisplayConfig` and related hooks.

## Related Files

- Types: `compliance-common/src/types/display.ts` (ProfileDisplayConfig, DisplayColumn, SeverityMap)
- Hook: `compliance/src/components/ResultsViewer/hooks/useDisplayConfig.ts`
- Auto-populate: `compliance/src/components/ProfileSettings/ProfileFormDialog.tsx` (display_config in applyAutoPopulate)
- Database: Migration 018 adds `display_config` JSONB column to `compliance_profiles`
- Profile manifest: `profiles/*/meta/compliance-profile.yml` (display: block)
