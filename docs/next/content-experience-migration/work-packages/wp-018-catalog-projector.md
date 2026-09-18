# WP-018 — Catalog projector

| Field      | Value                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------ |
| Phase      | 6 — Projection and processors                                                              |
| Depends on | WP-009 and WP-010                                                                          |
| Target     | `content-primitives-backend` plus catalog backend module façade                            |
| Outcome    | Idempotent Catalog projection from canonical events rather than duplicate source discovery |

## Human summary

**Why this matters:** The Backstage Catalog should be a reliable view of canonical content, not another component that independently discovers sources and risks producing conflicting records.

**What will change:** A projector will consume durable events from WP-010 and deterministically create Catalog entities, annotations, relations, provider ownership, and location keys. Checkpoints, retries, dead letters, deletion handling, and duplicate-event safety will be explicit.

**PR scope:** Freeze current Catalog fixtures, implement pure canonical-to-Catalog mapping and the event consumer, compare shadow projections, and transfer ownership only after two successful reconciliations and drift checks.

**Not in this PR:** This projector will not discover sources or produce canonical observations. Unified ingestion rollout and source cutover remain producer responsibilities outside this work package.

**Success looks like:** Projected graphs match the existing normalized fixtures, duplicate or out-of-order events create no duplicate entities or relations, failed reconciliations retain prior successful data, and exactly one component owns each provider name and location key.

## Scope and changes

Consume WP-010 outbox events over the WP-009 repositories and project deterministic Catalog entities, annotations, relations, location keys, and provider ownership. Preserve current entity refs and relation semantics. Projector state/checkpoints are durable, duplicate delivery is safe, failures are observable, and deletion/tombstone handling is explicit. The unified ingestion rollout in WP-007 is a producer/cutover concern, not an additional register dependency for implementing this projector.

```ts
const mutation = {
  type: 'full' as const,
  entities: observations.map(o => ({
    entity: toCatalogEntity(o),
    locationKey: stableLocationKey(o.source.id),
  })),
};
```

## Implementation slices

1. Freeze current entities/relations/provider/location fixtures.
2. Implement pure canonical-observation-to-entity mapping.
3. Add idempotent event consumer, checkpoint, retry, and dead-letter behavior.
4. Run shadow projection and compare normalized entity graphs.
5. Transfer ownership only after two successful full reconciliations and drift polling.

## Required tests

- **Golden:** exact entities, annotations, relations, refs, provider names, and location keys.
- **Idempotency:** duplicate/out-of-order events and restart converge.
- **Deletion:** source removal, artifact deletion, failed reconciliation, and tombstone policy.
- **Integration:** Catalog mutation APIs, permission filters, multiple sources, and scale.
- **Operations:** lag, failures, dead letters, last checkpoint, drift, and health details.

### Acceptance criteria

- Given canonical observations, projected entity graphs match WP-001 fixtures after normalization.
- Given duplicate delivery, no duplicate entity or relation appears.
- Given a failed reconciliation, prior successful Catalog data is retained according to policy.
- Given cutover, exactly one component owns each provider name/location key.

## Rollback and completion

Pause the new projector and restore legacy ownership without deleting canonical state; reconcile before switching. Done means Catalog is demonstrably a projection and no migrated provider discovers sources directly.
