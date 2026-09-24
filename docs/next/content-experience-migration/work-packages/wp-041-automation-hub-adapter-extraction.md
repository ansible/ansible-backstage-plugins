# WP-041 — Automation Hub adapter extraction

| Field              | Value                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Phase              | 2 — Unified ingestion                                                                                |
| Depends on         | WP-004 and WP-007                                                                                    |
| Source/target      | Current Private Automation Hub (PAH) collection behavior → `backend-adapters/adapter-automation-hub` |
| Frozen source kind | `automation-hub`                                                                                     |
| Outcome            | Reused Hub protocol client behind the neutral source adapter contract                                |

## Human summary

**Why this matters:** Existing Automation Hub collection support must move into the unified ingestion system without changing what users receive or mixing Hub behavior with unrelated Ansible Automation Platform (AAP) controller or container-registry logic.

**What will change:** The existing Galaxy v3 and Pulp protocol client will be moved behind a neutral Automation Hub adapter rather than rewritten. The adapter will preserve collection entities, immutable artifact identity, filtering, pagination, documentation reads, synchronization, drift checks, diagnostics, and failure behavior.

**PR scope:** Freeze current protocol fixtures, move the client with temporary compatibility exports, implement adapter capabilities and the `automation-hub.sync` job contract, add a temporary collection-classifier bridge, and dual-run old and new providers during ownership transfer.

**Not in this PR:** This adapter will not route Automation Hub synchronization through the Open Container Initiative (OCI) path or substitute controller APIs for Hub protocols. Source-independent collection classification remains owned by WP-016.

**Success looks like:** Migrated entities match the baseline, artifact checksums own primitive records, and one failing Hub does not prevent other sources from reconciling or erase prior successful data. All frozen routes, filters, security controls, partial-failure cases, and independent multi-Hub behavior pass their contract tests.

## Scope and changes

Extract authentication and the complete Automation Hub protocol surface required by current behavior: Galaxy v3 collection-version search; Pulp repositories, repository versions/content, collection artifacts, and documentation APIs; repository/name/namespace/version filters; pagination; metadata/artifact/documentation reads; sync, cheap poll/drift, and diagnostic behavior; and failure mapping. Preserve current PAH collection entities while the unified pipeline becomes source of truth. Keep Automation Hub protocol code separate from AAP controller API code and from collection content-type classification.

Own the normalized `automation-hub.sync` job contract and publish its handler/port for WP-012 registration, including repository filters, per-provider outcomes, summary, retained-previous behavior, and the explicit rule that this path never routes to OCI. WP-014 owns only the legacy RHAAP alias.

```ts
export class AutomationHubAdapter implements BackendAdapter {
  readonly id = 'automation-hub';
  capabilities = async () =>
    new Set(['collection.metadata.read', 'artifact.blob.read']);
  // Existing protocol client is wrapped, not rewritten.
}
```

## Implementation slices

1. Freeze Galaxy v3 and Pulp route/filter/pagination/entity/relation/auth/failure fixtures, including sync, poll, and safe diagnostics.
2. Move protocol client unchanged with deprecated re-exports.
3. Implement adapter capabilities and immutable artifact identity.
4. Register against the existing collection classifier through a temporary compatibility bridge; WP-016 later replaces that bridge with the source-independent `content-type-collection-node` contribution.
5. Dual-run and transfer provider/location ownership per source.

## Required tests

- Galaxy v3 collection-version search and filters; Pulp repository/content/artifact/documentation APIs and filters; pagination, namespaces, versions, artifact checksums, missing metadata/docs, auth, rate limits, cancellation, and partial failure.
- Sync fixtures cover changed/unchanged/partial outcomes and retained previous state; poll/drift fixtures prove cheap detection; diagnostics are useful but secret-safe.
- Existing collection entity/annotation/relation parity.
- The temporary classifier bridge uses no source-specific branch in neutral contracts and has an explicit WP-016 removal test.
- Credential redaction, TLS policy, host allowlist/SSRF, bounded downloads, and no controller-token confusion.
- Multiple Hub configurations with independent failure isolation.

### Acceptance criteria

- Given a collection version artifact, its immutable digest/checksum—not mutable latest state—owns primitive records.
- Given one Hub fails, other sources reconcile and prior successful data remains.
- Given migration, projected entities match baseline fixtures.
- Given architecture checks, Hub protocol code appears only in its adapter package.
- Given the frozen protocol ledger, every Galaxy v3/Pulp route and repository filter has a contract fixture and no controller API substitutes for it.

## Rollback and completion

Select old/new provider per source while ensuring one location-key owner. Done means the extracted adapter is the only migrated Hub protocol implementation.
