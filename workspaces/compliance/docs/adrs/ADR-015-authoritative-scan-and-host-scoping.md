---
title: "ADR-015: Authoritative Scan, Mandatory Scan-Before-Remediation, and Host Scoping"
description: "Three interrelated design questions arose during Phase 1 testing of the remediation lifecycle (ADR-014):"
type: adr
status: accepted
date: 2026-06-01
product: "AAP Compliance Dashboard"
---
# ADR-015: Authoritative Scan, Mandatory Scan-Before-Remediation, and Host Scoping

**Status:** Accepted (Implemented 2026-06-02, updated 2026-06-11)  
**Date:** 2026-06-01  
**Deciders:** Massimo Ferrari  

## Context

Three interrelated design questions arose during Phase 1 testing of the remediation lifecycle (ADR-014):

1. **Can a remediation profile be applied to an inventory that hasn't been scanned?** The current implementation requires findings to determine which hosts to target. If no findings exist, the launch fails with "No failing hosts found." Is this correct, or should we support blind application?

2. **Which scan provides the authoritative findings for host targeting?** When multiple scans exist for the same compliance profile and inventory, which one determines the failing hosts?

3. **How should baseline (custom compliance) scoring handle rules that are Not Applicable to some hosts?** If a profile has 3 rules and one only applies to half the hosts, how is the denominator calculated?

### Competitive Research (2026-06-01)

Deep research across 8 platforms (Red Hat Insights, Rapid7 InsightVM, Qualys VMDR, Chef InSpec/Automate, Puppet Comply, Drata, Vanta, CIS-CAT Pro) plus the XCCDF/SCAP standard yielded three high-confidence findings:

**Finding 1: No platform supports portable remediation plan reuse across host groups.**
- Insights ties plans to scanned-and-impacted systems only ("Only impacted systems can be selected and included in a remediation plan")
- InsightVM locks scope in static projects; dynamic projects destructively remove solutions on scope change
- Qualys auto-generates tickets from scan-policy matches rather than offering portable templates
- The closest mechanism is Insights' "Add to existing playbook" which appends newly-scanned hosts, but this is additive, not template-based
- *All platforms require a fresh scan to validate remediation — none support blind application*

**Finding 2: Per-host rule applicability is determined at scan time, not plan time.**
- OpenSCAP uses CPE platform checks embedded in XCCDF rules to mark rules as `notapplicable`
- Chef InSpec uses `only_applicable_if` (N/A) and `only_if` with impact override
- Puppet Comply auto-assigns N/A when benchmark and platform are mismatched
- XCCDF tailoring files operate uniformly across all hosts in a policy — different host groups need separate policies, not per-host logic within a policy

**Finding 3: Compliance scoring universally adjusts the denominator by excluding non-applicable rules.**
- Puppet Comply excludes 5 non-scoring statuses (N/A, Manual, Not Checked, Not Selected, Informational) from pass/fail denominator
- Puppet provides dual scores: "exception score" (excludes temporarily-excepted rules) and "adjusted compliance score" (ignores exceptions)
- Chef InSpec's `--enhanced-outcomes` separates N/A into its own category
- Qualys auto-adjusts by scoping scoring to evaluated findings only

## Decisions

### 1. Scan is mandatory before remediation

A compliance scan must exist for the target `(compliance_profile, inventory)` before a remediation can be launched. Blind application to an unscanned inventory is not supported.

**Rationale:** Industry consensus is unanimous — no platform allows remediation without a prior scan. The scan serves two purposes: (a) identifying which hosts are failing which rules, and (b) providing evidence for the remediation audit trail. Without a scan, the system cannot determine the correct host scope, and the remediation has no baseline to measure against.

**User experience:** When a user clicks "Launch Remediation" from the RemediationsList, the system checks for a completed oscap scan for the profile's `complianceProfileId` and the selected inventory. If none exists, the launch is blocked with a clear message: "No scan results found for this profile and inventory. Run a scan first." The scan launcher should be one click away.

### 2. Authoritative scan = latest completed oscap scan per (compliance_profile × inventory)

When multiple scans exist for the same `(compliance_profile, inventory)` pair, the **most recent completed oscap scan** is the authoritative source for:
- Host targeting (which hosts failed which rules)
- Before/after comparison (verification scan delta)
- Dashboard posture scoring

Remediation scans (`scanner='remediation'`) are never authoritative. Only `scanner='oscap'` scans with `status='completed'` qualify.

**Rationale:** This matches the existing dashboard posture logic (latest scan per profile × inventory) and aligns with how Insights, Qualys, and InsightVM determine the current state. Using the latest scan ensures remediation targets the current reality, not a stale snapshot.

**Implementation:** The remediation launch flow resolves the authoritative scan via:
```sql
SELECT * FROM compliance_scans 
WHERE profile_id = ? AND inventory_id = ? AND scanner = 'oscap' AND status = 'completed'
ORDER BY completed_at DESC LIMIT 1
```

The `informing_scan_id` on the execution record (ADR-014) captures which scan was authoritative at launch time, preserving the audit trail even after newer scans arrive.

### 3. Host scoping: user chooses scope at launch time

