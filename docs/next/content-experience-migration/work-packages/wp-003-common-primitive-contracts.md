# WP-003 — Common primitive contracts

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| Phase      | 1 — Common contracts                                                               |
| Depends on | WP-002                                                                             |
| Target     | `content-primitives-common`                                                        |
| Outcome    | Dependency-light, versioned wire contracts shared across runtimes and repositories |

## Human summary

**Why this matters:** Frontend and backend code need a shared, stable way to describe content and its evidence without depending on a particular runtime or repository. Common contracts reduce duplication and prevent the same data from being interpreted differently.

**What will change:** A lightweight `content-primitives-common` package will provide versioned, runtime-validated schemas for content identity, observations, evidence, events, search, operations, jobs, errors, and pagination while preserving existing wire behavior.

**PR scope:** Extract the portable types, add compatible encoders and decoders with golden fixtures, retain deprecated aliases, publish a prerelease, and migrate one real producer and consumer.

**Not in this PR:** The package will not contain user-interface code, backend services, database access, protocol clients, or Node.js-only functionality. Mutable tags will not become permanent content identities.

**Success looks like:** Browser and Node.js consumers can use the published contracts, current and supported previous versions can read shared fixtures, and existing container and execution-environment results remain unchanged.

## Scope and changes

Extract the portable Level A/B content model and define runtime schemas for content subjects, observations, primitive/evidence records, events, search documents, operations, jobs, errors, pagination, and trust/intent/quality namespaces. Move duplicated frontend/backend data transfer objects (DTOs) without changing wire behavior. Publish prerelease packages consumed by one current producer and one consumer.

The package must not import React, Backstage, Express, a database library, protocol clients, or Node-only APIs.

```ts
// Frozen semantic shape; the selected runtime-schema library is decided by ADR.
interface ContentSubject {
  contentKey: string;
  digest: string;
  variant?: string;
  source: { backendId: string; uri: string };
  observedRef?: string;
}

type PrimitiveState =
  | 'known'
  | 'unknown'
  | 'not_scanned'
  | 'partial'
  | 'failed';
```

## Implementation slices

1. Scaffold the portable package and architecture guard.
2. Move existing identity/enumeration/digest/relation types with deprecated re-exports.
3. Add versioned primitive, evidence, event, operation, job, search, and error schemas.
4. Add backward-compatible codecs and golden serialization fixtures.
5. Publish a prerelease and migrate one producer and one consumer.

## Contracts and compatibility

Mutable tags are observations, never governance identity. Primitive records include subject/digest, namespace/name/schema version, semantic state, evidence, producer/version, run/input digests, generation time, optional validity/confidence, and supersession. Unknown fields from compatible minor versions must not corrupt decoding. Breaking wire changes require a major schema/package version and migration.

## Required tests

- **Contract:** round-trip and golden JSON fixtures for every schema and semantic state.
- **Compatibility:** current and previous supported package versions decode shared fixtures.
- **Architecture:** forbidden dependency/import test and browser/Node compilation.
- **Consumer:** existing OCI/EE fixtures and current API responses remain unchanged.

### Acceptance criteria

- Given a mutable ref changes digest, then prior primitive identity remains attached to the original digest.
- Given each primitive state, then encoding and decoding preserve evidence/provenance semantics.
- Given a sample external plugin, then it compiles using only published contracts.
- Given the package graph, then no prohibited runtime dependency is present.

## Rollback and completion

Keep existing exports as deprecated aliases and revert consumers independently; never unpublish released versions. Done means cross-version fixtures pass and at least one real producer and consumer use the published package.
