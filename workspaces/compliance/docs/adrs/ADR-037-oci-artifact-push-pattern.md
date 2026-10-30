---
title: "ADR-037: OCI Artifact Push Pattern and PAH Integration"
description: "ADR-032 established the two-layer export system — CFF-derived client-side exports and OCI artifact passthrough via PAH"
type: adr
status: accepted
date: 2026-06-30
product: "AAP Compliance Dashboard"
amends: ADR-032
---
# ADR-037: OCI Artifact Push Pattern and PAH Integration

**Status:** Accepted  
**Date:** 2026-06-30  
**Deciders:** Massimo Ferrari  
**Amends:** ADR-032  

## Context

ADR-032 established the two-layer export system — CFF-derived client-side exports and OCI artifact passthrough via PAH. The initial implementation had three bugs that went undetected because errors were silently swallowed at every layer:

1. **oras 1.2.2 path validation:** ORAS rejects absolute file paths by default (security feature added in v1.1). The playbook passed absolute paths from `fetch_dest_dir`, causing every `oras push` to fail silently.
2. **Unconditional artifact registration:** The playbook registered artifact pointers in the plugin DB regardless of whether the push succeeded, creating orphaned OCI references.
3. **Missing AAP token on artifact endpoints:** The `getArtifacts` and `downloadArtifact` client methods did not pass the `x-aap-token` header, causing 401 errors that were silently swallowed.

All three bugs were masked by `failed_when: false` in the playbook and `.catch(() => [])` in the frontend. The SBOM download feature appeared to work (the Export menu rendered, artifact records existed) but every download returned 502.

## Decision

### 1. ORAS push requires `--disable-path-validation`

Ansible's `fetch` module writes files to absolute paths on the execution node. ORAS 1.2.2+ rejects these by default. All `oras push` commands in playbooks **must** include `--disable-path-validation`.

This is safe because the paths are controlled by the playbook (not user input) and the execution environment is ephemeral.

### 2. Push-before-register: gate registration on push success

Artifact registration in the plugin DB must only happen for successfully pushed artifacts. The playbook pattern is:

```yaml
- name: Push artifacts to PAH
  ansible.builtin.command:
    cmd: >-
      oras push {{ pah_registry }}/compliance-artifacts/{{ scan_id }}:{{ artifact_tag }}
      {{ file_path }}:{{ mime_type }}
      --insecure --disable-path-validation
      --username {{ pah_username }} --password {{ pah_password }}
  register: _push_results
  no_log: true
  failed_when: false
  loop: "{{ artifact_files }}"
  loop_control:
    index_var: _idx

- name: Report push failures
  ansible.builtin.debug:
    msg: "Push failed for {{ item.item | basename }} (rc={{ item.rc }})"
  loop: "{{ _push_results.results | default([]) }}"
  when: item.rc | default(0) != 0

- name: Register artifacts in plugin
  ansible.builtin.uri:
    url: "{{ backstage_api_url }}/api/compliance/scans/{{ scan_id }}/artifacts"
    method: POST
    body_format: json
    body:
      artifactKey: "{{ artifact_key }}"
      ociReference: "{{ oci_ref }}"
      artifactName: "{{ artifact_name }}"
      mimeType: "{{ mime_type }}"
      ingestToken: "{{ ingest_token }}"
  loop: "{{ artifact_files }}"
  loop_control:
    index_var: _idx
  when: _push_results.results[_idx].rc | default(1) == 0
```

The `index_var` correlation works because both loops iterate the same list. Skipped push items (from `when:` conditions) appear in `.results` with no `rc` field — `default(1)` treats them as failures.

### 3. Artifact GET endpoints require Portal httpAuth

The backend artifact list and download endpoints use Portal's `httpAuth.credentials()` to verify the caller has a valid session. POST (artifact registration from playbooks) remains unauthenticated, secured by per-scan ingest tokens (ADR-010). The `/scans` prefix is marked `allow: 'unauthenticated'` at the Backstage layer for POST access; GET handlers enforce auth explicitly via `requireUserAuth()`.

### 4. Error surfacing over silent fallbacks

Frontend components must surface artifact errors to the user via `alertApi`, not silently fall back to empty state. The ExportButton now shows:
- "Failed to load export artifacts: ..." on fetch errors
- "Failed to download {filename}: ..." on download errors

Backend download errors return a generic message to the client; the registry error detail is logged server-side only (no infrastructure leakage).

### 5. PAH OCI reference convention

All compliance artifacts use the repository pattern:

```
{pah_registry}/compliance-artifacts/{scan_id}:{artifact_tag}
```

Where:
- `pah_registry`: PAH hostname (e.g., `aap-netrunner.demoredhat.com`)
- `scan_id`: UUID from the compliance scan record
- `artifact_tag`: Artifact key (e.g., `sbom-nm-prod01`)

This creates one OCI repository per scan with one tag per artifact. PAH's garbage collection manages retention.

### 6. EE must include oras and CI must verify

The supply chain EE definition (`execution-environment.yml`) installs ORAS. The CI verify step must confirm `oras version` succeeds. If oras is missing from the EE, pushes fail silently and the scan appears to complete normally.

## Consequences

- New profiles that store artifacts in PAH can copy the push-before-register pattern.
- Silent failures are eliminated — errors surface in the UI and in Controller job events.
- The `--disable-path-validation` flag is required for any ORAS push from an Ansible playbook context.
- The OCI reference convention is standardized for all compliance artifact types.

## Related

- ADR-032: Pluggable Export Formats (parent decision)
- ADR-031: PAH for Execution Environments
- ADR-033: File-Streamed API Ingestion
