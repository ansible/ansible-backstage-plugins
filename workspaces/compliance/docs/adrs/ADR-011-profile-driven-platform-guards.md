---
title: "ADR-011: Profile-Driven Platform Guards"
description: "The compliance plugin currently has no mechanism to prevent launching a scan against incompatible hosts"
type: adr
status: accepted
date: 2026-05-27
product: "AAP Compliance Dashboard"
---
# ADR-011: Profile-Driven Platform Guards

**Status:** Accepted
**Date:** 2026-05-27
**Deciders:** M. Ferrari

## Context

The compliance plugin currently has no mechanism to prevent launching a scan against incompatible hosts. A RHEL 9 STIG profile run against Windows or network devices fails silently — hosts appear as "unreachable" or produce meaningless results with no clear indication that the profile was wrong for those hosts.

The naive fix is hardcoding `when: ansible_os_family == 'RedHat'` in the oscap playbook, but this breaks when adding Windows STIG, Cisco IOS STIG, or external scanners (Tenable, Qualys, Insights) — each with different platform requirements.

Options considered:
1. **Hardcoded OS checks per playbook** — simple but doesn't scale to multiple profiles/scanners. Rejected.
2. **Profile-driven platform declarations** — each compliance profile declares supported platforms; the plugin validates inventory before launch. Accepted.
3. **Post-scan filtering** — run against everything, filter results after. Rejected: wastes resources, confuses users with false failures.

## Decision

Each compliance profile declares its platform requirements in a structured `platform` spec. The scan pipeline validates the inventory against the profile's spec at two layers:

### Platform spec schema

```yaml
platform:
  # OS-based profiles (RHEL STIG, Windows STIG)
  os_family: ["RedHat"]           # ansible_os_family values
  os_version: ["9"]               # major version
  
  # Network device profiles (Cisco IOS STIG)
  # device_type: ["cisco_ios", "cisco_nxos"]
  
  # External scanners (Tenable, Qualys, Insights)
  # scanner_validates: true       # skip host-side checks
```

### Validation layers

1. **Pre-launch validation (plugin backend):** Before launching the assessment JT, query inventory hosts from the Controller API and check host facts (or variables) against the profile's platform spec. If mismatched hosts are found, warn the user and optionally block the launch.

2. **Playbook-side guards (safety net):** The assessment playbook uses the platform spec to set dynamic `when:` conditions. Hosts that don't match receive a `not_applicable` finding status instead of failing silently or being marked unreachable.

3. **External scanner bypass:** Profiles with `scanner_validates: true` skip both layers — the external scanner handles its own platform targeting and filtering.

### Cartridge registry extension

The `compliance_cartridge_registry` table (or profile registration API) gains a `platform` JSON column storing the platform spec. The Settings tab UI shows the platform requirements when registering or viewing a profile.

## Consequences

- **Positive:** Works for all profile types — RHEL, Windows, network devices, external scanners — without per-profile hardcoding.
- **Positive:** Pre-launch validation catches mismatches before wasting a JT run.
- **Positive:** Profile creators declare platform requirements once; the plugin enforces everywhere.
- **Positive:** `not_applicable` status for mismatched hosts is clearer than silent failure.
- **Negative:** Requires host facts to be available before scan launch (may need a gather_facts pre-check or cached facts from Controller).
- **Negative:** Adds a column to the profile registry and a validation step to the scan launch flow.

## Implementation notes

- The platform spec is stored as JSON in the profile registry, not as separate columns — flexible for future platform types.
- Pre-launch validation should be a warning by default, not a hard block — the user may know their inventory better than the cached facts suggest.
- For Tier 2+ scanners, `scanner_validates: true` is the escape hatch that keeps the plugin from second-guessing the external scanner's targeting.
