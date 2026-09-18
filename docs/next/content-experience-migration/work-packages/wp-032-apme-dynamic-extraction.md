# WP-032 — APME dynamic extraction

| Field      | Value                                                                                |
| ---------- | ------------------------------------------------------------------------------------ |
| Phase      | 9 — APME modularization                                                              |
| Depends on | WP-029, WP-030, and WP-031                                                           |
| Targets    | New APME repository frontend/backend dynamic artifacts                               |
| Frozen IDs | Frontend plugin `apme`; backend plugin `apme`; backend module IDs per runtime ledger |
| Outcome    | Installable, independently versioned APME capability                                 |

## Human summary

**Why this matters:** Ansible Policy & Modernization Engine (APME) must be installable and upgradeable independently rather than requiring changes to the Red Hat Developer Hub (RHDH) host source.

**What will change:** APME will move into its approved repository and publish versioned frontend and backend dynamic-plugin artifacts with explicit compatibility, configuration, dependency, and integrity metadata.

**PR scope:** Map packages into the new repository, add dynamic entry points and descriptors, build and verify release artifacts, and test installation, upgrade, rollback, removal, and reinstallation against supported RHDH versions.

**Not in this PR:** This work does not own the final reconciliation of runtime registration metadata or the final browser-state migration certification. It also will not allow one module to register under multiple identities.

**Success looks like:** The exact published artifacts work without host source edits, reject incompatible hosts before partial activation, and can be removed or rolled back without harming unrelated functionality or durable data.

## Scope and changes

Extract APME into the approved new APME repository and produce dynamic frontend/backend artifacts with explicit descriptors, compatibility ranges, config schemas, integrity metadata, and dependency declarations. Verify install, upgrade, rollback, removal, and reinstall in supported RHDH. Preserve legacy dynamic route ownership recorded by WP-043; do not let one module register under multiple runtime identities accidentally.

WP-032 consumes the frozen runtime-ledger schema/baseline fixtures defined by WP-001 and the package-level browser-state fixtures/contracts defined by WP-030. If WP-043 or WP-045 has already published stricter generated fixtures, consume them unchanged; otherwise publish artifact evidence for those later WPs to reconcile. WP-043 owns final static/deployed-overlay reconciliation, and WP-045 owns final browser migration/precedence certification, so neither is an undeclared completion dependency here.

```yaml
pluginId: apme
contractVersion: 1
requires:
  contentPrimitivesApi: '^1.0.0'
  portalExtensionApi: '^1.0.0'
artifacts:
  - type: frontend
  - type: backend
```

## Implementation slices

1. Freeze source-to-new-repository package mapping plus artifact/descriptor/runtime registration ledgers.
2. Add dynamic entrypoints and supported dependency externalization.
3. Build, sign/verify as approved, and install exact release artifacts.
4. Exercise upgrade/rollback/removal with database compatibility.
5. Publish configuration, support matrix, provenance, and operations documentation.

## Ordered PR series

1. **New-repository scaffold (new APME repository):** establish package mapping, build policy, ownership, release metadata, and contract-compatible source import without publishing artifacts.
2. **Dynamic entry points (new APME repository):** add frontend/backend descriptors and dependency externalization, then build exact local artifacts and inspect their contents.
3. **Signed publication (new APME repository):** publish versioned artifacts with approved integrity/provenance and immutable release metadata; do not change portal deployment.
4. **Compatibility matrix (new APME repository):** install the published artifacts—not workspace links—across supported RHDH versions and certify upgrade/rollback/removal/database behavior.
5. **Consumer rollout (portal/deployment repository):** pin the certified artifacts behind the existing registration handoff, publish installation/rollback evidence, and leave final overlay reconciliation to WP-043.

The PRs merge and publish in this order. Every repository-specific PR must use its checked-in quality gates, and consumer rollout rolls back by pinning the prior certified artifacts without rewriting durable state.

## Required tests

- Artifact contents, exports, integrity/provenance, descriptor versions, and dependency allowlist.
- Representative RHDH install/start/route/UI/job/SSE and multi-replica backend behavior.
- Removal/upgrade/rollback/reinstall including WP-030 browser-state contract fixtures and database migrations; WP-045 later certifies the full migration matrix.
- Incompatible host/dependency/config and partial frontend/backend installation behavior.
- No secret embedded in descriptors/artifacts/logs.

### Acceptance criteria

- Given documented artifacts and config, APME works without host source edits.
- Given an unsupported contract version, activation fails before partial registration.
- Given removal, unrelated portal/backend functionality remains healthy and durable data is retained.
- Given rollback, supported prior artifacts read the database/browser state per documented compatibility.

## Rollback and completion

Rollback uses pinned prior artifacts plus approved schema/state compatibility. Done means exact published artifacts—not workspace source shortcuts—pass the complete supported matrix.
