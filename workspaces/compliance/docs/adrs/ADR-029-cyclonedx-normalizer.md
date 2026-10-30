---
title: "ADR-029: CycloneDX Normalizer Pattern"
description: "The existing normalizer pattern (ADR-020) parses XCCDF XML from OpenSCAP scans and converts to the Common Findings Forma"
type: adr
status: accepted
date: 2026-06-25
product: "AAP Compliance Dashboard"
---
# ADR-029: CycloneDX Normalizer Pattern

**Status:** Accepted  
**Date:** 2026-06-25  
**Deciders:** Massimo Ferrari  

## Context

The existing normalizer pattern (ADR-020) parses XCCDF XML from OpenSCAP scans and converts to the Common Findings Format (CFF). The normalizer is shared across all XCCDF-based profiles (DISA STIG, CIS L1, CIS L2) via `normalize_common.py` in `profiles/_shared/`.

Supply chain vulnerability scanning introduces a fundamentally different data model:

1. **Scanner output format:** Grype produces CycloneDX 1.4+ JSON, not XCCDF XML. CycloneDX is an SBOM (Software Bill of Materials) schema with embedded vulnerability disclosures.

2. **Rules are discovered at scan time.** XCCDF profiles declare a fixed set of rules upfront (200 for STIG, 200+ for CIS). Grype discovers vulnerabilities dynamically — a scan may find 0 CVEs or 800+ CVEs depending on installed packages. There is no pre-built datastream.

3. **Remediation is package management, not CaC.** XCCDF remediation is Ansible playbooks from scap-security-guide (CaC). Supply chain remediation is `dnf update`, `apt upgrade`, `pip install --upgrade`, etc. The CaC roles/playbooks pattern does not apply.

4. **Finding volume is higher.** A typical RHEL 9 server has 400-800 installed RPM packages. A Grype scan may report 50-200 CVEs (average), with spikes to 800+ on unmaintained systems. XCCDF scans produce 200-366 findings (fixed rule count).

5. **Severity mapping is different.** XCCDF uses CAT_I/II/III (DISA taxonomy). CycloneDX uses CVSS scores (0.0-10.0) and severity enums (Critical, High, Medium, Low, Negligible). Mapping rules differ from XCCDF's fixed severity assignments.

Attempting to reuse `normalize_common.py` (designed for XCCDF) would require:
- Parsing CycloneDX JSON instead of XCCDF XML (incompatible data structures)
- Mapping CVE metadata (purl, CVSS, fix state, affected versions) to CFF fields designed for STIG rules
- Generating `dnf update` remediation text instead of extracting CaC Ansible tasks
- Handling dynamic rule discovery instead of fixed rule sets

The only shared concern is the output contract (CFF schema) — but the input format, parsing logic, severity mapping, remediation generation, and metadata extraction are all different.

## Decision

The supply chain compliance profile ships its own normalizer (`normalize_cyclonedx.py`) that does NOT share code with the XCCDF normalizer (`normalize_common.py`). This establishes a pattern for scanner-specific normalizers: each scanner type has its own normalizer tailored to its output format and remediation model.

### 1. CycloneDX → CFF mapping

CFF was designed for XCCDF (rule-based compliance scanning). Grype produces vulnerability disclosures (CVE-based). The mapping:

| CycloneDX field | CFF field | Notes |
|----------------|-----------|-------|
| `vulnerability.id` (e.g., CVE-2024-1234) | `rule_id` | CVE ID becomes the rule identifier |
| `component.name` (e.g., openssl) | `stig_id` | Repurposed: package name instead of STIG ID |
| `vulnerability.ratings[0].severity` | `category` | Critical/High → CAT_I, Medium → CAT_II, Low/Negligible → CAT_III |
| `relatedVulnerability.id` + `vulnerability.description` | `description` | CVE description + affected versions |
| Always `fail` | `status` | A Grype match = vulnerability exists = failure |
| Generated per package type | `fix_text` | rpm → `dnf update openssl`, deb → `apt upgrade openssl`, pip → `pip install --upgrade openssl` |
| Package metadata (purl, CVSS, fix state) | `evidence` | JSON blob with fixedVersion, installedVersion, cvss_score, cvss_vector, fixState (fixed, wont-fix, not-fixed, unknown) |
| "Supply Chain" | `scanner` | Hard-coded |
| Derived from CVSS | `disruption` | Critical/High → high, Medium → medium, Low → low |
| Always "medium" | `aap_impact` | Default — package updates rarely require job refactoring |

