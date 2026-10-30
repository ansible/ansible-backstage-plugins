---
title: "ADR-006: Self-Contained Compliance Profiles"
description: "When adding a new compliance profile (e"
type: adr
status: accepted
date: 2026-05-26
product: "AAP Compliance Dashboard"
---
# ADR-006: Self-Contained Compliance Profiles

**Status:** Accepted
**Date:** 2026-05-26
**Deciders:** M. Ferrari, architect review

## Context

When adding a new compliance profile (e.g., CIS Benchmark, PCI-DSS), should the plugin enrich findings with metadata from a local database, or should all metadata come from the scanner pipeline?

Two approaches:

1. **Plugin enrichment:** The normalizer outputs only rule_id + status. The plugin looks up title, description, check_text, fix_text from a bundled rules database. Requires plugin redeployment for new profiles.
2. **Self-contained profiles:** The normalizer populates all metadata fields. Adding a new profile to Controller (Git project + JT) makes it work end-to-end without repackaging the plugin.

## Decision

**The plugin does not enrich findings.** It displays exactly what it receives via the CFF pipeline. All metadata -- descriptions, check/fix text, parameter definitions -- must be populated by the findings source:

- **Tier 1 (OpenSCAP + normalizer):** The `normalize_xccdf` module extracts all rule metadata directly from the XCCDF datastream. No external rules YAML needed.
- **Tier 2 (external scanner + normalizer):** The normalizer must map scanner output to CFF AND populate all metadata fields. For metadata the scanner does not provide, the normalizer can read from a supplementary rules YAML or mapping file included in the collection.

This keeps compliance profiles self-contained: adding a new profile to Controller (Git project + workflow + JTs) makes it work end-to-end without repackaging or redeploying the plugin.

## Consequences

- **Positive:** Zero plugin redeployment for new compliance profiles -- pure Controller-side change.
- **Positive:** Each compliance profile collection is independently testable and versionable.
- **Positive:** Eliminates coupling between plugin release cycle and content release cycle.
- **Negative:** Every normalizer bears the burden of populating all CFF metadata fields. Tier 2 normalizers may need supplementary mapping files.
- **Negative:** Slim findings (ADR-005) strip metadata for event transport, so the dashboard may show less detail until the direct POST channel (ADR-007) is implemented.

## Amendment (2026-06-06)

The self-containment principle has been further strengthened: the plugin's YAML fallback path for rule metadata (which loaded metadata from bundled `profiles/*/rules/*.yml` files) has been removed entirely (ADR-019). The DB `compliance_rule_metadata` table, populated during findings ingest, is now the sole runtime cache. This eliminates the last coupling between the plugin's runtime behavior and the content files shipped in the collection -- the plugin truly displays only what it receives via the CFF pipeline.
