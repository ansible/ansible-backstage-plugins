# WP-004 — Node adapter/processor contracts

| Field      | Value                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------- |
| Phase      | 1 — Common contracts                                                                      |
| Depends on | WP-003                                                                                    |
| Target     | `content-primitives-node`                                                                 |
| Outcome    | Backend-neutral extension and orchestration interfaces with enforced dependency direction |

## Human summary

**Why this matters:** Content processing should work with any capable source instead of containing special cases for a specific registry or backend. Neutral contracts also keep protocol details from leaking into orchestration and content-type code.

**What will change:** A Node.js package will define source-adapter, content-type, processing, storage, projection, registry, and operation-handler interfaces based on declared capabilities and orchestration-supplied source identity.

**PR scope:** Extract the neutral interfaces, add registries and typed capability errors, preserve deprecated compatibility facades, and enforce package boundaries through unit and architecture tests.

**Not in this PR:** The package will not implement concrete Git, filesystem, Ansible Automation Platform (AAP), Ansible Policy & Modernization Engine (APME), or Open Container Initiative (OCI) clients, and its contracts will never carry credentials.

**Success looks like:** One synthetic content type can run against two different capable sources without checking backend names, while current OCI and execution-environment implementations still compile and behave correctly through adapters.

## Scope and changes

Extract neutral backend-adapter, content-type, update-policy, integrity, signing, processor/enricher, repository, projector, registry, and operation-handler contracts. Remove OCI names and backend-ID branching from neutral contracts. The orchestrator supplies source identity; content types consume declared capabilities.

```ts
// Illustrative; finalize in an approved contract PR.
interface BackendAdapter {
  readonly id: string;
  capabilities(): Promise<ReadonlySet<string>>;
  discover(
    request: DiscoveryRequest,
    signal: AbortSignal,
  ): AsyncIterable<SourceArtifact>;
  resolve(ref: SourceReference, signal: AbortSignal): Promise<ResolvedArtifact>;
  read(
    request: ArtifactReadRequest,
    signal: AbortSignal,
  ): Promise<ArtifactContent>;
}

interface ContentTypeContribution {
  identify(
    candidate: SourceArtifact,
    context: IdentificationContext,
  ): Promise<MatchResult>;
  normalize(
    candidate: SourceArtifact,
    context: NormalizationContext,
  ): Promise<ContentObservation>;
}
```

## Implementation slices

1. Scaffold Node-only contracts and registries.
2. Extract neutral interfaces from the proof of concept (PoC); retain deprecated façades.
3. Replace concrete backend checks with capability declarations.
4. Add processor, projector, repository, and operation extension points.
5. Add dependency graph and forbidden-import tests.

## Required tests

- **Architecture:** no concrete Git/OCI/filesystem/AAP/APME client in the package.
- **Unit:** duplicate registry IDs, capability negotiation, cancellation, and failure isolation.
- **Compatibility:** existing OCI and EE implementations compile through adapters.
- **Neutrality:** one synthetic content type runs over two synthetic backend capabilities without checking backend IDs.

### Acceptance criteria

- Given an EE candidate from any manifest-capable source, when normalized, then source identity comes from context rather than `'oci'`.
- Given a concrete adapter import is added, when architecture tests run, then CI fails.
- Given incompatible capability requirements, then registration or execution fails with a typed actionable error.

## Security, rollback, and completion

Contracts carry cancellation, identity references, sensitivity, and audit metadata but never credentials. Keep old interfaces as deprecated adapters until consumers migrate. Done means neutral contracts are published, architecture tests pass, and current OCI/EE behavior remains green.
