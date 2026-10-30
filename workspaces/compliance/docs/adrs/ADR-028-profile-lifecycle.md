---
title: "ADR-028: Profile Lifecycle — Connect/Disconnect"
description: "Compliance profiles may need to be decommissioned without losing historical scan data"
type: adr
status: accepted
date: 2026-06-25
product: "AAP Compliance Dashboard"
---
# ADR-028: Profile Lifecycle — Connect/Disconnect

**Status:** Accepted  
**Date:** 2026-06-25  
**Deciders:** Massimo Ferrari  

## Context

Compliance profiles may need to be decommissioned without losing historical scan data. Scanner tools retire, compliance frameworks get deprecated, or organizational priorities shift — but the historical evidence of compliance posture must be retained for audit purposes.

The current implementation provides `DELETE /compliance-profiles/:id`, which permanently removes the profile record AND all associated data via database cascade rules. This violates fundamental compliance requirements:

1. **Regulatory data retention.** SOC 2, ISO 27001, HIPAA, and PCI-DSS require retention of security assessment records for audit evidence. A decommissioned scanner does not justify data destruction.

2. **No decommissioning workflow.** The only path to remove a profile from active use is destructive. Platforms like Qualys and Rapid7 allow disabling policies without losing historical scans.

3. **Profile version transitions are destructive.** When a framework publishes a new version (e.g., DISA STIG V2R8 → V2R9), the common pattern is to delete the old profile and create a new one. The version history is lost, and trend analysis across the transition is impossible.

4. **Install/uninstall asymmetry.** Each compliance profile ships `install.yml` (creates profile + JT + EE) and `uninstall.yml` (should clean up), but uninstall currently calls the destructive DELETE endpoint, forcing auditors to manually back up data before framework upgrades.

Industry comparison:

| Platform | Decommission mechanism | Data retention |
|----------|----------------------|----------------|
| Qualys | Disable policy (retains scans) | Indefinite |
| Rapid7 InsightVM | Archive policy (retains scan history) | Indefinite |
| Tenable | Deactivate scan (retains results) | 1-5 years configurable |
| Red Hat Insights | Disable system (retains check-in history) | Indefinite |
| **This plugin** | DELETE only → destroys data | N/A |

## Decision

Compliance profiles transition between `connected` and `disconnected` states via explicit lifecycle endpoints. Profiles are never deleted — disconnection preserves all historical data while removing the profile from the active working set.

### 1. Connection states

Two states, persisted in a new `connection_status` column:

- **`connected` (default):** Profile is active. Shows in the Settings tab, scans can be launched, dashboard reporting is active.
- **`disconnected`:** Profile is decommissioned. Hidden from Settings tab, scans cannot be launched, but all historical data (findings, scans, snapshots, executions) is retained and queryable via drill-down.

Three lifecycle timestamps track transitions:
- `connected_at`: When the profile was created or last reconnected.
- `disconnected_at`: When the profile was disconnected.
- `disconnected_by`: User who initiated disconnection (for audit trail).

### 2. Disconnect endpoint

`POST /compliance-profiles/disconnect`

Request body:
```json
{
  "id": 123,
  "reason": "STIG V2R8 superseded by V2R9"
}
```

Behavior:
- Sets `connection_status = 'disconnected'`
- Records `disconnected_at = NOW()` and `disconnected_by = current_user`
- Appends the reason to a version history log (optional field)
- Returns 204 No Content

The profile remains in the database. All foreign key relationships (`compliance_scans.compliance_profile_id`, `compliance_findings.compliance_profile_id`, `compliance_remediation_profiles.compliance_profile_id`) are intact. Drill-down URLs continue to work — e.g., clicking a historical scan from the Overview tab loads the scan details page even if the profile is now disconnected.

### 3. Connect endpoint (version upgrades)

`POST /compliance-profiles/connect`

