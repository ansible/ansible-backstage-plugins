# WP-001 — Contract and behavior fixture inventory

| Field        | Value                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------ |
| Phase        | 0 — Freeze behavior                                                                        |
| Depends on   | None                                                                                       |
| Repositories | `ansible-backstage-plugins`, `automation-content-plugins`, deployment overlay repositories |
| Outcome      | Machine-readable, reproducible baseline for every public and runtime contract              |

## Human summary

**Why this matters:** The migration needs a reliable record of today's behavior so that contracts are not accidentally changed or lost. Missing or inaccessible deployment information must be visible rather than silently guessed.

**What will change:** Generated inventories and reproducible fixtures will capture public exports, routes, registrations, entities, permissions, user-interface contributions, browser state, and dynamic plugin artifacts across the current repositories and deployment overlays.

**PR scope:** Add deterministic scanners, behavior fixtures, dynamic installation checks, deployment-overlay reconciliation, and continuous integration checks that detect unregistered contract changes.

**Not in this PR:** Runtime behavior will not change, and the work will not assign a future owner where none has been agreed. Inaccessible deployment overlays remain documented blocking gaps.

**Success looks like:** Repeated scans produce the same complete inventory, existing behavior matches the fixtures, and every contract has exactly one tracked record. Fixtures contain no credentials or sensitive upstream data.

## Scope and changes

Inventory both pinned baselines before extraction. Generate, rather than hand-maintain, ledgers for package exports, backend plugin/module registrations, frontend routes and contributions, and package `exports`. Capture all Representational State Transfer (REST) and Server-Sent Events (SSE) routes, entities, annotations, relations, provider names/location keys, permissions/rules, Scaffolder actions/filters/fields/autocomplete IDs, browser storage keys, and dynamic artifacts. Record actual deployment overlays with repository URL, branch/secure hash algorithm (SHA), package version and integrity.

Do not change runtime behavior or infer a target owner. An unassigned row is a blocking finding.

## Contract format

```ts
// Illustrative machine-readable row; freeze the final schema in this WP.
interface ContractInventoryRow {
  family: 'rest' | 'entity' | 'permission' | 'action' | 'frontend' | 'export';
  currentId: string;
  runtime:
    | 'portable'
    | 'frontend'
    | 'node'
    | 'backend-plugin'
    | 'backend-module';
  source: {
    repository: string;
    revision: string;
    file: string;
    symbol?: string;
  };
  target?: { package: string; symbol: string };
  compatibilityAlias?: string;
  fixture: string;
  owner?: string;
  removalRelease?: string;
}
```

Golden route fixtures must include method, path, query/body, response/status/content type, auth behavior, and streaming semantics. Each applicable route needs success, validation, not-found, denied, and upstream-failure cases.

## Implementation slices

1. Add deterministic scanners for exports and runtime registrations in each pinned source.
2. Add route/entity/permission/action fixtures and browser-state snapshots.
3. Add dynamic export/install smoke fixtures for supported RHDH runtimes.
4. Reconcile checked-in examples with every deployment overlay for which the named deployment owner supplies repository coordinates and read access; record unavailable overlays as blocking evidence gaps with owner and due date rather than guessing.
5. Add CI drift checks that fail on an unregistered contract.

## Required tests

- **Contract:** generated output is stable and complete across repeated runs.
- **REST/SSE:** golden fixtures reproduce status, body, headers, cancellation, and reconnect behavior.
- **Frontend:** routes, API refs, fields, menus, applicability, and storage keys are captured.
- **Dynamic:** each current frontend/backend pair installs and initializes in a representative RHDH image.
- **Security:** fixtures contain no bearer token, secret, private key, or unredacted upstream payload.

### Acceptance criteria

- Given either pinned source, when scanners run, then every public export and runtime registration has exactly one ledger row.
- Given each existing route, when golden cases run, then current behavior matches the fixture byte-for-byte except normalized volatile fields.
- Given production overlays, when reconciled, then deviations from checked-in examples are explicit and owned.
- Given an overlay is inaccessible, when inventory closes, then its repository/revision/access owner and due date remain a blocking ledger row rather than an omitted assertion.
- Given a new unregistered symbol or ID, when CI runs, then the drift check fails with its source location.

## Rollback and completion

This WP is additive documentation, tooling, and tests; revert without runtime impact. Done means the baseline is green, every capability has an owner/test reference, generated artifacts are reviewable, and unresolved inventory gaps are blocking issues rather than omissions.
