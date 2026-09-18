# WP-033 — Lexical search collator

| Field      | Value                                                                       |
| ---------- | --------------------------------------------------------------------------- |
| Phase      | 10 — Search, MCP, quality gates                                             |
| Depends on | WP-013, WP-018, and WP-019                                                  |
| Target     | Search backend module/projector                                             |
| Outcome    | Authorization-aware lexical discovery derived from canonical content events |

## Human summary

**Why this matters:** Users need fast keyword-based discovery of canonical content without exposing results, snippets, counts, or evidence they are not allowed to see.

**What will change:** A versioned lexical, or keyword-based, search document will be built from canonical content and primitive events and projected into Backstage Search. The index will support safe updates, deletion, restart, and full rebuilding.

**PR scope:** Define approved indexed fields, implement event-to-document mapping and checkpointed processing, connect search queries and user-interface results, enforce deny-by-default authorization, and add relevance and operational checks.

**Not in this PR:** Backstage Catalog entities will not be used as the search source of truth, and the search index will not become canonical storage. Meaning-based semantic search and its production authorization binding are handled separately.

**Success looks like:** Incremental indexing and a full rebuild produce equivalent results, unauthorized content leaves no prohibited trace, and losing the search index never damages canonical data.

## Scope and changes

Define a versioned search document contract and project approved content metadata plus selected WP-019 primitive state/evidence from canonical content/primitive events into Backstage Search. WP-018 supplies shared entity identity/visibility attributes, not authorization policy, and its Catalog entities are never the Search source of truth. Catalog and Search remain sibling, independently rebuildable projections. Search uses a deny-by-default `SearchAuthorizationPort` whose contract fixtures mirror WP-013; WP-035 later binds the shared production authorization/client path. Do not index secrets or unrestricted evidence. Updates/deletes are idempotent and rebuildable; search is not canonical state.

```ts
interface ContentSearchDocument {
  type: 'ansible-content';
  documentVersion: string;
  location: string;
  title: string;
  text: string;
  authorizationResource: { sourceId: string; contentKey: string };
}
```

## Implementation slices

1. Approve indexed fields, permission filtering, stale/delete, and rebuild policy.
2. Implement pure canonical-event/repository-to-search mapping and versioned document IDs; reject Catalog entity ingestion.
3. Add outbox consumer/checkpoints with full rebuild.
4. Integrate query/UI and enforce authorization before result disclosure.
5. Add relevance fixtures, lag/readiness metrics, and rebuild runbook.

## Required tests

- Golden document mapping, Unicode/tokenization, duplicate/out-of-order events, deletion, restart, and rebuild equivalence.
- Permission filtering for mixed authorized/unauthorized results, snippets, counts, and facets.
- Authorization-port conformance denies by default and publishes fixtures for WP-035/WP-013 production binding.
- Secret/evidence exclusion and malicious text handling.
- Representative corpus relevance and approved latency/index-size budgets.
- Search result identity/deep links match REST content digests.
- Architecture tests prove the collator reads canonical event/query contracts and never Catalog storage or projected entities.

### Acceptance criteria

- Given canonical state and a rebuild, incremental and rebuilt indexes are equivalent.
- Given an unauthorized record, title/snippet/facet/count do not disclose its existence beyond approved semantics.
- Given search infrastructure loss, canonical state is unaffected and index reconstruction succeeds.
- Given a changed mutable ref, results make current observation and immutable digest unambiguous.

## Rollback and completion

Disable the collator/query contribution and rebuild the previous index version. Done means authorization, relevance, rebuild, lag, and deletion tests pass.
