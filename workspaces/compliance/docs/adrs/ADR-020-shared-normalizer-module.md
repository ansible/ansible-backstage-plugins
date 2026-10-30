---
title: "ADR-020: Shared Normalizer Module via module_utils Pattern"
description: "The `normalize_xccdf` Ansible module is the core of the scan normalization pipeline (ADR-004)"
type: adr
status: accepted
date: 2026-06-06
product: "AAP Compliance Dashboard"
---
# ADR-020: Shared Normalizer Module via module_utils Pattern

**Status:** Accepted (implemented 2026-06-06, updated 2026-06-16)  
**Date:** 2026-06-06  
**Deciders:** Massimo Ferrari  

## Context

The `normalize_xccdf` Ansible module is the core of the scan normalization pipeline (ADR-004). It parses XCCDF result XML, extracts rule metadata from the datastream, maps results to CFF format, and optionally enriches findings with AAP impact classification from a rules metadata YAML file.

Three compliance profile collections ship this module:

| Collection | Path |
|-----------|------|
| `security.compliance_rhel9_stig` | `profiles/rhel9-stig/ansible_collections/.../plugins/modules/normalize_xccdf.py` |
| `security.compliance_rhel9_cis_l1` | `profiles/rhel9-cis-l1/ansible_collections/.../plugins/modules/normalize_xccdf.py` |
| `security.compliance_rhel9_cis_l2` | `profiles/rhel9-cis-l2/ansible_collections/.../plugins/modules/normalize_xccdf.py` |

Prior to this decision, each collection had its own full copy of the normalization logic (~320 lines). When a bug fix or feature was added (e.g., the `aap_impact` field extraction, the `disruption` level detection, or the `SKIP_STATUSES` refinement), it had to be manually replicated across all three copies. Drift between copies caused subtle differences:

- The CIS L1 copy was missing the `aap_impact_reason` field extraction.
- The STIG copy had a newer severity mapping that the CIS copies lacked.
- Fix text extraction logic differed (one copy checked `<fixtext>`, others checked `<fix>`).

This is a standard DRY violation. Ansible's `module_utils` pattern exists specifically for this case -- shared library code imported by multiple modules within or across collections.

## Decision

Extract all shared normalization logic into a single source-of-truth file at `profiles/_shared/normalize_common.py`. Each collection's `normalize_xccdf.py` becomes a thin wrapper that imports from `plugins/module_utils/normalize_common.py` (a synced copy of the shared source).

### File structure

```
profiles/
  _shared/
    normalize_common.py          <-- single source of truth
  rhel9-stig/
    ansible_collections/security/compliance_rhel9_stig/
      plugins/
        modules/
          normalize_xccdf.py     <-- thin wrapper: imports from module_utils
        module_utils/
          normalize_common.py    <-- synced copy
  rhel9-cis-l1/
    ansible_collections/security/compliance_rhel9_cis_l1/
      plugins/
        modules/
          normalize_xccdf.py     <-- thin wrapper: imports from module_utils
        module_utils/
          normalize_common.py    <-- synced copy
  rhel9-cis-l2/
    (same pattern)
```

### Sync mechanism

A script (`scripts/sync_shared_modules.py`) copies `profiles/_shared/normalize_common.py` to each collection's `plugins/module_utils/` directory. The shared file includes a docstring header warning against editing the copies directly:

```
Do NOT edit the copies in individual collections -- edit this file and
run: python scripts/sync_shared_modules.py
```

### What lives in the shared module

- `SEVERITY_MAP` and `STATUS_MAP` constants
- `SKIP_STATUSES` set (notapplicable, notselected, notchecked)
- `load_rules_metadata_map(filepath)` -- load AAP impact metadata AND `fix_text` (CaC Ansible task YAML) from a rules YAML file. Renamed from `load_aap_impact_map()` on 2026-06-16 to reflect its expanded scope: the function now reads `fix_text` from rules YAML files and merges it into findings at scan time, replacing XCCDF prose fix descriptions with actual Ansible remediation task YAML. This fixes `automationAvailable` detection in `FindingsParser.ts` (the `- name:` heuristic that identifies Ansible task content).
- `extract_host_from_filename(filepath)` -- extract hostname from XCCDF result filename
- `find_ns(root)` -- detect XCCDF namespace version
- `parse_xccdf_results(filepath, framework)` -- full XCCDF parsing including metadata extraction
- `run_normalize(module)` -- main entry point called by the collection wrapper
- `ARGUMENT_SPEC` -- shared argument spec for all `normalize_xccdf` modules

### What lives in the thin wrapper

Only the Ansible module boilerplate and the import:

```python
from ansible.module_utils.normalize_common import run_normalize, ARGUMENT_SPEC
from ansible.module_utils.basic import AnsibleModule

def main():
    module = AnsibleModule(argument_spec=ARGUMENT_SPEC, supports_check_mode=True)
    run_normalize(module)

if __name__ == '__main__':
    main()
```

### Why copy-sync instead of a shared collection dependency

Ansible collections can depend on other collections via `meta/runtime.yml`, but `module_utils` imports across collections require a fully-qualified import path (`ansible_collections.namespace.collection.plugins.module_utils.module`). This works but:

1. Adds a collection dependency that must be installed in the EE
2. Creates a versioning coupling between the shared collection and each profile collection
3. Requires a separate collection release cycle for a utility module

Copy-sync is simpler: the synced file is embedded in each collection, so each collection remains self-contained (ADR-006). The sync script is a development tool, not a runtime dependency.

## Consequences

- **Single source of truth.** Bug fixes and features (e.g., `aap_impact` extraction) are authored once in `profiles/_shared/normalize_common.py` and synced to all collections.
- **No drift.** The sync script ensures all copies are identical. CI can validate parity.
- **Self-contained collections preserved.** Each collection bundles its own copy of `normalize_common.py` via `module_utils`, so it remains deployable independently (ADR-006).
- **Developer discipline required.** Developers must run the sync script after editing the shared source. Forgetting to sync will cause drift. Mitigated by: (a) the docstring warning in the shared file, (b) CI parity check (planned), (c) the deploy script's migration parity check pattern can be extended to cover this.
- **No runtime overhead.** The `module_utils` import is standard Ansible -- no reflection, no dynamic loading.

## Related

- ADR-004: OpenSCAP replaces custom evaluate module (the normalizer being shared)
- ADR-006: Self-contained compliance profiles (collections remain self-contained)
- ADR-007: Direct POST findings (normalize output is what gets POSTed)