Request body:
```json
{
  "framework_name": "DISA STIG",
  "framework_version": "V2R9",
  "description": "RHEL 9 DISA STIG V2R9",
  "assessment_job_template": "compliance-rhel9-stig-v2r9-scan",
  "remediation_job_template": "compliance-rhel9-stig-v2r9-remediate",
  "execution_environment": "compliance-rhel9-stig-v2r9"
}
```

Behavior:
1. Check for an existing disconnected profile with the same `framework_name`.
2. If found, **reconnect** it:
   - Update all profile fields (description, JT names, EE name, etc.)
   - Append to `version_history` (capped at 50 entries): `{ "version": "V2R9", "connected_at": "2026-06-25T10:00:00Z", "from_version": "V2R8" }`
   - Set `connection_status = 'connected'` and `connected_at = NOW()`
   - Return 200 OK with the updated profile
3. If not found, **create** a new profile with `connection_status = 'connected'` (standard profile creation flow).

This enables smooth framework version upgrades:
```bash
# Disconnect V2R8
ansible-playbook uninstall.yml -e compliance_profile_id=123

# Reconnect as V2R9 (same framework_name)
ansible-playbook install.yml -e framework_name="DISA STIG" -e framework_version="V2R9"
```

The version transition is traceable via `version_history`, and all historical V2R8 scans are preserved under the same profile record.

### 4. Disconnect by framework name (idempotent uninstall)

`POST /compliance-profiles/disconnect-by-framework`

Request body:
```json
{
  "framework_name": "DISA STIG",
  "reason": "Framework deprecated"
}
```

Behavior:
- Finds the connected profile with `framework_name = "DISA STIG"` (case-insensitive)
- Disconnects it (same as `/disconnect` by ID)
- If no connected profile exists, returns 404 (idempotent — uninstall.yml can run repeatedly)

Used by `uninstall.yml` playbooks to avoid hardcoding profile IDs.

### 5. Deprecate DELETE endpoint

`DELETE /compliance-profiles/:id` remains for backward compatibility but should not be used for profiles with scan history. A warning is logged if scan count > 0. Future release (P3) may add a `force_delete` flag and restrict destructive deletion to admin-only.

### 6. Database schema (migration 018)

New columns on `compliance_profiles`:
```sql
ALTER TABLE compliance_profiles ADD COLUMN connection_status TEXT NOT NULL DEFAULT 'connected';
ALTER TABLE compliance_profiles ADD COLUMN connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE compliance_profiles ADD COLUMN disconnected_at TIMESTAMP;
ALTER TABLE compliance_profiles ADD COLUMN disconnected_by TEXT;
ALTER TABLE compliance_profiles ADD COLUMN profile_version TEXT;  -- e.g., "V2R9"
ALTER TABLE compliance_profiles ADD COLUMN version_history TEXT;  -- JSON array, capped at 50
```

Index for lookups:
```sql
CREATE INDEX idx_profiles_connection_status ON compliance_profiles(connection_status);
CREATE INDEX idx_profiles_framework_name ON compliance_profiles(framework_name);
```

### 7. Install/uninstall playbook updates

Every `install.yml` now uses the connect endpoint:
```yaml
- name: Connect compliance profile
  uri:
    url: "{{ backstage_api_url }}/api/compliance/profiles/connect"
    method: POST
    body:
      framework_name: "{{ framework_name }}"
      framework_version: "{{ framework_version }}"
      description: "{{ description }}"
      assessment_job_template: "{{ assessment_jt_name }}"
      remediation_job_template: "{{ remediation_jt_name }}"
      execution_environment: "{{ ee_name }}"
    body_format: json
  register: connect_result
```

This is idempotent — re-running install.yml reconnects an existing profile if it was previously disconnected, or creates a new one if it's the first install.

