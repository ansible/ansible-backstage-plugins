---
title: "ADR-032: Pluggable Export Formats and OCI Artifact Storage"
description: "The compliance dashboard exports scan results in three hardcoded formats: CSV, JSON, and CKL (STIG Viewer)"
type: adr
status: accepted
date: 2026-06-26
product: "AAP Compliance Dashboard"
---
# ADR-032: Pluggable Export Formats and OCI Artifact Storage

**Status:** Accepted  
**Date:** 2026-06-26  
**Deciders:** Massimo Ferrari  

## Context

The compliance dashboard exports scan results in three hardcoded formats: CSV, JSON, and CKL (STIG Viewer). All three are generated client-side from Common Findings Format (CFF) data — they transform normalized findings into different output shapes.

Supply chain profiles (Syft/Grype) produce raw CycloneDX SBOMs during scanning. Users need these original SBOMs in native format for integration with vulnerability management tools (Dependency-Track, Grype CLI, CSAF pipelines). CFF is a lossy normalization — the original SBOM contains package metadata, dependency graphs, and supplier information that CFF does not preserve.

The hardcoded ExportButton cannot serve scanner-native artifacts. Adding per-framework `if` blocks violates the portable profile architecture (ADR-006, ADR-026).

Controller's `set_stats` artifact storage has a ~32KB limit for serialized JSON. CycloneDX SBOMs from a full-filesystem Syft scan are 5-20MB per host — two orders of magnitude over the limit.

## Decision

### Two-layer export system

Profiles declare their export formats in `compliance-profile.yml`. The ExportButton renders menu items data-driven from this declaration.

**Layer 1 — CFF-derived (client-side, existing):** CSV, JSON, CKL. Generated in the browser from CFF findings. No server round-trip. Backward compatible — profiles without `export_formats` get these by default.

**Layer 2 — OCI artifact passthrough (new, server-proxied):** Profiles declare scanner-native artifact exports. Raw files (SBOMs, reports) are stored as OCI artifacts in Private Automation Hub using ORAS. The plugin stores pointers (not data) and proxies downloads from PAH's container registry v2 API.

### Profile declaration

```yaml
# compliance-profile.yml
display:
  export_formats:
    - key: csv
      label: "Export as CSV"
      type: cff_derived
    - key: sbom-cyclonedx
      label: "Export SBOMs (CycloneDX)"
      type: artifact
      artifact_key: "sbom-*"
      mime_type: "application/vnd.cyclonedx+json"
      file_extension: ".cdx.json"
```

### Storage architecture

```
Playbook (EE)  ──oras push──►  PAH Registry  ◄──registry v2 API──  Plugin Backend  ──stream──►  Browser
                                                                         │
                                                                    compliance_scan_artifacts
                                                                    (pointer: oci_reference)
```

- **Push:** Playbook uses `oras push` to store SBOMs in PAH at `compliance-artifacts/<scanId>:sbom-<hostname>`. ORAS is installed in the EE.
- **Register:** Playbook POSTs a pointer record to `POST /scans/:scanId/artifacts` with the OCI reference.
- **Download:** Frontend calls `GET /scans/:scanId/artifacts/:key/download`. Backend resolves the OCI reference from the pointer table, fetches the manifest from PAH's registry v2 API, then streams the blob to the browser.
- **No data in plugin DB:** The `compliance_scan_artifacts` table stores only metadata (OCI reference, key, name, MIME type). Raw artifact content lives in PAH.

### Why PAH as artifact storage

1. PAH is the platform's built-in OCI registry — Controller already trusts it natively (ADR-031).
2. OCI registries are the standard artifact storage for supply chain tools (Sigstore, Cosign, ORAS, Notary).
3. No database bloat — SBOMs stay in the registry, plugin stores pointers.
4. Content-addressable storage with deduplication — shared base layers across scans.
5. Retention managed by PAH's existing lifecycle policies.

### Backward compatibility

Profiles without `export_formats` in their `displayConfig` fall back to `DEFAULT_FORMATS: [csv, json, ckl]`. Existing STIG/CIS profiles continue working without changes.

## Implementation

### New DB table

`compliance_scan_artifacts`: id, scan_id (FK CASCADE), artifact_key, oci_reference, artifact_name, mime_type, created_at. UNIQUE(scan_id, artifact_key).

### New backend endpoints

- `POST /scans/:scanId/artifacts` — register pointer (ingest-token protected)
- `GET /scans/:scanId/artifacts` — list artifacts for a scan
- `GET /scans/:scanId/artifacts/:key/download` — proxy download from PAH

### Frontend changes

ExportButton refactored to render from `profile.displayConfig.export_formats`. CFF-derived formats use existing client generators. Artifact formats call the download endpoint. A divider separates the two sections in the menu.

### EE changes

Supply chain EE adds ORAS CLI (v1.2.2, ~10MB binary).

## Consequences

- New scanner profiles can declare any artifact export format without frontend code changes.
- PAH becomes the artifact store for scan outputs, complementing its role as EE image registry (ADR-031).
- The ExportButton is no longer hardcoded — adding a new format is a profile metadata change.
- ORAS adds ~10MB to the supply chain EE image size.
- The download proxy depends on PAH availability — if PAH is down, artifact exports fail (findings exports still work, they're client-side).

## Related

- ADR-001: Scanner Orchestrator Architecture (CFF)
- ADR-006: Self-Contained Compliance Profiles
- ADR-026: Portable Display Configuration
- ADR-029: CycloneDX Normalizer Pattern
- ADR-031: PAH for Execution Environments
- ADR-033: File-Streamed API Ingestion (ORAS push runs alongside compose_post_body)
