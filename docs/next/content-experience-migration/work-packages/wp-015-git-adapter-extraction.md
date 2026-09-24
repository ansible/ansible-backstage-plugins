# WP-015 — Git adapter extraction

| Field         | Value                                                          |
| ------------- | -------------------------------------------------------------- |
| Phase         | 5 — Source expansion                                           |
| Depends on    | WP-004 and WP-007                                              |
| Source/target | Existing Git catalog behavior → `backend-adapters/adapter-git` |
| Outcome       | Provider-neutral Git ingestion with immutable commit identity  |

## Human summary

**Why this matters:** Git-hosting details should not leak into the shared ingestion model, and content identity must remain stable even when a branch or tag moves.

**What will change:** GitHub and GitLab discovery and reading will move behind a provider-neutral Git adapter, together with Gitea unless the required owner-approved dated deviation is attached. Observations will resolve branches and tags to immutable commit identifiers and expose normalized source registration, synchronization, file reading, and continuous integration (CI) operations.

**PR scope:** Extract transport, credentials, reference, and path handling; implement adapter discovery and reads; preserve existing behavior; and test provider parity, authentication, cancellation, limits, path safety, secret handling, and server-side request forgery protections.

**Not in this PR:** Legacy Hypertext Transfer Protocol (HTTP) route ownership remains with WP-014, and source-neutral collection interpretation belongs to WP-016. Provider-specific clients will not become part of neutral contracts.

**Success looks like:** Moved branches create new immutable observations without losing old state, unsafe paths are rejected before access, one failed repository does not block others, and old and new entity results match for two full reconciliations. Gitea fixtures pass, or unsupported Gitea configuration is rejected and the complete approved deviation is recorded.

## Scope and changes

Extract cloning/fetching, refs, commit resolution, path filters, default branch, sparse reads, and repository metadata behind `BackendAdapter`. Implement GitHub, GitLab, and Gitea integration discovery, authentication, organizations/repositories/refs/files, webhook or polling inputs, error mapping, and contract fixtures. If Gitea cannot ship in the target release, stop implementation until an architecture/product owner approves the dated deviation required by the canonical plan; nominal interface support is insufficient. Keep provider-specific clients out of neutral contracts. Normalize branch/tag observations to commit SHA and preserve current Ansible Git content behavior.

Own normalized `content.source.git.register`, `content.source.git.deregister`, `git.sync`, `git.file.read`, and `git.ci.batch` query/operation contracts. Preserve the six-field file query, authorization failure code, manual-only deregistration, duplicate `409` entity reference, CI nonempty/max-100 uniqueness, concurrency-five, and per-page-100 behavior from WP-001. Publish handlers/ports for WP-012 registration; WP-014 retains legacy HTTP ownership.

```ts
interface GitResolvedArtifact extends ResolvedArtifact {
  digest: `git:${string}`; // Canonical encoding finalized by identity ADR.
  observedRef: string;
  repositoryUrl: string;
  commitSha: string;
  path: string;
}
```

## Implementation slices

1. Freeze current Git provider fixtures and URI/path behavior.
2. Extract transport/credential/ref/path logic with compatibility exports.
3. Implement adapter discovery/resolve/read capabilities.
4. Implement Gitea and its contract fixtures, or attach the complete owner-approved dated deviation and reject unsupported Gitea configuration clearly.
5. Cut over per source and disable direct provider discovery.

## Required tests

- **Unit:** URLs, refs, SHA resolution, path traversal rejection, filters, subdirectories, and pagination.
- **Integration:** GitHub, GitLab, and Gitea discovery/read/reconciliation, private repo auth, ref movement, large repo bounds, cancellation, and partial failures; an approved Gitea deviation replaces only the Gitea cases it explicitly lists.
- **Parity:** current entities/relations/annotations remain equivalent.
- **Security:** host allowlist, secret redaction, no credentials in source URIs, bounded archive/file reads, and SSRF protections.

### Acceptance criteria

- Given a branch moves, a new immutable commit observation is created and old digest-owned state remains.
- Given a path escapes the configured root, the adapter rejects it before filesystem access.
- Given one repository fails, other sources reconcile and prior successful state is retained.
- Given migration, old and new entity fixtures match for two full reconciliations.
- Given the release gate, Gitea fixtures pass or the complete dated deviation names the release, owner, tracking issue, unsupported UI/config behavior, and removal date.

## Rollback and completion

Feature-flag per source and preserve old provider/location ownership until cutover. Done means no current provider bypasses the adapter for migrated sources.
