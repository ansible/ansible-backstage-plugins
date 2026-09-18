# WP-016 — Collection content-type adapter

| Field      | Value                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------- |
| Phase      | 5 — Source expansion                                                                         |
| Depends on | WP-003, WP-004, and WP-015                                                                   |
| Target     | `content-type-collection-node`                                                               |
| Outcome    | Collection semantics operate independently of Git, OCI, Automation Hub, or filesystem source |

## Human summary

**Why this matters:** An Ansible collection should have the same meaning whether it comes from Git, Private Automation Hub (PAH), an Open Container Initiative (OCI) artifact, or a filesystem.

**What will change:** Collection detection, metadata normalization, contained content, and relations will move into a source-neutral Node.js package. It will request capabilities such as file reading instead of checking source names or backend identifiers.

**PR scope:** Preserve current Git and PAH fixtures, implement collection identification and normalization, add compatibility projection, and run one collection corpus through Git and source-neutral OCI, Automation Hub, and filesystem candidates.

**Not in this PR:** This work will not add protocol clients, redefine portable primitive schemas, or take ownership of generic frontend presentation. Later adapter work packages must rerun the shared corpus against their real adapters.

**Success looks like:** Equivalent collection bytes produce equivalent collection semantics across capable sources, unsupported capabilities fail explicitly, and existing Catalog entities and relations remain unchanged.

## Scope and changes

Extract collection detection, normalization, metadata, contained content, and relations into `content-type-collection-node`. Consume adapter capabilities and orchestration-supplied source identity; do not inspect backend IDs. Portable primitive schemas remain in WP-003, and generic presentation remains owned by WP-025. Preserve current Git and PAH collection entity behavior while making the same semantics available to OCI and filesystem candidates where capabilities match.

```ts
const collectionContribution: ContentTypeContribution = {
  requires: ['artifact.file.read'],
  identify: candidate => findGalaxyMetadata(candidate),
  normalize: (candidate, context) =>
    normalizeCollection(candidate, context.source),
};
```

## Implementation slices

1. Freeze Git/PAH collection schema, annotation, relation, and UI fixtures.
2. Implement Node identify/normalize/enumerate behavior against the portable WP-003 contracts.
3. Replace source branches with capability-based reads and supplied source identity.
4. Add the compatibility projection without introducing collection-specific frontend package ownership.
5. Run the same collection corpus through the source-neutral capability/candidate fixture format. Use the already available Git (WP-015) harness directly; create fixture-only OCI, Automation Hub, and filesystem candidate producers from their frozen WP-001/WP-003 contracts when their later published harnesses are unavailable. WP-017/WP-041 must rerun the same corpus against their real adapters before their own completion. Do not add protocol clients or make later WPs completion prerequisites here.

## Required tests

- Metadata present/missing/malformed, versions, namespaces, docs, dependencies, contained plugins, and unknown state.
- Identical collection bytes across real Git and source-neutral OCI/Automation Hub/filesystem candidate fixtures produce equivalent semantic records with distinct source observations; later adapter WPs consume the same fixtures unchanged.
- No backend-ID branch or concrete adapter/protocol import in collection packages.
- Baseline Catalog/frontend fixtures, dynamic registration, cancellation, and bounded reads.
- Malicious archives/paths/metadata and evidence redaction.

### Acceptance criteria

- Given equivalent collection content from two capable sources, normalized collection semantics match apart from source identity.
- Given insufficient capability, applicability fails explicitly rather than source-name branching.
- Given migration, current Git/PAH entities and relations remain equivalent.
- Given package graph checks, portable/Node/frontend runtime boundaries are clean.

## Rollback and completion

Retain existing collection providers as delegating compatibility façades. Done means cross-source fixtures and current-behavior parity pass.
