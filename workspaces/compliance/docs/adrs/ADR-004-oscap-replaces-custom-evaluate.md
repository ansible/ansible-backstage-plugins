---
title: "ADR-004: OpenSCAP Replaces Custom Evaluate Module"
description: "The original scanning pipeline used two custom Ansible modules:"
type: adr
status: accepted
date: 2026-05-26
product: "AAP Compliance Dashboard"
---
# ADR-004: OpenSCAP Replaces Custom Evaluate Module

**Status:** Accepted
**Date:** 2026-05-26 (PRs #4-#13)
**Deciders:** M. Ferrari, architect review

## Context

The original scanning pipeline used two custom Ansible modules:

- `compliance_gather` -- collected system facts (packages, services, SSH config, SELinux)
- `compliance_evaluate` -- evaluated facts against hand-written rules in `rules/stig_rhel9_v2r8.yml`

This approach had three critical problems:

1. **Rule coverage:** Only 20 hand-written rules vs. 366 STIG rules in the SCAP Security Guide
2. **Scan/remediation misalignment:** Custom checks evaluated different conditions than CaC remediation tasks (e.g., checked wrong paths, missed drop-in dirs)
3. **Maintenance burden:** Every new rule required writing both evaluation logic and rule metadata by hand

OpenSCAP (`oscap xccdf eval`) with `scap-security-guide` is the standard RHEL STIG scanner, maintained by Red Hat as an RPM. DISA quarterly updates flow through Red Hat RPM updates to customer EE rebuilds.

## Decision

Replace the custom `compliance_gather` + `compliance_evaluate` modules with an OpenSCAP-based pipeline:

1. `oscap xccdf eval` runs on targets using the SCAP Security Guide STIG datastream (`ssg-rhel9-ds.xml`)
2. `normalize_xccdf` module parses the XCCDF results XML and extracts all metadata (title, description, fix_text, severity, stig_id) directly from the XCCDF datastream -- no external rules YAML needed
3. Rule IDs are stripped of the XCCDF prefix (`xccdf_org.ssgproject.content_rule_`) so they match CaC remediation tag names

The deprecated modules and `rules/stig_rhel9_v2r8.yml` are retained for backward compatibility but are no longer the primary scanning path.

## Consequences

- **Positive:** 366 rules come free with `scap-security-guide` -- zero rule authoring.
- **Positive:** Scan and remediation are aligned -- oscap checks exactly what CaC fixes.
- **Positive:** Self-contained metadata -- XCCDF results include title, description, check_text, fix_text, severity. No bundled rules YAML needed.
- **Positive:** Zero maintenance for rule updates -- DISA quarterly updates flow through RPM updates.
- **Negative:** oscap produces 366 findings per host, which revealed Controller event data truncation issues (see ADR-005).
- **Negative:** oscap binary must be installed on targets at scan time (see ADR-008 for the agentless pattern).