The authoritative scan provides the list of hosts and their per-rule pass/fail status. At remediation launch, the user selects the scope:

- **Failed only** (default): Only remediate hosts where the rule is currently failing. This is the safe, targeted approach.
- **Standardize all**: Apply the remediation to all hosts in the inventory, regardless of current status. This is the convergence approach (Chef/Puppet model) — ensures consistent state even on hosts that are currently passing.

The host list is always derived from the authoritative scan's findings. "Standardize all" uses all hosts that were scanned (pass + fail), not the inventory's total host count — hosts that were unreachable during the scan are excluded.

**Rationale:** Both patterns exist in the industry. Chef's convergence model applies desired state unconditionally. Insights' remediation targets only impacted systems. Offering both via a scope selector gives users the right tool for each scenario: `failed_only` for targeted fixes, `standardize_all` for compliance hardening campaigns.

### 4. Baseline scoring adjusts denominator by excluding N/A rules per-host

When scoring compliance against a custom baseline (the compliance baseline feature from ADR-014 §7):

- The denominator is the number of rules in the baseline that are **applicable** to each host, as determined by the scan
- Rules marked `notapplicable` by OpenSCAP (via CPE platform checks) are excluded from both numerator and denominator for that host
- The aggregate score across all hosts is: `SUM(per-host pass count) / SUM(per-host applicable count)`

This means two hosts can have different denominators if OpenSCAP determines a rule is N/A on one but applicable on the other.

**Rationale:** This matches the universal industry pattern (Puppet, Chef, Qualys, CIS-CAT). The scanner already determines applicability at runtime via CPE checks — the scoring layer just needs to respect the `notapplicable` status that OpenSCAP already reports in XCCDF results.

**Implementation note:** The CFF normalizer (`normalize_xccdf.py`) already maps XCCDF `notapplicable` results. The scoring queries need to exclude findings with `status='notapplicable'` from both pass and total counts. No new data capture is needed.

### 5. Cross-profile filtering on remediation selection

When viewing scan results for a specific compliance profile (e.g., DISA STIG), only remediation profiles associated with that `complianceProfileId` should be shown. CIS remediation profiles must not appear in STIG scan results, and vice versa.

**Rationale:** Applying a CIS remediation profile to STIG findings produces undefined behavior — the rules may not overlap, the host scope will be wrong, and the audit trail becomes incoherent. The current UI shows all profiles regardless of compliance standard.

**Implementation:** Filter the remediation profiles list by `complianceProfileId` when accessed from a scan results context. The RemediationsList tab (standalone) continues to show all profiles with a compliance profile column for identification.

## Consequences

- Remediation profiles remain inventory-independent templates (ADR-014 §7), but launching requires a prior scan for the target inventory
- The launch flow becomes: pick profile → pick inventory → system resolves authoritative scan → display host scope → launch
- Dashboard scoring and baseline scoring both use the same authoritative scan concept
- N/A handling requires no new data — the scanner already captures it
- Cross-profile filtering prevents accidental misapplication of remediation profiles
- The `informing_scan_id` on execution records provides full traceability: which scan informed which remediation

## Implementation Notes (2026-06-02, updated 2026-06-11)

Decisions 1, 2, 3, and 5 are fully implemented:

- **GET /scans/authoritative** endpoint resolves the latest completed oscap scan for a `(profileId, inventoryId)` pair, returning the scan record with aggregate pass/fail statistics. (Decision 2)
- **POST /remediate** auto-resolves the authoritative scan when `scanId` is not provided in the request body. Returns 400 if no qualifying scan exists. (Decision 1 + 2)
- **AuthoritativeScanResponse** type added to `compliance-common` (scan, passRate, passCount, failCount). (Decision 2)
- **Remediation launch dialog** with inventory dropdown checks the authoritative scan endpoint before allowing launch. If no scan exists, the dialog blocks launch and links to the scan launcher with profile + inventory pre-selected. Reactive scan validation shows green checkmark with pass rate (scan exists) or red warning with "Run a Scan First" button (no scan). (Decision 1 + 3)
- **Cross-profile filtering**: "Use Existing Remediation" from scan results filters the list to remediations matching the current `complianceProfileId`. Standalone Remediations tab shows all profiles with profile dropdown filter. (Decision 5)
- **Migration 012** adds `rule_count` column to the profile registry, populated from YAML metadata at profile registration time.

Decision 4 (N/A denominator adjustment for baseline scoring) is deferred to a future iteration.

**Remediation host scoping fix (2026-06-05):** A critical bug was found where `getFindings()` for remediation launch used only `profileId` to find the latest scan, ignoring `inventoryId`. When two inventories share a compliance profile, the remediation would use hosts from whichever inventory was scanned most recently. Fixed: `getLatestFindings()` now accepts optional `inventoryId`, and the remediation launch route passes `remediateRequest.inventoryId` to scope findings correctly.

## Related

- ADR-014: Remediation lifecycle architecture (execution records, baseline targets)
- ADR-013: Multi-group remediation with per-host scoping
- ADR-003: Single assessment JT (oscap scan architecture)
- ADR-012: Dashboard UX competitive alignment (posture scoring)
