# WP-043 — Dynamic runtime registration ledger

| Field      | Value                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Phase      | 7 — Portal composition                                                                                 |
| Depends on | WP-001 and WP-022                                                                                      |
| Outcome    | Generated mapping of package exports, dynamic artifacts, plugin/module IDs, routes, and runtime owners |

## Baseline versus cutover distinction

WP-001 captures the immutable baseline before extraction. This WP defines the target runtime ledger, continuously validates artifacts during implementation, and performs cutover reconciliation. It does not replace or rewrite baseline evidence.

## Human summary

**Why this matters:** Dynamic plugins can fail at deployment when routes, identifiers, exports, permissions, or runtime owners are duplicated, missing, or only implied by source code. A generated ledger makes the installed runtime explicit and verifiable.

**What will change:** Build tooling will record each package, artifact digest, plugin or module identifier, extension, route, application programming interface (API) reference, permission, configuration schema, compatibility requirement, alias, owner, and replacement. Deployed manifests will be checked against this target ledger during cutover.

**PR scope:** Define the machine-readable schema, generate records from exports and runtime descriptors, validate ownership and compatibility, inspect built artifacts, test install and removal flows, and reconcile every supplied deployment overlay.

**Not in this PR:** This work will not replace the immutable baseline captured by WP-001. An inaccessible deployment overlay will not be assumed compatible; it will remain a blocking evidence gap with an owner and due date.

**Success looks like:** Every runtime registration has exactly one owner and a matching verified artifact, while duplicates, orphaned exports, stale aliases, changed digests, and overlay differences fail before deployment. Release and deployment tooling consume the ledger rather than relying on implicit runtime identity.

## Scope and changes

Generate records for package name/version, artifact type/path/digest, plugin ID, backend plugin/module IDs, extension IDs, route ownership, API refs, permissions, config schema, host/dependency compatibility, legacy aliases, owner, and replacement. Preserve frozen AAP plugin/module IDs and exact APME plugin/module/legacy route ownership from the canonical plan.

```yaml
package: '@ansible/backstage-plugin-apme'
artifactType: frontend
pluginId: apme
routes: [apme-root]
contractVersion: 1
legacyOwners: []
```

## Implementation slices

1. Freeze a machine-readable ledger schema and baseline references.
2. Build generators from package exports and runtime descriptors.
3. Add uniqueness, compatibility, orphan, and unowned-route validators.
4. Verify built artifacts and representative RHDH registrations.
5. In every named deployment repository/overlay, generate the deployed manifest and reconcile exact route, API factory/ref, mount, listener, menu/order, field-extension, backend plugin/module, permission, and config-schema ownership against the static target ledger. Record an inaccessible overlay as a blocking owner/revision/access evidence gap, never as implicitly compatible.
6. Reconcile target versus baseline and all supplied deployed overlays at each cutover and publish reports.

## Ordered PR series

1. **Ledger schema and source generator (portal repository):** freeze the machine-readable schema and baseline references, then generate deterministic static records from package exports/descriptors.
2. **Artifact verification (portal repository):** inspect built artifacts, add digest/ownership/compatibility/orphan validators, and publish target-ledger reports without changing deployment.
3. **Deployment manifest tooling (portal or approved tooling repository):** publish the generator and reconciliation contract consumed by deployment repositories, with representative fixtures and versioned output.
4. **Per-overlay reconciliation (each named deployment repository):** pin the tooling/schema version, generate that repository's manifest, correct or explicitly block differences, and record repository/revision/owner evidence; each repository receives its own PR.
5. **Cutover gate (portal repository):** aggregate only merged, revision-pinned overlay reports, reconcile target versus WP-001 baseline, and enable release/deployment enforcement.

Merge the portal schema before tooling, tooling before every overlay PR, and all required overlay PRs before the cutover gate. Each PR uses its repository's checks and rolls back by restoring the prior versioned ledger/artifact pair; inaccessible overlays remain blockers rather than skipped cells.

## Required tests

- Deterministic generation and schema validation.
- Duplicate plugin/module/extension/route ID, missing pair, orphan export, incompatible version, and stale alias failures.
- Built artifact digest/contents match ledger; static source declarations alone are insufficient.
- Install/upgrade/remove/reinstall registration snapshots.
- Frozen AAP/APME IDs and legacy ownership match the canonical plan exactly.
- Static-versus-deployed overlay fixtures detect omitted/extra routes, APIs, mounts, fields, modules, permissions, and ordering values for every supplied deployment manifest.

### Acceptance criteria

- Given a built artifact, every runtime registration has one owner and ledger row.
- Given a duplicate ID or route owner, CI fails before packaging.
- Given a cutover, the target ledger accounts for every baseline row as preserved, aliased, intentionally changed, or retired with approval.
- Given a named deployment overlay, its repository/revision and exact disposition are reconciled; unavailable access blocks cutover with an owner and due date.
- Given an artifact changes after verification, digest/provenance mismatch blocks deployment.

## Rollback and completion

Pin and restore the prior ledger/artifact set as an atomic deployment unit. Done means release and deployment tooling consume the generated ledger and no runtime identity is implicit.