Every `uninstall.yml` uses the disconnect-by-framework endpoint:
```yaml
- name: Disconnect compliance profile
  uri:
    url: "{{ backstage_api_url }}/api/compliance/profiles/disconnect-by-framework"
    method: POST
    body:
      framework_name: "{{ framework_name }}"
      reason: "Uninstalled via automation"
    body_format: json
  ignore_errors: true  # 404 if already disconnected is acceptable
```

This never deletes data — only marks the profile as inactive.

### 8. Version history capping

The `version_history` JSON array is capped at 50 entries (FIFO). Each entry:
```json
{
  "version": "V2R9",
  "connected_at": "2026-06-25T10:00:00Z",
  "from_version": "V2R8"
}
```

This prevents unbounded growth while retaining sufficient audit trail for framework transitions. 50 versions covers a decade of quarterly updates.

## Alternatives Considered

1. **Soft delete with `deleted_at` column.** Rejected: "deleted" semantics imply data loss. "Disconnected" better communicates decommissioning while preserving data.

2. **Archive table (`compliance_profiles_archived`).** Rejected: complicates queries (need UNION across active and archived tables for drill-down). Single-table with a status column is simpler.

3. **Keep DELETE as the only path, document backup procedures.** Rejected: places operational burden on users to manually back up before uninstall. Lifecycle should be automated.

4. **Auto-disconnect profiles with no scans in 90 days.** Rejected: a profile with no recent scans may still be the target for upcoming assessments. Decommissioning must be an explicit user action.

5. **Reconnect creates a new profile and links to old via `supersedes_id`.** Rejected: complicates dashboard aggregation (need recursive CTEs to follow supersession chains). In-place version transition is simpler.

## Consequences

### Positive

- Audit-safe profile decommissioning. Historical scan data is retained indefinitely, meeting regulatory requirements.
- Framework version upgrades are non-destructive. V2R8 → V2R9 transitions preserve all historical data under the same profile record, enabling trend analysis across versions.
- Install/uninstall playbooks are idempotent. Re-running install.yml reconnects a disconnected profile; re-running uninstall.yml is a no-op if already disconnected.
- Version history provides traceable audit trail for framework transitions.
- Differentiator over Insights: Insights Compliance has no built-in profile versioning — policy changes overwrite the previous configuration with no history.

### Negative

- **Profiles accumulate over time.** Disconnected profiles remain in the database indefinitely. No purge path in this ADR — deferred to data management (P2b). A future "Archive & Export" feature could allow admins to export disconnected profiles as JSON and remove them from the database.
- **Settings tab query must filter.** `GET /compliance-profiles` now defaults to `connection_status = 'connected'`. A separate admin view (P3) could show disconnected profiles.
- **Foreign key cascade rules remain unchanged.** Deleting a profile (via the deprecated DELETE endpoint) still cascades to scans/findings. This is acceptable for now — the recommendation is to disconnect instead of delete.

## Implementation Notes

Key files:
- **Database layer:** `ComplianceDatabase.ts` — new methods `connectProfile()`, `disconnectProfile()`, `disconnectProfileByFramework()`, `getConnectedProfiles()`, `getDisconnectedProfiles()`
- **API routes:** `plugins/compliance-backend/src/api/routes/profiles.ts` — new endpoints POST `/connect`, POST `/disconnect`, POST `/disconnect-by-framework`
- **Migration:** `plugins/compliance-backend/migrations/018-add-profile-lifecycle-columns.ts`
- **Types:** `plugins/compliance-common/src/types/lifecycle.ts` — new enums `ConnectionStatus`, `ProfileVersionHistoryEntry`
- **Playbooks:** All `install.yml` and `uninstall.yml` files in `profiles/*/` — updated to use connect/disconnect endpoints

## Related

- ADR-014: Remediation lifecycle (established the "summary + link to Controller" pattern — this ADR extends it to profile lifecycle)
- ADR-020: Normalizer pattern (mentions framework versioning as a known gap — this ADR addresses it)
- Feature spec: `specs/compliance-pipelines/features/feature-profile-lifecycle.md` (to be written)