### 2. No shared normalizer code

`normalize_cyclonedx.py` is self-contained in the supply chain collection under `profiles/supply-chain/.../plugins/modules/`. It does NOT import from `profiles/_shared/normalize_common.py`. The `sync_shared_modules.py` script should NOT sync to the supply chain profile.

Rationale:
- XCCDF and CycloneDX have incompatible data models. Shared code would require extensive conditional logic (`if input_format == 'xccdf': ... elif input_format == 'cyclonedx': ...`), obscuring the parsing logic.
- Severity mapping differs (fixed CAT assignments vs CVSS-based thresholds).
- Remediation generation differs (CaC Ansible tasks vs package manager commands).
- The only shared concern is the CFF output schema, which is enforced by the type definitions in `compliance-common/src/types/findings.ts` and validated at ingest time by the backend.

Future scanners (Trivy, Snyk, container image scanning) will follow the same pattern: one normalizer per scanner type, CFF schema as the contract.

### 3. CVE metadata in `evidence` field

The `evidence` field (free-form JSON blob) captures Grype-specific metadata:

```json
{
  "purl": "pkg:rpm/rhel/openssl@1.1.1k-7.el9_0?arch=x86_64&distro=rhel-9.0",
  "installed_version": "1.1.1k-7.el9_0",
  "fixed_version": "1.1.1k-9.el9_0",
  "cvss_score": 7.5,
  "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H",
  "fix_state": "fixed",
  "package_type": "rpm"
}
```

This enables drill-down UX to show:
- Which version is installed vs which version fixes the CVE
- CVSS score + vector (for severity justification)
- Fix state (vendor patched it vs wont-fix vs unknown)
- Package URL (purl) for cross-referencing with external SBOMs

### 4. Remediation text generation

The normalizer generates package manager commands based on `package_type`:

| Package type | Remediation command |
|-------------|-------------------|
| rpm (RPM-based distros) | `dnf update <package>` or `yum update <package>` |
| deb (Debian/Ubuntu) | `apt-get update && apt-get upgrade <package>` |
| apk (Alpine) | `apk upgrade <package>` |
| python (pip) | `pip install --upgrade <package>` |
| npm | `npm update <package>` |
| gem (RubyGems) | `gem update <package>` |
| go-module | Manual upgrade (no generic command) |
| java-archive | Manual upgrade (no generic command) |

If `fix_state` is `wont-fix` or `unknown`, the remediation text includes a warning:
```
No fix available from the vendor for CVE-2024-1234 in package openssl.
Consider: (1) Upgrade to a newer major version, (2) Apply vendor-specific workarounds,
or (3) Accept the risk with documented justification.
```

This follows the InsightVM pattern (remediation instructions generated per finding, not a single playbook).

### 5. CFF contract compliance

All CFF fields are populated to satisfy the schema contract:

| CFF field | Supply chain value |
|-----------|-------------------|
| `rule_id` | CVE-2024-1234 |
| `stig_id` | openssl (repurposed) |
| `category` | CAT_I/II/III (CVSS-derived) |
| `description` | CVE description + affected versions |
| `status` | fail (always) |
| `fix_text` | dnf update openssl |
| `check_text` | Check installed version: rpm -q openssl |
| `evidence` | JSON with purl, CVSS, fix state |
| `scanner` | Supply Chain |
| `disruption` | high/medium/low (CVSS-derived) |
| `aap_impact` | medium (default) |
| `parameters` | {} (not applicable) |

This ensures the dashboard can render supply chain findings using the same UI components as XCCDF findings (ResultsTable, FindingDetailDialog, RemediationPlanPreview).

### 6. Testing strategy

The normalizer includes 23 unit tests (matching the coverage of `test_normalize_common.py`):

- Basic CycloneDX parsing (valid/invalid JSON)
- CVE → rule_id mapping
- CVSS → CAT_I/II/III severity mapping
- Package type → remediation command generation
- Fix state handling (fixed, wont-fix, not-fixed, unknown)
- Missing fields (purl, CVSS, fixedVersion)
- Edge cases (zero vulnerabilities, 800+ vulnerabilities)
- Evidence JSON structure validation

Test file: `profiles/supply-chain/.../tests/unit/plugins/modules/test_normalize_cyclonedx.py`

### 7. Integration with assessment JT

