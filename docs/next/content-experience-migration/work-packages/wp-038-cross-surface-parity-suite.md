# WP-038 — Cross-surface parity suite

| Field      | Value                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------- |
| Phase      | 10 — Search, MCP, quality gates                                                           |
| Depends on | WP-007, WP-009, WP-011, WP-018, WP-026, WP-032, WP-033, WP-034, WP-035, and WP-037        |
| Outcome    | One corpus proves semantic, identity, authorization, and lifecycle parity across surfaces |

## Human summary

**Why this matters:** The same content or operation must mean the same thing everywhere users encounter it. A shared parity suite prevents the database, catalog, search, user interface, Scaffolder, and Model Context Protocol (MCP) tools from quietly disagreeing.

**What will change:** A canonical set of fixtures and lifecycle scenarios will compare normalized identity, state, authorization, provenance, operations, failures, deletion, replay, and stale-data behavior across every available surface.

**PR scope:** Add the fixture corpus, surface adapters, lifecycle scenarios, static and dynamic deployment runs, continuous integration reports, release gates, and a controlled exception process.

**Not in this PR:** This work will not implement optional surfaces whose owning work packages are incomplete. Missing adapters will be reported as `not-yet-applicable`, never treated as passing.

**Success looks like:** Every applicable surface produces the same normalized meaning for each fixture and principal, including unknown and partial states. Restarts, duplicate events, reference movement, outages, and rebuilds all converge back to parity.

## Scope and changes

Build a canonical fixture corpus and assertions spanning ingestion, PostgreSQL, REST, Catalog, lexical/semantic search, frontend including extracted APME, MCP, Scaffolder operations, jobs, and legacy aliases. The direct dependencies guarantee live ingestion, persistence, REST, Catalog, lexical search, hybrid-search API, Scaffolder, extracted APME, and MCP harnesses; those mandatory cells may not be replaced by fixture-only substitutes. WP-034 guarantees semantic-search contracts and a tested projection, but its live parity cell is mandatory only when architecture, security, privacy, and legal approvals enable that surface. Otherwise the cell records `disabled-by-approved-policy`, is not counted as a pass, and does not block unrelated cells or cutovers. All other surfaces are optional matrix adapters discovered through their published contract fixtures: WP-014 legacy aliases, WP-020/WP-021 processors, WP-025 generic frontend, WP-027 AAP operations, and WP-042 source administration join only when their exit evidence is available. Their absence is recorded as `not-yet-applicable`, never counted as pass, and blocks only that surface's later cutover/release gate. Compare normalized semantics rather than presentation-only strings. Cover immutable digests, mutable refs, all primitive states, permissions, partial failure, retries, deletion, replay, and stale data.

```ts
interface SurfaceSnapshot {
  subject: ContentSubject;
  primitiveStates: Record<string, PrimitiveState>;
  operations: string[];
  authorization: 'visible' | 'hidden' | 'denied';
  provenanceDigest?: string;
}
```

## Implementation slices

1. Select representative content/source/principal/failure fixtures.
2. Add surface adapters that normalize responses into `SurfaceSnapshot`.
3. Add lifecycle scenarios: ingest, ref move, process, project, search, operate, delete, replay.
4. Run in static and representative dynamic deployments.
5. Add CI/release reports and a controlled exception process.

## Required tests

- REST/Catalog/search/UI/MCP agree on content identity and semantic state.
- Semantic-search parity passes when the surface is approved and enabled; otherwise the matrix records the approval evidence and `disabled-by-approved-policy` without treating it as a pass.
- Unauthorized content is absent/denied consistently without search or count leaks.
- Legacy aliases remain equivalent when the WP-014 adapter is present; otherwise the cell is explicitly not-yet-applicable.
- Duplicate events/restarts/rebuilds converge to the same snapshot.
- AAP operations and jobs show consistent IDs/status/errors across UI, Scaffolder, REST, and MCP when WP-027 fixtures are present; absence never produces a false pass.

### Acceptance criteria

- Given one fixture/principal, all applicable surfaces normalize to the same subject and primitive semantics.
- Given unknown/not-scanned/partial/failed, no surface converts it to a known negative fact.
- Given ref movement, all surfaces distinguish observed ref from immutable digest.
- Given a projector/search outage and recovery, rebuilt snapshots return to parity.

## Rollback and completion

The suite is additive; failures block the affected cutover. Done means all enabled matrix cells available from canonical dependencies pass; policy-disabled semantic search records `disabled-by-approved-policy`; and optional adapters are either passing or explicitly not-yet-applicable with owning WP. A surface's own cutover cannot complete until its cells pass or have a dated owner-approved exception tied to a release.
