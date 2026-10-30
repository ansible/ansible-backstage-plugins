---
title: "ADR-034: NDJSON Content-Type Negotiation"
description: "Supply chain scans produce 40,000+ findings per host (CVE matches against every installed package)"
type: adr
status: accepted
date: 2026-06-26
product: "AAP Compliance Dashboard"
---
# ADR-034: NDJSON Content-Type Negotiation

**Status:** Accepted  
**Date:** 2026-06-26  
**Deciders:** Massimo Ferrari  

## Context

Supply chain scans produce 40,000+ findings per host (CVE matches against every installed package). A single host's POST body can reach 72MB of JSON. With `express.json()` middleware, the entire request body is buffered into memory before parsing begins. At scale -- 15 hosts with 40K findings each -- the backend's V8 heap experiences significant GC pressure, with peak memory during ingest reaching hundreds of megabytes per concurrent request.

ADR-033 solved the normalizer-side OOM by composing the POST body on disk and streaming it via `uri src`, but the backend still receives and parses the full JSON body in one shot. The `express.json()` middleware deserializes the entire `findings[]` array into a JavaScript object before the route handler executes. For a 72MB body, this means:

1. Raw body buffered as a string (~72MB)
2. `JSON.parse()` produces a JavaScript object (~72MB, often more due to V8 object overhead)
3. The route handler iterates findings to build insert batches (~72MB again for the batch array)

Peak memory for a single request: ~216MB. With concurrent requests from multiple hosts completing simultaneously, this exceeds typical container memory limits.

## Decision

### Content-Type Negotiation on `/findings/ingest`

The existing `/findings/ingest` endpoint now accepts two content types:

- **`application/json`** -- existing path, unchanged. `express.json()` parses the full body. Backward compatible with all existing playbooks.
- **`application/x-ndjson`** -- new streaming path. A readline parser processes the body line-by-line, inserting findings in batches of 500.

The endpoint inspects the `Content-Type` header to select the parsing path. No new routes are added.

### NDJSON Wire Format

The NDJSON body consists of a preamble line followed by one finding per line, each as compact JSON:

```
{"_meta":true,"scanId":"scan-abc-123","ingestToken":"tok_xyz","finalize":false}
{"rule_id":"CVE-2024-1234","title":"curl: buffer overflow","status":"fail","severity":"high",...}
{"rule_id":"CVE-2024-5678","title":"openssl: timing attack","status":"fail","severity":"medium",...}
...
```

**Preamble line (required first):** Contains `_meta: true` plus `scanId`, `ingestToken`, and `finalize`. The preamble is validated before consuming any finding lines -- if the scan does not exist or the token does not match, the connection is closed immediately with a 401/404 response.

**Finding lines:** Each subsequent line is a single CFF finding object serialized as compact JSON (no pretty-printing, no embedded newlines). Findings are accumulated into batches of 500 and inserted into the database via `knex.batchInsert()`.

**Last line:** The `finalize` flag in the preamble controls whether scan completion triggers after all findings are ingested. When `finalize: true`, the backend runs posture snapshot computation and finding state transitions after the last finding is inserted.

### Authentication Flow

```
Client sends Content-Type: application/x-ndjson
  |
  v
Backend reads first line (preamble)
  |
  v
Validate: scan exists? token matches?
  |-- No --> 401/404, close connection
  |-- Yes --> continue consuming lines
  v
For each line: parse JSON, add to batch
  |-- Batch full (500) --> INSERT batch, clear
  v
End of stream --> INSERT remaining batch
  |-- finalize? --> trigger scan completion
  v
201 Created
```

Auth validation happens before any findings are consumed. This prevents an unauthenticated client from forcing the backend to parse and discard a 72MB stream.

### Back-Pressure

The readline parser uses `for await (const line of rl)`, which inherits Node.js stream back-pressure semantics. When a `knex.batchInsert()` is in progress, the `await` pauses consumption of the readline iterator, which in turn pauses reads from the incoming TCP socket. This prevents the backend from buffering the entire stream in memory while waiting for the database.

Peak memory during NDJSON ingest: ~500KB (one batch of 500 findings plus readline buffer), compared to ~216MB for the JSON path with a 72MB body.

### Normalizer Integration

Both the CycloneDX normalizer (`normalize_cyclonedx.py`) and the XCCDF normalizer (`normalize_common.py`) accept a `post_body_format` parameter:

```python
ARGUMENT_SPEC = {
    # ... existing params ...
    'compose_post_body': {'type': 'bool', 'default': False},
    'scan_id': {'type': 'str', 'default': ''},
    'ingest_token': {'type': 'str', 'default': '', 'no_log': True},
    'finalize': {'type': 'bool', 'default': False},
    'post_body_format': {'type': 'str', 'default': 'ndjson', 'choices': ['json', 'ndjson']},
}
```

When `post_body_format: 'ndjson'` (the default), the normalizer writes a `.ndjson` file:

```
{"_meta":true,"scanId":"scan-123","ingestToken":"<token>","finalize":true}
{"rule_id":"CVE-2024-1234","title":"curl: buffer overflow",...}
{"rule_id":"CVE-2024-5678","title":"openssl: timing attack",...}
```

When `post_body_format: 'json'`, the normalizer writes the legacy `.post.json` format for backward compatibility.

### XCCDF Normalizer Retrofit

The shared XCCDF normalizer (`normalize_common.py`) has been retrofitted with full `compose_post_body` support, matching the CycloneDX normalizer's pattern from ADR-033. New parameters:

- `compose_post_body` -- enables on-disk POST body composition
- `scan_id` -- scan identifier for the preamble
- `ingest_token` -- per-scan security token (marked `no_log: True`)
- `finalize` -- whether this is the last POST for the scan
- `post_body_format` -- `'ndjson'` (default) or `'json'`

`exit_json` has been slimmed to return only counts and file paths -- no `findings` list in the return value. This aligns the XCCDF normalizer with the CycloneDX normalizer's pattern and prevents Ansible from accumulating findings in `_normalized.results` across loop iterations.

### Playbook Pattern

All profiles now use the same NDJSON playbook pattern:

```yaml
# Normalize per-host with NDJSON POST body composition
- name: Normalize results to CFF (per-host)
  <namespace>.<collection>.normalize_<format>:
    <input_param>:
      - "{{ item.path }}"
    output_file: "{{ results_dir }}/findings-{{ _hostname }}.json"
    compose_post_body: "{{ (backstage_api_url | default('')) | length > 0 }}"
    scan_id: "{{ scan_id | default('') }}"
    ingest_token: "{{ ingest_token | default('') }}"
    finalize: "{{ ansible_loop.last | default(false) }}"
    post_body_format: ndjson
  loop: "{{ _result_files.files }}"
  loop_control:
    extended: true
  register: _normalized

# Free memory before POST
- name: Clear accumulated scan data from memory
  ansible.builtin.set_fact:
    _scan_results: null

# Find and POST composed NDJSON body files
- name: Find per-host POST body files
  ansible.builtin.find:
    paths: "{{ results_dir }}"
    patterns: "*.ndjson"
  register: _post_body_files

- name: POST findings per-host to Portal compliance API (NDJSON)
  ansible.builtin.uri:
    url: "{{ backstage_api_url }}/api/compliance/findings/ingest"
    method: POST
    src: "{{ item.path }}"
    headers:
      Content-Type: application/x-ndjson
    status_code: [201]
    validate_certs: false
    timeout: 120
  loop: "{{ _post_body_files.files | sort(attribute='path') }}"
  no_log: true
  failed_when: false
  register: _post_results

- name: Assert at least one POST succeeded
  ansible.builtin.fail:
    msg: "All NDJSON POSTs failed -- check backstage_api_url and ingest_token"
  when: _post_results.results | selectattr('status', 'defined') | selectattr('status', 'equalto', 201) | list | length == 0
```

## Consequences

- **All four profiles default to NDJSON.** The `post_body_format` parameter defaults to `'ndjson'`, so all profiles that enable `compose_post_body` will produce NDJSON files unless explicitly set to `'json'`.
- **EE rebuild required.** Both XCCDF and CycloneDX normalizers have changed. All profile EEs must be rebuilt to pick up the updated normalizer modules.
- **Backward compatibility preserved.** The JSON path on the `/findings/ingest` endpoint is unchanged. Old playbooks that POST `application/json` without the `compose_post_body` pattern continue to work. Playbooks using `post_body_format: 'json'` produce the same `.post.json` files as before.
- **Peak memory reduced from ~216MB to ~500KB per ingest request** for NDJSON consumers. JSON consumers are unaffected.
- **Assertion task added to playbooks.** A `fail` task after the POST loop ensures at least one POST succeeded. This catches misconfigured `backstage_api_url` or expired `ingest_token` values that would silently produce zero ingested findings.

## Related

- ADR-007: Direct POST Findings
- ADR-010: Per-Scan Ingest Token
- ADR-030: Per-Host Normalization for All Scanner Profiles
- ADR-033: File-Streamed API Ingestion
