# WP-035 — Intent and hybrid search API

| Field      | Value                                                                        |
| ---------- | ---------------------------------------------------------------------------- |
| Phase      | 10 — Search, MCP, quality gates                                              |
| Depends on | WP-005, WP-011, WP-013, WP-021, WP-033, and WP-034                           |
| Target     | Normalized content API and shared client                                     |
| Outcome    | Versioned lexical/semantic/intent resolution with permission-safe visibility |

## Human summary

**Why this matters:** Clients need one permission-safe application programming interface (API) for keyword, meaning-based, and intent-aware search, as well as honest answers about whether available content satisfies version requirements.

**What will change:** Versioned search, intent-resolution, and requirements-resolution endpoints will combine authorized keyword results, optional semantic candidates, and approved intent data. Responses will explain identity, observed versions, ranking or resolution provenance, uncertainty, pagination, and degraded operation.

**PR scope:** Define the documented request and response contracts, implement authorized retrieval and stable ranking, resolve exact or wildcard version requirements, publish shared client methods, and add frontend, relevance, fallback, and audit coverage.

**Not in this PR:** This work will not create replacement data-transfer objects, route hosting, or authorization policy when required shared contracts are unavailable. Hidden content and hidden corpus statistics will not be used in visible output beyond the approved policy.

**Success looks like:** Results and cursors are stable for the same user and index versions, restricted content does not leak, and a semantic-search outage cleanly falls back to documented keyword-only behavior.

## Scope and changes

Add OpenAPI-defined `/v1/search`, `/v1/intent:resolve`, and `/v1/requirements:resolve` routes. Search/intent combine lexical results, semantic candidates, and approved intent primitive filters/ranking. Requirements resolution accepts exact versions or `*` constraints and returns satisfied, unsatisfied, and honestly unknown notes against authorized canonical collection/content observations. Authorization filtering occurs before disclosure and final ranking/resolution. Responses expose immutable subject identity, observed ref, score or resolution provenance/type, semantic state, pagination where applicable, and degraded-mode information without leaking hidden corpus statistics.

This WP consumes the frozen WP-005 data-transfer-object/client contracts, WP-011 route host, WP-013 production authorization and audit pipeline, and WP-034 semantic projection. Authorization filtering uses WP-013 before disclosure and ranking. Missing publication or exit evidence for any named prerequisite blocks implementation; it does not permit a second client, route host, or authorization policy.

```yaml
/v1/search:
  post:
    operationId: searchContent
    # Body includes query, mode, intent filters, cursor and bounded limit.
/v1/requirements:resolve:
  post:
    operationId: resolveContentRequirements
    # Body contains bounded requirement names and exact-or-* constraints.
```

## Implementation slices

1. Freeze search, intent, and requirements request/response contracts, including exact-or-`*` resolution, ranking/fusion, visibility, pagination, uncertainty, and degraded modes.
2. Implement permission-aware lexical retrieval and optional semantic retrieval.
3. Add intent primitive filtering/resolution, requirements resolution over authorized canonical observations, and stable ranking/cursors.
4. Publish shared client methods and frontend integration.
5. Add relevance, authorization, latency, fallback, drift, and audit metrics.

## Required tests

- OpenAPI/client drift, validation, cursor stability, deterministic tie-breaking, and malformed input.
- Mixed authorized/unauthorized corpus: no result/snippet/count/facet/score/timing disclosure beyond policy.
- Lexical-only fallback, vector outage, stale projection, unknown/not-scanned intent, and cancellation.
- Labeled relevance corpus for lexical, semantic, hybrid, and intent-filter modes.
- Requirements fixtures cover exact and `*` constraints, satisfied/unsatisfied mixes, duplicates, unavailable metadata, unknown state, restricted candidates, and bounded input/output.
- Digest/ref identity and state parity with REST detail/Catalog/frontend.

### Acceptance criteria

- Given semantic service outage, API returns documented lexical fallback without failing canonical services.
- Given restricted content, it cannot influence visible output in a way prohibited by the visibility contract.
- Given unknown intent data, the API does not treat it as a negative match unless explicitly requested.
- Given identical index versions/request/principal, ranking and cursor progression are stable.
- Given unavailable or hidden candidate metadata, requirements resolution reports only policy-approved unknown/unsatisfied semantics and leaks no hidden candidate identity.

## Rollback and completion

Disable semantic/hybrid modes and retain lexical endpoint behavior. Done means client, visibility, fallback, relevance, and performance gates pass.
