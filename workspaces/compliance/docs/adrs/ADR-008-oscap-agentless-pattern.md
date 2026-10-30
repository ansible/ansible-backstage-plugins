---
title: "ADR-008: OpenSCAP Agentless Pattern (Install/Scan/Remove)"
description: "OpenSCAP requires the `openscap-scanner` binary and the SCAP Security Guide datastream (`ssg-rhel9-ds"
type: adr
status: accepted
date: 2026-05-26
product: "AAP Compliance Dashboard"
---
# ADR-008: OpenSCAP Agentless Pattern (Install/Scan/Remove)

**Status:** Accepted
**Date:** 2026-05-26 (PRs #4-#7)
**Deciders:** M. Ferrari

## Context

OpenSCAP requires the `openscap-scanner` binary and the SCAP Security Guide datastream (`ssg-rhel9-ds.xml`) to run on target hosts. Two approaches were considered:

1. **Pre-installed:** Require oscap to be installed on all targets as a prerequisite. Simple but adds a dependency that may not be acceptable in all environments.
2. **Agentless:** Install oscap at scan time, run the scan, remove oscap after. Zero persistent footprint on targets.

AAP's core value proposition is agentless automation. Requiring persistent scanner installation on targets contradicts this.

## Decision

Use an **agentless install/scan/remove pattern** in the assessment playbook (`run_oscap.yml`, Play 1):

1. **Install:** Install `openscap-scanner` from RHEL base repos on target hosts (yum/dnf)
2. **Copy datastream:** Push `ssg-rhel9-ds.xml` from the EE to the target (`/tmp/ssg-rhel9-ds.xml`)
3. **Scan:** Run `oscap xccdf eval` on the target, producing XCCDF results XML
4. **Fetch:** Retrieve the XCCDF results XML from the target to the execution node
5. **Remove:** Uninstall `openscap-scanner` and remove the datastream file from the target

The `scap-security-guide` RPM is installed in the EE (not on targets) because it is ~80MB and contains content for all platforms. Only the relevant datastream file (~6MB) is copied to each target.

## Consequences

- **Positive:** Zero persistent footprint on targets -- fully agentless.
- **Positive:** No prerequisite software on targets beyond standard RHEL repos.
- **Positive:** Aligns with AAP's agentless automation model.
- **Negative:** Each scan incurs RPM install/remove overhead (~10-15 seconds per host).
- **Negative:** Requires RHEL base repos to be accessible from targets (or a local mirror configured). Air-gapped environments need the RPM pre-staged.
- **Negative:** The install/remove steps add complexity to the playbook and create a window where oscap is temporarily installed on the target.
