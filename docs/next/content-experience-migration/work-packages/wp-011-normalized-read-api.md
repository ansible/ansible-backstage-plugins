# WP-011 — Normalized read API

| Field      | Value                                                             |
| ---------- | ----------------------------------------------------------------- |
| Phase      | 4 — Read/write API                                                |
| Depends on | WP-005, WP-009, and WP-013                                        |
| Target     | `content-primitives-backend`                                      |
| Outcome    | Stable REST API over canonical content and primitive repositories |

## Human summary

**Why this matters:** Consumers need one stable, source-neutral way to read normalized content instead of depending on database details or individual source implementations.

**What will change:** A versioned Representational State Transfer (REST) application programming interface (API) will expose content, primitives, provenance, quality information, collections, and contained content items. Responses will use shared contracts with consistent authorization, pagination, limits, and safe errors.

**PR scope:** Define the routes in OpenAPI, implement repository-backed query services and permission checks, generate client bindings, and add contract, integration, resilience, and performance tests.

**Not in this PR:** Operation invocation and jobs belong to WP-012, while search and intent resolution belong to WP-035. Collection detection belongs to WP-016; until then, collection routes use frozen fixtures.

**Success looks like:** Identical canonical data produces consistent API results regardless of its source. Unauthorized callers learn nothing about restricted records, contract drift fails continuous integration, and WP-038 later proves parity with projected surfaces.

## Scope and changes

Implement the authoritative normalized read routes for content list/detail/contained content, primitives, evidence/provenance, quality summaries, and supported historical observations. This WP owns `GET /v1/content`, `GET /v1/content/{contentKey}`, `GET /v1/content/{contentKey}/contents`, `GET /v1/content/{contentKey}/primitives`, `GET /v1/content/{contentKey}/provenance`, `GET /v1/collections`, `GET /v1/collections/{namespace}/{name}`, `GET /v1/content-items`, and `GET /v1/content-items/{fqcn}`. The collection and content-item views query canonical collection/content records produced against WP-003 contracts; they do not import WP-016 or duplicate collection detection. Until WP-016 is available, implement and test the route contracts with frozen WP-001/WP-003 repository fixtures, then require WP-016 to rerun those contracts with real normalized collection output. WP-012 owns operation discovery/invocation/job routes; WP-035 owns search and intent resolution. Define the routes in OpenAPI first and consume shared DTOs/codecs. Enforce caller identity, resource authorization, pagination bounds, response-size limits, correlation IDs, and safe error taxonomy.

```yaml
# Illustrative resource pattern; OpenAPI is authoritative.
/v1/content/{contentKey}/primitives:
  get:
    operationId: listContentPrimitives
    parameters:
      - { name: contentKey, in: path, required: true, schema: { type: string } }
      - { name: cursor, in: query, schema: { type: string } }
```

## Implementation slices

1. Freeze API names, versioning, pagination, errors, and authorization decisions in OpenAPI/ADR.
2. Add repository query services that do not expose database rows.
3. Integrate authenticated routes with the shared WP-013 authorization, redaction, and audit pipeline.
4. Implement the collection summary/detail and content-item list/detail query views, including `q`, type, collection, contained-in, execution-environment alias, optional variant scope, frozen default/max limits, and not-found errors.
5. Add generated/client drift enforcement and compatibility fixtures.
6. Add performance budgets, tracing, metrics, and deployment readiness probes.

## Required tests

- **OpenAPI/contract:** every success/error response validates; generated client is current.
- **Authorization:** anonymous, allowed, denied, cross-source, and redacted evidence cases.
- **Database/integration:** filters, stable cursor pagination, historical reads, empty/unknown/not-scanned states.
- **Collection/content-item contract:** summary/counts/`providedBy`, namespace/name detail and versions, collection/type/contained-in/EE filters, default 50 and maximum 500 behavior, FQCN detail with scoped/all variants, and `COLLECTION_NOT_FOUND`/`ITEM_NOT_FOUND` validate against frozen fixtures and later WP-016 output.
- **Performance:** representative high-cardinality content and primitive sets meet approved latency/size budgets.
- **Resilience:** dependency failures map to typed errors without leaking internals.

### Acceptance criteria

- Given identical canonical fixtures, every REST route exposes consistent digest identity and primitive semantics; WP-018 and WP-038 own projected-surface parity.
- Given an unauthorized caller, no existence, evidence, or source-secret detail is disclosed.
- Given concurrent writes, cursor pagination is stable under the documented consistency contract.
- Given an OpenAPI or DTO change without regeneration, CI fails.
- Given collection records from any capable source, the collection/content-item routes expose source-neutral semantics and never branch on a backend ID.

## Rollback and completion

Routes are additive and can be disabled while repositories remain. Done means public OpenAPI, generated clients, authorization, contract tests, and SLO instrumentation are green.
