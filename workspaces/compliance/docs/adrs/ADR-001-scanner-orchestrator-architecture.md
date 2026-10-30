---
title: "ADR-001: Scanner Orchestrator Architecture (CFF as Contract)"
description: "The compliance plugin needs to support multiple scanner backends (OpenSCAP, PowerSTIG, Qualys, Tenable, Insights, CIS-CA"
type: adr
status: accepted
date: 2026-04-23
product: "AAP Compliance Dashboard"
---
# ADR-001: Scanner Orchestrator Architecture (CFF as Contract)

**Status:** Accepted
**Date:** 2026-04-23 (formalized 2026-05-26)
**Deciders:** M. Ferrari, architect review

## Context

The compliance plugin needs to support multiple scanner backends (OpenSCAP, PowerSTIG, Qualys, Tenable, Insights, CIS-CAT) across multiple platforms (RHEL, Windows, network devices). Building scanner-specific rendering logic in the Backstage plugin would create tight coupling and require plugin redeployment for every new scanner.

Puppet SCE and Chef Compliance both embed their scanners directly, tying their compliance offerings to a single scanning engine. This limits extensibility and locks customers into one vendor's scanner.

## Decision

The compliance dashboard is a **scanner orchestrator, not a scanner**. Our value is the UX, orchestration, and remediation profile builder. The dashboard never knows which scanner produced the findings — it consumes a **Common Findings Format (CFF)** JSON document regardless of the underlying scanner.

Three scanner tiers:

| Tier | Model | What We Ship | What the Customer Provides |
|------|-------|-------------|---------------------------|
| **Tier 1** | Fully shippable | Scanner, content, normalizer, remediation, pipeline, EE | Nothing |
| **Tier 2** | BYOS | Adapter, normalizer, remediation, pipeline | Scanner deployment, credentials, licenses |
| **Tier 3** | Hybrid | Multi-domain adapters + per-platform normalizers | Same as Tier 2 |

Every scanner normalizer must produce CFF v1.0.0 JSON. The CFF is the single integration surface between the Ansible collection layer and the dashboard plugin layer.

## Consequences

- **Positive:** Adding a new scanner requires only a new collection with a normalizer module -- no plugin redeployment. Scanner swap takes approximately 1 hour with no code changes.
- **Positive:** Multiple scanners can coexist for the same framework/platform (e.g., OpenSCAP daily + Tenable monthly).
- **Positive:** Remediation roles are scanner-agnostic -- the same role fixes the finding regardless of which scanner discovered it.
- **Negative:** Every normalizer must populate all CFF metadata fields (title, description, check_text, fix_text, severity, parameters). The plugin does not enrich findings -- it displays exactly what it receives.
- **Negative:** CFF schema changes require coordinated updates across all normalizers.

## Open: `remediation.available` (P3)

The CFF schema defines a `remediation.available` boolean on each finding (see the `remediation` object in the finding schema). As of 2026-06-16, normalizers do not populate this field. The plugin's `FindingsParser.ts` uses a heuristic (`- name:` prefix in `fix_text`) to detect whether Ansible remediation task YAML is present, which implicitly determines `automationAvailable`. For Tier 2 readiness, normalizers should populate `remediation.available` explicitly so the plugin does not rely on heuristics. Tracked as P3 backlog.
