# WP-008 — EE runtime split and adapter correction

| Field      | Value                                                                           |
| ---------- | ------------------------------------------------------------------------------- |
| Phase      | 2 — Unified ingestion                                                           |
| Depends on | WP-004                                                                          |
| Targets    | `content-type-execution-environment-common`, `-node`, `-frontend`               |
| Outcome    | Source-neutral EE semantics with strict portable, Node, and frontend boundaries |

## Human summary

**Why this matters:** Execution environment (EE) behavior currently mixes portable data, server processing, user-interface code, and assumptions about Open Container Initiative (OCI) registries. Separating these concerns allows equivalent artifacts from other capable sources to behave consistently.

**What will change:** EE contracts, Node.js processing, and React user-interface components will move into separate packages. Detection and normalization will use declared manifest and blob capabilities plus orchestration-supplied source identity rather than a hard-coded backend name.

**PR scope:** Extract the three runtime-specific packages, preserve compatibility exports and current classification behavior, define the owned EE operations, and verify dynamic registration and packaging.

**Not in this PR:** WP-012 will register the published operation handlers or compatibility ports in the operation runtime, and WP-014 will own legacy HTTP aliases. Existing route and action semantics will not be redesigned here.

**Success looks like:** The packages build independently, current data and interface fixtures remain equivalent, neutral EE code contains no OCI backend-name check, and removing the frontend plugin leaves the portal healthy with no empty EE interface.

## Scope and changes

Split EE identity/DTOs/annotations/update policy, detection/normalization/enumeration, and React UI into separate packages. Replace `backendId === 'oci'` assumptions with manifest/media/blob capabilities supplied by the source adapter and source identity supplied by orchestration. Preserve exact versus unknown manifest behavior, digests, classification, contained-item enumeration, relations, exports, and dynamic UI registration.

Own the normalized `content.ee.register`, `content.ee.build`, and approved `ansible:create:ee-definition` operation/Scaffolder contracts. Publish handlers or compatibility ports that WP-012 can register without importing EE implementation into the operation runtime. Preserve the RHAAP route/action semantics captured by WP-001; WP-014 owns only their legacy HTTP aliases.

```ts
// Illustrative source-neutral requirement.
const executionEnvironmentType: ContentTypeContribution = {
  requires: ['artifact.manifest.read', 'artifact.blob.read'],
  identify: candidate =>
    identifyExecutionEnvironment(candidate.mediaType, candidate.annotations),
  normalize: (candidate, context) =>
    normalizeExecutionEnvironment(candidate, context.source),
};
```

## Implementation slices

1. Freeze current EE wire, classification, and UI fixtures.
2. Extract portable schemas/constants with compatibility re-exports.
3. Move Node identify/normalize/enumerate behavior and inject source context.
4. Move React components/API binding to the frontend package.
5. Register Node and frontend contributions dynamically and verify packaging.

## Ordered PR series

1. **Portable contracts:** freeze fixtures and publish `content-type-execution-environment-common` with compatibility re-exports; no runtime behavior changes.
2. **Node extraction:** publish the Node package, replace backend-name checks with capabilities and orchestration-supplied identity, and keep existing callers on compatibility exports.
3. **Operation contracts:** publish the three EE operation handlers or compatibility ports without registering them in the operation runtime.
4. **Frontend extraction:** publish the React package and retain the existing static mount while package/runtime guards pass.
5. **Dynamic registration and cutover:** register Node/frontend contributions, verify static and dynamic parity, and switch guarded consumers; WP-039 governs compatibility removal.

Each PR must pass the applicable tests below, leave one releasable old or compatibility path, and be revertible without requiring a later PR.

## Required tests

- **Contract:** old/new EE DTO, annotations, relations, update-policy, and unknown-state fixtures.
- **Architecture:** common has no React/Node; Node has no React; frontend has no server/protocol dependency.
- **Unit:** capability-based identify/normalize/enumerate with no backend-ID branch.
- **Parity:** same digests, classifications, contained items, docs, and cards as current behavior.
- **Dynamic:** install/contribute/remove frontend artifact without backend imports.

### Acceptance criteria

- Given equivalent manifests from two capable sources, normalization differs only in supplied source identity.
- Given missing optional manifest data, exact/unknown classification matches the baseline.
- Given static analysis, no neutral EE code contains an OCI backend ID check.
- Given plugin removal, the portal remains healthy and no empty EE surface remains.

## Rollback and completion

Deprecated exports delegate to runtime-correct packages; frontend registration is feature-flagged. Done means all three packages build independently and old/new fixtures plus dynamic registration pass.
