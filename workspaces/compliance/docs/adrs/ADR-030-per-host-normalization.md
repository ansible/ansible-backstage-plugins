---
title: "ADR-030: Per-Host Normalization for All Scanner Profiles"
description: "The compliance dashboard uses a two-play architecture (ADR-003): Play 1 collects scan data from target hosts, Play 2 nor"
type: adr
status: accepted
date: 2026-06-25
product: "AAP Compliance Dashboard"
---
# ADR-030: Per-Host Normalization for All Scanner Profiles

**Status:** Accepted  
**Date:** 2026-06-25  
**Deciders:** Massimo Ferrari  

## Context

The compliance dashboard uses a two-play architecture (ADR-003): Play 1 collects scan data from target hosts, Play 2 normalizes results on the execution node (localhost inside the EE container). Normalization converts scanner-specific output (XCCDF XML, CycloneDX JSON) into Common Findings Format (CFF) JSON.

The XCCDF profiles (STIG, CIS L1, CIS L2) normalize one host's results per loop iteration:

```yaml
- name: Evaluate compliance for each host
  security.compliance_rhel9_stig.normalize_xccdf:
    results_files:
      - "{{ item.path }}"
    output_file: "{{ fetch_dest_dir }}/findings-{{ _host_label }}.json"
  loop: "{{ _result_files.files }}"
```

The supply chain profile originally passed all Grype result files to the normalizer in a single call:

```yaml
- name: Normalize Grype results to CFF
  security.compliance_supply_chain.normalize_cyclonedx:
    grype_files: "{{ _grype_file_list }}"    # ALL files at once
    output_file: "{{ output_file }}"
```

On 2026-06-25, a supply chain scan across 15 hosts (Job 3987) caused the execution node to run out of memory during the single-call normalization step. The Controller instance rebooted. The job was marked as failed with: "Task was marked as running at system start up. The system must have not shut down properly."

Root cause: Grype JSON results are 5-20MB per host for a full-filesystem scan. Processing 15 files simultaneously loaded 75-300MB of JSON into Python dicts inside an EE container that shares resources with Controller, EDA, Hub, and PostgreSQL on a 15GB/no-swap instance.

## Decision

All normalizer playbooks MUST loop per-host, processing one result file per iteration. This is a mandatory pattern for any scanner profile, regardless of output format.

### Pattern

```yaml
# 1. Find result files (per-host filenames from Play 1 fetch)
- name: Find all result files
  ansible.builtin.find:
    paths: "{{ results_dir }}"
    patterns: "<scanner>-*.json"  # or *.xml for XCCDF
  register: _result_files

# 2. Normalize one host at a time
- name: Normalize results to CFF (per-host)
  <namespace>.<collection>.normalize_<format>:
    <input_param>:
      - "{{ item.path }}"              # Single file
    output_file: "{{ results_dir }}/findings-{{ _hostname }}.json"
  loop: "{{ _result_files.files }}"

# 3. Find composed POST body files (ADR-033)
- name: Find per-host POST body files
  ansible.builtin.find:
    paths: "{{ results_dir }}"
    patterns: "*.post.json"
  register: _post_body_files

# 4. Stream POST bodies to API — no findings in Ansible variable space
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

> **Note:** The normalizer's `compose_post_body` parameter writes the complete
> POST body (including scanId, ingestToken, finalize) to a `.post.json` file.
> The `uri` module's `src` parameter streams this file as the HTTP body without
> loading it into Jinja2 variable space. See ADR-033 for the full pattern.

### Benefits

1. **Memory safety.** Each iteration processes one host's results, then Python GCs. Peak memory is proportional to the largest single host, not the sum of all hosts.

2. **Controller event size limit.** Each `runner_on_ok` event contains one host's findings (~200-500 findings). The fallback event-based ingest path (ADR-005) stays under Controller's event truncation threshold.

3. **Progress visibility.** Controller shows per-host task events in the job log, making it clear which host is being processed and where failures occur.

4. **Consistent pattern.** All profiles (XCCDF and CycloneDX) use the same find→loop→normalize→find→loop→POST-per-host flow. New scanner profiles follow this template.

### Normalizer module compatibility

Normalizer modules (`normalize_xccdf`, `normalize_cyclonedx`) accept a list input (`results_files` / `grype_files`). Passing a single-element list works correctly — the internal loop processes one file and returns. No module changes are needed.

## Consequences

- New scanner profiles MUST follow the per-host loop pattern. The developer guide checklist (Section 11) is updated to include this requirement.
- Standalone `normalize.yml` playbooks are also updated to loop per-host for consistency.
- The POST step sends findings per-host (one POST per host's findings file). The last POST includes `finalize: true` to trigger scan completion, posture snapshot, and finding state computation. Intermediate POSTs only save findings.

## Related

- ADR-003: Single Assessment JT with 2 Plays
- ADR-005: Slim Findings for Event Storage
- ADR-020: Shared Normalizer Module
- ADR-029: CycloneDX Normalizer Pattern
- ADR-033: File-Streamed API Ingestion
