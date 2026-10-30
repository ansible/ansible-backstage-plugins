---
title: "ADR-038: Windows Server Compliance Profile Architecture"
status: Accepted
date: 2026-07-13
deciders: Massimo Ferrari
---

# ADR-038: Windows Server Compliance Profile Architecture

## Status

Accepted — 2026-07-13

## Context

GitLab MR #1 proposes adding Windows Server compliance support via `security.compliance_windows` — a single collection covering DISA STIG, CIS Benchmarks, HIPAA, and PCI-DSS v4.0. This ADR records the architectural decisions for how Windows compliance profiles should be structured, what scanners to use, how to handle regulatory crosswalks, and how EEs are delivered.

### Key constraints

1. **Certification matters.** For RHEL, OpenSCAP provides NIST SCAP 1.2 validated scanning. Windows needs an equivalent certified scanner for STIG, not just Ansible-based checking.

2. **OpenSCAP doesn't work on Windows.** The last Windows build was v1.3.4; the project has [discontinued Windows support](https://github.com/OpenSCAP/openscap/issues/1842).

3. **DISA SCC is SCAP 1.3 validated** but cannot be redistributed in container images due to [trade secret licensing](https://www.niwcatlantic.navy.mil/Media/Article/3432729/naval-information-warfare-center-atlantic-signs-five-year-software-licensing-ag/) (see Decision 2).

4. **No certified CIS scanner exists as open source** for Windows. CIS-CAT Pro requires a paid CIS SecureSuite membership.

5. **Different scanners require different EEs.** A STIG profile using SCC has different dependencies than a CIS profile using `infra.windows_ops`.

6. **Regulatory frameworks (HIPAA, PCI-DSS) are crosswalk mappings**, not independent scanners. They map technical controls (STIG V-IDs, CIS rule IDs) to regulatory requirements.

### Scanners evaluated

| Scanner | STIG | CIS | Certification | Open Source | Can Embed in EE |
|---------|------|-----|---------------|-------------|-----------------|
| DISA SCC | Full (247 rules) | No | SCAP 1.3 Validated | Free (not OSS) | No (legal) |
| CIS-CAT Pro | No | Full | CIS official | No (paid) | No (licensed) |
| OpenSCAP | Broken on Windows | N/A | SCAP 1.2 (Linux only) | Yes | N/A |
| PowerSTIG | 83% (206/247) | No | Not validated | Yes | Yes |
| infra.windows_ops | 88% (248/283) | Yes (210 rules) | Not validated | Yes (GPL-3.0) | Yes |

## Decisions

### Decision 1: Separate profiles per framework, not one monolithic collection

**Each Windows compliance framework gets its own profile** with its own EE, install.yml, and compliance-profile.yml. This mirrors the RHEL pattern (rhel9-stig, rhel9-cis-l1, rhel9-cis-l2 are separate profiles).

| Profile Slug | Framework | Scanner | EE Contents |
|-------------|-----------|---------|-------------|
| `windows-server-stig` | DISA_STIG | DISA SCC (ephemeral) | SCAP benchmarks + download role + pywinrm |
| `windows-server-cis-l1` | CIS | infra.windows_ops | Collection + pywinrm |
| `windows-server-cis-l2` | CIS | infra.windows_ops | Collection + pywinrm |

**Rationale:** Different scanners require different EE dependencies. SCC is a Windows executable downloaded at runtime; `infra.windows_ops` is an Ansible collection embedded in the EE. Mixing them in one profile creates confusion about certification status and bloats the EE.

**The upstream `security.compliance_windows` collection** remains a shared library providing CFF filters, the crosswalk engine, Track A pre-assessment roles, and the compliance_gather PowerShell script. Individual profiles depend on it but are structured under our `profiles/` directory following established patterns.

### Decision 2: DISA SCC via ephemeral download with cache fallback

**SCC cannot be embedded in container images** for commercial distribution. The legal analysis found:

- SCC is public domain under 17 USC § 105 (government work) with Distribution Statement A
- However, NIWC Atlantic [signed an exclusive commercial licensing deal with Ignyte Platform](https://executivebiz.com/2023/06/ignyte-platform-to-commercialize-navy-developed-security-compliance-checker-software/) for binary redistribution rights
- The SCC installer has an undisclosed EULA
- No vendor precedent exists for embedding SCC in commercial products
- Even [Chocolatey downloads SCC at install time](https://community.chocolatey.org/packages/scap-compliance-checker) rather than embedding the binary

**Architecture: download-with-cache-fallback on the execution node.**

```
Scan time (Play 0 — localhost/EE):
  1. Try download SCC from dl.dod.cyber.mil → cache to /tmp/compliance-scc/
  2. If download fails AND cached copy exists → warn + continue with cached
  3. If download fails AND no cache → fail with clear error

Play 1 (targets via WinRM):
  4. win_copy SCC + SCAP benchmark from EE to target
  5. Run cscc -u (unattended scan)
  6. fetch XCCDF results back to EE
  7. Remove SCC + benchmark from target

Play 2 (localhost/EE):
  8. normalize_xccdf per host (REUSE existing _shared/normalize_common.py)
  9. Compose NDJSON + POST to API (ADR-033/034)
```

**Key advantage:** SCC outputs standard XCCDF XML — the same format as OpenSCAP. Our existing `normalize_common.py` parses it with zero changes. The Windows STIG normalizer is a thin wrapper around the shared XCCDF normalizer, exactly like the RHEL profiles.

**SCAP benchmark content IS freely redistributable** (public domain, [hosted on GitHub](https://github.com/niwc-atlantic/scap-content-library)). This can be pre-baked into the EE.

**Export control: not an issue.** SCC carries Distribution Statement A, which explicitly permits distribution to foreign nationals and governments. It is not ITAR or EAR controlled.

### Decision 3: infra.windows_ops for CIS (uncertified)

CIS profiles use `infra.windows_ops` as the scanner. This is uncertified — there is no open-source, certified CIS scanner for Windows.

The certification status is declared honestly in `compliance-profile.yml`:

```yaml
certification:
  status: "uncertified"
  authority: "N/A"
  disclaimer: >
    infra.windows_ops provides community-maintained CIS Benchmark content.
    Not CIS-certified. For certified assessments, use CIS-CAT Pro with a
    CIS SecureSuite membership. Results from this scanner should be validated
    against the official CIS Benchmark document.
```

CIS-CAT Pro can be supported as a Tier 2 scanner option in the future for customers who bring their own license.

### Decision 4: Regulatory crosswalks as dynamic tab widgets

**HIPAA and PCI-DSS are not separate profiles.** They are regulatory crosswalk views computed from existing STIG or CIS scan findings.

**Implementation:** Each compliance profile declares crosswalk tabs in its `compliance-profile.yml` display config. The tabs are dynamically installed when the profile is connected and removed when disconnected — no separate install step.

```yaml
display:
  tabs:
    - key: "hipaa"
      label: "HIPAA"
      icon: "policy"
      crosswalk_framework: "hipaa"
      source_framework: "STIG"
      layout:
        - widget: crosswalk_summary
          title: "HIPAA Security Rule — Technical Safeguards"
          show_gaps: true
        - widget: crosswalk_controls_table
          title: "Control Status"
```

**Data flow:** The crosswalk computation happens client-side in the dashboard. It's a join between scan findings (already in the DB) and the control mapping definition (stored in the profile's displayConfig). No second scan, no backend API changes, no separate normalizer.

**New widget types required:**
- `crosswalk_summary` — shows overall control coverage (pass/fail/partial/gap/unmapped counts)
- `crosswalk_controls_table` — per-control detail with mapped rule statuses

**The crosswalk definition data** (Steve's `hipaa.yml` and `pci_dss_v4.yml`) ships inside `security.compliance_windows` and is referenced by the profile's `compliance-profile.yml`. The install.yml reads it and includes it in the profile registration payload.

This extends ADR-027 (Dynamic Tab System) with two new Tier 1 widget types.

### Decision 5: EE delivery pattern per profile

Each Windows profile gets its own EE definition following the established pattern (ADR-031):

**STIG profile EE** (lightweight — scanner downloaded at runtime):
```yaml
version: 3
images:
  base_image:
    name: registry.redhat.io/ansible-automation-platform-26/ee-minimal-rhel9:latest
dependencies:
  galaxy:
    collections:
      - name: security.compliance_windows
      - name: ansible.windows
  python:
    - pywinrm>=0.4.3
    - requests-credssp
    - requests-ntlm
additional_build_steps:
  prepend_galaxy:
    - COPY _build/collections/ /usr/share/ansible/collections/
  prepend_final:
    # Pre-bake SCAP benchmarks (freely redistributable, public domain)
    - COPY _build/scap-content/ /usr/share/scap/windows/
  append_final:
    - RUN ansible-galaxy collection list security.compliance_windows
    - RUN python3 -c "import winrm; print('pywinrm OK')"
    - RUN test -d /usr/share/scap/windows/
```

**CIS profile EE** (heavier — scanner collection embedded):
```yaml
version: 3
images:
  base_image:
    name: registry.redhat.io/ansible-automation-platform-26/ee-minimal-rhel9:latest
dependencies:
  galaxy:
    collections:
      - name: security.compliance_windows
      - name: infra.windows_ops
      - name: ansible.windows
      - name: community.windows
  python:
    - pywinrm>=0.4.3
    - requests-credssp
    - requests-ntlm
additional_build_steps:
  prepend_galaxy:
    - COPY _build/collections/ /usr/share/ansible/collections/
  append_final:
    - RUN ansible-galaxy collection list infra.windows_ops
    - RUN ansible-galaxy collection list security.compliance_windows
    - RUN python3 -c "import winrm; print('pywinrm OK')"
```

EE images are built via GitHub Actions, pushed to GHCR, and mirrored to PAH via skopeo (ADR-031).

### Decision 6: Contribution to upstream

All fixes identified in the MR review will be contributed as PRs to `stevefulme1/compliance-windows`. The collection is consumed as an EE dependency — it does not live inside our `profiles/` directory.

The profile-level artifacts (install.yml, uninstall.yml, EE definitions, compliance-profile.yml) live in our `profiles/` directory since they are specific to our dashboard integration.

## Consequences

### Positive

- **Certified STIG scanning** via SCC without legal redistribution risk
- **Reuse of existing normalizer** — SCC outputs XCCDF XML, parsed by the same `normalize_common.py` used for RHEL profiles
- **Clean separation** — each framework gets honest certification status
- **Crosswalk tabs** appear/disappear with profile lifecycle — no orphaned regulatory views
- **Upstream contribution** — improvements flow back to the community collection

### Negative

- **SCC requires internet on first scan** (with cache fallback for subsequent air-gapped runs)
- **CIS profiles are uncertified** — no open-source certified alternative exists
- **Two new widget types** needed in the dashboard frontend (~4 days of work)
- **Multiple EEs** for Windows (one per framework) vs one for all RHEL XCCDF profiles (they share scap-security-guide)

### Risks

- SCC download URL may change without notice (mitigated: version-pinned URL with checksum)
- NIWC may restrict SCC downloads in the future (mitigated: cache fallback, can pursue formal licensing)
- `infra.windows_ops` CIS content may lag behind official CIS Benchmark releases (mitigated: clear uncertified disclaimer)

## Related

- ADR-001: Scanner Orchestrator Architecture (CFF as contract) — Windows profiles are Tier 1
- ADR-011: Profile-Driven Platform Guards — `os_family: ["Windows"]`
- ADR-026: Portable Display Configuration — crosswalk tabs use display config
- ADR-027: Dynamic Tab System — extended with crosswalk_summary and crosswalk_controls_table widgets
- ADR-028: Profile Lifecycle — crosswalk tabs install/uninstall with profile
- ADR-030: Per-Host Normalization — SCC results normalized per-host
- ADR-031: PAH for Execution Environments — Windows EEs mirrored to PAH
- ADR-033/034: File-Streamed API Ingestion / NDJSON — Windows findings streamed via uri src
- ADR-036: Profile Identity — each Windows profile gets a unique slug
