---
title: "ADR-033: File-Streamed API Ingestion"
description: "ADR-030 mandates per-host normalization to prevent OOM during the normalize step"
type: adr
status: accepted
date: 2026-06-26
product: "AAP Compliance Dashboard"
---
# ADR-033: File-Streamed API Ingestion

**Status:** Accepted  
**Date:** 2026-06-26  
**Deciders:** Massimo Ferrari  

## Context

ADR-030 mandates per-host normalization to prevent OOM during the normalize step. However, the POST step that sends findings to the Backstage compliance API still loaded findings into Ansible's Jinja2 variable space:

```yaml
# BEFORE (OOM-prone)
- name: POST findings per-host
  ansible.builtin.uri:
    body:
      findings: "{{ (lookup('file', item.path) | from_json).findings }}"
```

`lookup('file', ...)` reads the entire JSON file as a string into Jinja2. `from_json` parses it into a Python dict. `body_format: json` re-serializes it for the HTTP request. The data exists in memory at least three times simultaneously.

Compounding factor: the normalizer module returned `findings=all_findings` in `exit_json`. Since the normalize task uses `register: _normalized`, Ansible accumulated every loop iteration's full findings list in `_normalized.results` for the remainder of Play 2. For supply chain scans with 500-800 CVEs per host across 15 hosts, this exhausted the EE container's memory before the POST task even began.

On 2026-06-25, Job 4011 failed at "POST findings per-host" with `ERROR! A worker was found in a dead state` — the Ansible worker process was killed by the OOM killer. All preceding steps (SBOM collection, Grype scan, normalization, ORAS push, artifact registration) succeeded.

## Decision

### 1. Normalizer modules compose the POST body on disk

Normalizer modules accept optional parameters to compose the complete API request body as a file alongside the findings output:

```python
ARGUMENT_SPEC = {
    # ... existing params ...
    'compose_post_body': {'type': 'bool', 'default': False},
    'scan_id': {'type': 'str', 'default': ''},
    'ingest_token': {'type': 'str', 'default': '', 'no_log': True},
    'finalize': {'type': 'bool', 'default': False},
}
```

When `compose_post_body` is true and `scan_id` is provided, the module writes a second file at `<output_file>.post.json`:

```json
{
  "scanId": "scan-123",
  "ingestToken": "<token>",
  "findings": [...],
  "finalize": true
}
```

This composition happens inside the Python module where findings are already in memory for the output file write. Zero additional memory cost. The `ingest_token` parameter is marked `no_log: True` per Ansible resource module conventions.

### 2. Normalizer modules return slim metadata, not findings

`exit_json` returns counts and file paths only:

```python
module.exit_json(
    changed=not module.check_mode,
    hosts_processed=hosts_processed,
    total_findings=len(all_findings),
    total_packages=total_packages,
    total_vulnerabilities=len(unique_cves),
    summary=summary,
    output_file=output_file,
    post_file=post_file,  # only when compose_post_body is true
)
```

No `findings` list in the return value. This prevents Ansible from accumulating findings across loop iterations in `_normalized.results`.

### 3. Playbooks use `uri` with `src` to stream POST bodies

```yaml
- name: POST findings per-host to Portal compliance API
  ansible.builtin.uri:
    url: "{{ backstage_api_url }}/api/compliance/findings/ingest"
    method: POST
    src: "{{ item.path }}"
    headers:
      Content-Type: application/json
    status_code: [201]
  loop: "{{ _post_body_files.files | sort(attribute='path') }}"
  no_log: true
```

The `src` parameter sends the file as the HTTP body directly. No `lookup()`, no `from_json`, no findings data in Jinja2 variable space.

### 4. Playbooks clear accumulated scan data before POST

```yaml
- name: Clear accumulated scan data from memory
  ansible.builtin.set_fact:
    _grype_results: null
    _grype_result_files: null
```

Inserted after the normalize loop and before the POST section to release registered variable references for GC.

## Pattern

Complete per-host normalize-and-POST flow:

```yaml
# Normalize per-host with POST body composition
- name: Normalize results to CFF (per-host)
  <namespace>.<collection>.normalize_<format>:
    <input_param>:
      - "{{ item.path }}"
    output_file: "{{ results_dir }}/findings-{{ _hostname }}.json"
    compose_post_body: "{{ (backstage_api_url | default('')) | length > 0 }}"
    scan_id: "{{ scan_id | default('') }}"
    ingest_token: "{{ ingest_token | default('') }}"
    finalize: "{{ ansible_loop.last | default(false) }}"
  loop: "{{ _result_files.files }}"
  loop_control:
    extended: true
  register: _normalized

# Free memory before POST
- name: Clear accumulated scan data from memory
  ansible.builtin.set_fact:
    _scan_results: null

# Find and POST composed body files
- name: Find per-host POST body files
  ansible.builtin.find:
    paths: "{{ results_dir }}"
    patterns: "*.post.json"
  register: _post_body_files

- name: POST findings per-host to Portal compliance API
  ansible.builtin.uri:
    url: "{{ backstage_api_url }}/api/compliance/findings/ingest"
    method: POST
    src: "{{ item.path }}"
    headers:
      Content-Type: application/json
    status_code: [201]
    validate_certs: false
    timeout: 120
  loop: "{{ _post_body_files.files | sort(attribute='path') }}"
  no_log: true
  failed_when: false
```

## Consequences

- Supply chain normalizer (`normalize_cyclonedx`) updated first. XCCDF normalizer retrofit planned as a follow-up.
- No backend changes needed — `express.json()` middleware parses the body identically whether sent via `body_format: json` or `src`.
- The `finalize` flag on the last POST triggers scan completion, posture snapshot, and finding state computation. Sort by path ensures deterministic ordering.
- EE rebuild required for supply chain profile since playbook is baked into the collection.

## Amendment: NDJSON Default Format (2026-06-26)

The `compose_post_body` pattern now defaults to NDJSON format via the `post_body_format` parameter (default: 'ndjson'). The normalizer writes a `.ndjson` file with a preamble line followed by one finding per line. The JSON `.post.json` format remains available as `post_body_format: 'json'` for backward compatibility. See ADR-034 for the NDJSON specification.

The XCCDF normalizer (`normalize_common.py`) has been retrofitted with compose_post_body support, bringing all 4 profiles to the same pattern. exit_json no longer returns slim_findings -- only counts and file paths.

## Related

- ADR-007: Direct POST Findings
- ADR-010: Per-Scan Ingest Token
- ADR-029: CycloneDX Normalizer Pattern
- ADR-030: Per-Host Normalization for All Scanner Profiles
- ADR-032: Pluggable Export Formats
- ADR-034: NDJSON Content-Type Negotiation