The supply chain assessment JT follows the same two-play pattern as XCCDF profiles:

1. **Play 1 (run on target hosts):** Install Syft ephemerally, generate CycloneDX SBOM, fetch SBOM JSON to execution node. Targets do not need internet access or Grype.
2. **Play 2 (run on localhost):** Grype matches each SBOM against pre-cached CVE database. `normalize_cyclonedx` module parses Grype JSON, outputs CFF. `uri` module POSTs findings to `/findings/ingest`.

This reuses the ADR-007 ingest pattern (per-scan security token, direct HTTP POST from playbook).

## Alternatives Considered

1. **Extend `normalize_common.py` with CycloneDX support.** Rejected: incompatible data models, obscures XCCDF parsing logic with scanner-specific conditionals.

2. **Shared base class with scanner-specific subclasses.** Rejected: no meaningful shared logic beyond CFF output validation (which is enforced by the backend schema). Inheritance adds complexity without reuse benefit.

3. **Map CVE ID to `stig_id` and generate synthetic `rule_id`.** Rejected: `rule_id` is the primary key for findings aggregation. Using CVE ID directly simplifies drill-down and cross-referencing with external CVE databases.

4. **Store remediation as Ansible tasks calling package managers.** Rejected: supply chain remediation is imperative (`dnf update`), not declarative (Ansible roles). Wrapping package commands in Ansible tasks adds no value.

5. **Normalize at ingest time (backend) instead of in the playbook.** Rejected: violates ADR-007 (normalization is scanner-local, ingest is format-agnostic). Backend should not know about CycloneDX structure.

## Consequences

### Positive

- Establishes the pattern for non-XCCDF scanners. Trivy (container scanning), Snyk (dependency scanning), and custom scanners follow the same model: one normalizer per scanner, CFF as the contract.
- ADR-020 scope is clarified: `normalize_common.py` is XCCDF-only. It is not a "universal normalizer."
- Supply chain findings integrate seamlessly with the dashboard — same UI components, same drill-down patterns, same remediation lifecycle.
- CycloneDX SBOM metadata (purl, CVSS, fix state) is preserved in `evidence`, enabling future integrations (e.g., SBOM export, TPA cross-referencing per Lightwell Phase L2b).
- Package manager remediation commands are generated per finding, matching the InsightVM pattern (granular remediation instructions, not monolithic playbooks).

### Negative

- No shared code between XCCDF and CycloneDX normalizers. Fixes to CFF output formatting (e.g., escaping special characters in `description`) must be applied to both normalizers. Mitigation: CFF schema validation at ingest time catches formatting errors.
- Repurposing `stig_id` for package names is a semantic stretch. The field name no longer reflects its content for supply chain findings. Alternative considered: add a new `package_name` field to CFF. Rejected: CFF is the shared contract, adding scanner-specific fields breaks abstraction. Better to reuse existing fields with documented overloading.
- Package manager commands in `fix_text` are imperative, not idempotent. Running `dnf update openssl` twice may install different versions if a newer patch was published. This differs from CaC remediation (Ansible ensures desired state). Documented in the remediation instructions.

## Implementation Notes

Key files:
- **Normalizer:** `profiles/supply-chain/.../plugins/modules/normalize_cyclonedx.py` (~400 lines)
- **Tests:** `profiles/supply-chain/.../tests/unit/plugins/modules/test_normalize_cyclonedx.py` (23 tests)
- **Assessment playbook:** `profiles/supply-chain/.../playbooks/run_scan.yml` (two-play pattern: Syft on targets, Grype on localhost)
- **Sync script exclusion:** `scripts/sync_shared_modules.py` should skip `profiles/supply-chain/`

The normalizer is deployed as part of the supply chain EE (`compliance-rhel9-supply-chain`). It is NOT synced to other profiles.

## Related

- ADR-007: Direct POST Findings (normalizer POSTs findings directly to backend)
- ADR-020: Shared Normalizer Module (established `normalize_common.py` for XCCDF — this ADR clarifies it is XCCDF-specific)
- ADR-027: Dynamic Tab System (supply chain profile declares a custom tab via display config)
- ADR-033: File-Streamed API Ingestion (compose_post_body pattern for OOM-safe POST)
- Lightwell Phase L2b: TPA integration (BOMbastic API consumes CycloneDX SBOMs — this normalizer's output is the data source)
- Feature spec: `specs/compliance-pipelines/features/feature-supply-chain-scanning.md` (to be written)
