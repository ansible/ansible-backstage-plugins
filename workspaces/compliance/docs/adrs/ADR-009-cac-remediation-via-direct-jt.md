---
title: "ADR-009: CaC Remediation via Direct JT with job_tags"
description: "The compliance plugin needs to execute selective remediation -- applying only specific STIG rules to specific hosts with"
type: adr
status: accepted
date: 2026-04-23
product: "AAP Compliance Dashboard"
---
# ADR-009: CaC Remediation via Direct JT with job_tags

**Status:** Accepted
**Date:** 2026-04-23 (formalized 2026-05-26)
**Deciders:** M. Ferrari, architect review

## Context

The compliance plugin needs to execute selective remediation -- applying only specific STIG rules to specific hosts with optional parameter overrides. ComplianceAsCode (CaC) provides `rhel9-playbook-stig.yml` (55K lines, 4474 tasks) from the `scap-security-guide` RPM, where each task is tagged with a rule ID.

Two approaches were considered:

1. **Workflow node:** Remediation as a node in the assessment workflow, triggered automatically after evaluation
2. **Direct JT launch:** Remediation as a separate, standalone job template launched independently with `job_tags` for scoped rule selection

## Decision

Remediation is launched as a **separate, standalone job template** -- never combined with assessment and never as a workflow node. The remediation JT imports the CaC playbook and is launched directly with:

- `job_tags` -- comma-separated rule IDs from the Remediation Builder (maps to Ansible `--tags`)
- `extra_vars` -- parameter overrides from the Remediation Builder (e.g., `var_accounts_tmout: 900`)
- `limit` -- target hosts from the remediation scope selection (maps to Ansible `--limit`)

The remediation JT must have `ask_tags_on_launch: true`, `ask_variables_on_launch: true`, and `ask_inventory_on_launch: true`.

The gap between assess and remediate is the **decision point** where intelligence lives:
- **Human-supervised:** User reviews findings in the portal, builds a remediation, launches it
- **EDA-automated:** EDA rulebook evaluates findings and conditionally launches remediation based on policy
- **Future autonomous:** AI agent evaluates findings and decides remediation scope

## Consequences

- **Positive:** Assessment scans are read-only by design -- they never modify hosts.
- **Positive:** AAP Controller applies `--tags` at the CLI level natively -- no wrapper playbook needed.
- **Positive:** The decision point between assess and remediate is preserved for all operating modes.
- **Positive:** We do not author remediation playbooks -- CaC's 55K-line playbook is the remediation engine.
- **Negative:** Rule IDs must match CaC tag names exactly. The `normalize_xccdf` module strips the XCCDF prefix (`xccdf_org.ssgproject.content_rule_`) to align with CaC tags.
- **Negative:** Workflow-level `job_tags` do not propagate to child JTs in AAP Controller, which is why remediation must be a direct JT launch (not a workflow node).
